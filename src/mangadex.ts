import { setTimeout as wait } from 'node:timers/promises'
import { retryAfterMilliseconds } from './source-rate-limit'

const API = 'https://api.mangadex.org'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RATINGS = ['safe', 'suggestive', 'erotica', 'pornographic']
type Context = { config: Record<string, string>; signal?: AbortSignal }
type Entity = { id: string; type?: string; attributes: Record<string, any>; relationships?: Array<{ id: string; type: string; attributes?: Record<string, any> }> }
type Page = { sourcePageId: string; position: number; sourceUrl: string; thumbnailUrl: string }
function uuid(id: string) { if (!UUID.test(id)) throw new Error('Expected a MangaDex UUID'); return id.toLowerCase() }
function settings(ctx: Context) {
  const language = (ctx.config.language || 'en').trim().toLowerCase()
  if (!/^[a-z]{2,3}(?:-[a-z]{2,4})?$/.test(language)) throw new Error('Use a MangaDex language code such as en, id, or pt-br')
  const rating = ctx.config.rating || 'suggestive'
  if (!RATINGS.includes(rating)) throw new Error('Invalid MangaDex content rating')
  const quality = ctx.config.quality || 'original'
  if (!['original', 'data-saver'].includes(quality)) throw new Error('Invalid image quality')
  return { language, ratings: RATINGS.slice(0, RATINGS.indexOf(rating) + 1), quality }
}
function localized(value: Record<string, string> | undefined, language: string) {
  return value?.[language] || value?.en || Object.values(value || {}).find(text => typeof text === 'string' && text) || ''
}
export function mangaSummary(manga: Entity, language: string) {
  const id = uuid(manga.id), a = manga.attributes
  const author = (manga.relationships || []).filter(r => r.type === 'author').map(r => r.attributes?.name).filter(Boolean).join(', ') || null
  const file = manga.relationships?.find(r => r.type === 'cover_art')?.attributes?.fileName
  return {
    sourceSite: 'mangadex', sourceNovelId: `${id}:${language}`, sourceUrl: `https://mangadex.org/title/${id}`, indexUrl: `${API}/manga/${id}/feed`,
    titleOriginal: localized(a.title, language) || (a.altTitles || []).map((t: Record<string, string>) => localized(t, language)).find(Boolean) || 'Untitled manga',
    author, description: localized(a.description, language) || null, category: a.publicationDemographic || null,
    wordCountLabel: null, sourceStatus: a.status || null, sourceUpdatedAt: a.updatedAt || null,
    coverUrl: typeof file === 'string' ? `https://uploads.mangadex.org/covers/${id}/${encodeURIComponent(file)}.256.jpg` : null,
    tags: (a.tags || []).map((t: Entity) => localized(t.attributes.name, language)).filter(Boolean),
    language, publisher: null, favoriteCount: null
  }
}
export function resolveMangaDexUrl(input: string) {
  const url = new URL(input)
  if (url.protocol !== 'https:' || !['mangadex.org', 'www.mangadex.org'].includes(url.hostname) || url.username || url.password) throw new Error('Expected a MangaDex title URL')
  const match = url.pathname.match(/^\/title\/([^/]+)(?:\/[^/]*)?\/?$/)
  if (!match) throw new Error('Use a MangaDex /title/ URL, not a chapter URL')
  return { id: uuid(match[1]) }
}
export function searchUrl(params: { query?: string; page?: number; sort?: string; status?: string }, ctx: Context) {
  const { language, ratings } = settings(ctx), page = params.page ?? 1
  if (!Number.isInteger(page) || page < 1 || page > 500) throw new Error('MangaDex search supports pages 1–500')
  const url = new URL(`${API}/manga`)
  url.searchParams.set('limit', '20'); url.searchParams.set('offset', String((page - 1) * 20))
  const query = params.query?.trim()
  if (query) url.searchParams.set('title', query)
  const order = { latest: 'latestUploadedChapter', popular: 'followedCount', rating: 'rating', title: 'title' }[params.sort || 'latest']
  if (!order) throw new Error('Unsupported MangaDex sort')
  url.searchParams.set(`order[${order}]`, order === 'title' ? 'asc' : 'desc')
  if (params.status && params.status !== 'all') {
    if (!['ongoing', 'completed', 'hiatus', 'cancelled'].includes(params.status)) throw new Error('Invalid publication status')
    url.searchParams.append('status[]', params.status)
  }
  url.searchParams.append('availableTranslatedLanguage[]', language)
  for (const rating of ratings) url.searchParams.append('contentRating[]', rating)
  for (const include of ['cover_art', 'author']) url.searchParams.append('includes[]', include)
  return url
}

// One release per numbered chapter/volume/language. The oldest available release wins
// so adding another scanlation does not reorder a book that is already in the library.
export function chapterPages(chapters: Entity[], language: string, quality: string): Page[] {
  const ids = new Set<string>(), groups = new Set<string>()
  const ordered = [...chapters].filter(c => c.attributes.translatedLanguage === language && !c.attributes.externalUrl && Number.isInteger(c.attributes.pages) && c.attributes.pages > 0)
  const compare = new Intl.Collator('en', { numeric: true }).compare
  ordered.sort((a, b) => compare(String(a.attributes.volume ?? ''), String(b.attributes.volume ?? '')) || compare(String(a.attributes.chapter ?? ''), String(b.attributes.chapter ?? '')) || String(a.attributes.publishAt || '').localeCompare(String(b.attributes.publishAt || '')) || a.id.localeCompare(b.id))
  const pages: Page[] = []
  for (const chapter of ordered) {
    const id = uuid(chapter.id), a = chapter.attributes
    if (ids.has(id)) continue
    ids.add(id)
    const group = a.chapter == null || a.chapter === '' ? id : JSON.stringify([a.volume ?? '', a.chapter, language])
    if (groups.has(group)) continue
    groups.add(group)
    if (pages.length + a.pages > 100000) throw new Error('MangaDex title exceeds the supported 100,000-page manifest size')
    for (let index = 0; index < a.pages; index++) {
      // A stable locator consumed by asset(), not an expiring CDN URL.
      const url = `${API}/at-home/server/${id}#inkrail-page=${index}&quality=${quality}`
      pages.push({ sourcePageId: `${id}:${index + 1}`, position: pages.length + 1, sourceUrl: url, thumbnailUrl: url })
    }
  }
  return pages
}

export function createMangaDex(fetcher: typeof fetch = fetch, paceMs = 300) {
  let apiNext = 0, atHomeNext = 0
  let queue: Promise<unknown> = Promise.resolve()
  const homes = new Map<string, { expires: number; value: any }>()
  const pendingHomes = new Map<string, Promise<any>>()
  const metadataCache = new Map<string, { expires: number; value: any }>()
  async function response(url: string | URL, ctx: Context, api = false): Promise<Response> {
    if (api) {
      const task = queue.then(async () => {
        const now = Date.now(), home = new URL(url).pathname.startsWith('/at-home/')
        const delay = Math.max(0, apiNext - now, home ? atHomeNext - now : 0)
        if (delay) await wait(delay, undefined, { signal: ctx.signal })
        apiNext = Date.now() + paceMs
        if (home) atHomeNext = Date.now() + (paceMs ? 1600 : 0)
      })
      queue = task.catch(() => {}); await task
    }
    const signal = ctx.signal ? AbortSignal.any([ctx.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000)
    const result = await fetcher(url, { headers: { 'User-Agent': 'Inkrail-MangaDex/1.0', accept: api ? 'application/json' : 'image/*' }, signal })
    if (result.status === 429) {
      const reset = Number(result.headers.get('x-ratelimit-retry-after')) * 1000
      const ms = Number.isFinite(reset) && reset > Date.now() ? reset - Date.now() : retryAfterMilliseconds(result.headers.get('retry-after'))
      apiNext = Math.max(apiNext, Date.now() + ms)
      throw Object.assign(new Error('MangaDex rate limit reached; retry after the cooldown'), { statusCode: 429, data: { retryAfterMs: ms } })
    }
    if (!result.ok) throw Object.assign(new Error(`MangaDex returned HTTP ${result.status}`), { statusCode: result.status })
    return result
  }
  async function json(url: string | URL, ctx: Context) {
    const result = await (await response(url, ctx, true)).json()
    if (result.result !== 'ok') throw new Error('MangaDex returned an unsuccessful API result')
    return result
  }
  async function feed(id: string, ctx: Context) {
    const { language, ratings } = settings(ctx), chapters: Entity[] = []
    let offset = 0, total = Infinity
    while (offset < total) {
      if (offset >= 10000) throw new Error('MangaDex chapter feed exceeds the API pagination limit; refusing a partial book')
      const url = new URL(`${API}/manga/${uuid(id)}/feed`)
      for (const [key, value] of Object.entries({ limit: '500', offset: String(offset), 'translatedLanguage[]': language, 'order[volume]': 'asc', 'order[chapter]': 'asc', includeExternalUrl: '0' })) url.searchParams.set(key, value)
      for (const rating of ratings) url.searchParams.append('contentRating[]', rating)
      const result = await json(url, ctx)
      if (!Array.isArray(result.data) || !Number.isInteger(result.total) || result.total < 0) throw new Error('Invalid MangaDex chapter feed')
      total = result.total
      if (!result.data.length && offset < total) throw new Error('Incomplete MangaDex chapter feed')
      chapters.push(...result.data); offset += result.data.length
    }
    return chapters
  }
  async function search(params: Parameters<typeof searchUrl>[0], ctx: Context) {
    const result = await json(searchUrl(params, ctx), ctx)
    if (!Array.isArray(result.data) || !Number.isInteger(result.total)) throw new Error('Invalid MangaDex search response')
    return { results: result.data.map((m: Entity) => mangaSummary(m, settings(ctx).language)), page: params.page || 1, hasNext: (params.page || 1) * 20 < Math.min(result.total, 10000) }
  }
  async function metadata({ id, forceRefresh = false }: { id: string; forceRefresh?: boolean }, ctx: Context) {
    const requestedId = id, parts = id.split(':')
    if (parts.length > 2) throw new Error('Invalid MangaDex title identity')
    id = uuid(parts[0])
    if (parts[1]) ctx = { ...ctx, config: { ...ctx.config, language: parts[1] } }
    const selected = settings(ctx), key = `${requestedId}:${JSON.stringify(selected)}`
    const cached = metadataCache.get(key)
    if (cached && cached.expires > Date.now() && !forceRefresh) return cached.value
    const url = new URL(`${API}/manga/${id}`)
    for (const include of ['cover_art', 'author']) url.searchParams.append('includes[]', include)
    const result = await json(url, ctx)
    if (result.data?.id !== id || !result.data?.attributes) throw new Error('MangaDex returned an invalid title')
    if (!selected.ratings.includes(result.data.attributes.contentRating)) throw new Error('This title is excluded by the MangaDex content-rating setting')
    const pages = chapterPages(await feed(id, ctx), selected.language, selected.quality)
    if (!pages.length) throw new Error(`No hosted MangaDex chapters in ${selected.language}. External-only chapters cannot be downloaded.`)
    const value = { ...mangaSummary(result.data, selected.language), sourceNovelId: requestedId, pages }
    if (metadataCache.size >= 8) metadataCache.delete(metadataCache.keys().next().value!)
    metadataCache.set(key, { expires: Date.now() + 60000, value }); return value
  }
  async function home(id: string, ctx: Context, fresh = false) {
    if (fresh) homes.delete(id)
    const cached = homes.get(id); if (cached && cached.expires > Date.now()) return cached.value
    const pending = pendingHomes.get(id); if (pending) return pending
    const task = json(`${API}/at-home/server/${id}?forcePort443=true`, ctx).then(value => {
      const base = new URL(value.baseUrl)
      if (base.protocol !== 'https:' || base.username || base.password || !/^[a-f0-9]+$/i.test(value.chapter?.hash) || !Array.isArray(value.chapter?.data) || !Array.isArray(value.chapter?.dataSaver)) throw new Error('Invalid MangaDex image server response')
      if (homes.size >= 64) homes.delete(homes.keys().next().value!)
      homes.set(id, { expires: Date.now() + 60000, value }); return value
    })
    pendingHomes.set(id, task)
    try { return await task } finally { pendingHomes.delete(id) }
  }
  async function binary(url: string, ctx: Context, report = false) {
    const started = Date.now(); let size = 0, success = false, cached = false
    try {
      const result = await response(url, ctx)
      cached = result.headers.get('x-cache')?.startsWith('HIT') === true
      if (!result.body || !result.headers.get('content-type')?.startsWith('image/')) throw new Error('MangaDex did not return an image')
      const chunks: Uint8Array[] = []
      for await (const chunk of result.body) { size += chunk.length; if (size > 24 * 1024 * 1024) throw new Error('MangaDex image exceeds 24 MiB'); chunks.push(chunk) }
      success = true; return { base64: Buffer.concat(chunks).toString('base64') }
    } finally {
      // Required health feedback for volunteer image nodes; never includes credentials.
      const host = new URL(url).hostname
      if (report && host !== 'mangadex.org' && !host.endsWith('.mangadex.org')) {
        await fetcher('https://api.mangadex.network/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, success, cached, bytes: size, duration: Date.now() - started }), signal: AbortSignal.timeout(3000) }).catch(() => undefined)
      }
    }
  }
  async function asset({ url }: { url: string }, ctx: Context) {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) throw new Error('Invalid MangaDex asset URL')
    if (parsed.hostname === 'uploads.mangadex.org' && /^\/covers\//.test(parsed.pathname)) return binary(parsed.href, ctx)
    const match = parsed.pathname.match(/^\/at-home\/server\/([^/]+)$/)
    if (parsed.hostname !== 'api.mangadex.org' || !match) throw new Error('Expected a MangaDex page locator or cover URL')
    const id = uuid(match[1]), params = new URLSearchParams(parsed.hash.slice(1)), rawPage = params.get('inkrail-page')
    if (rawPage === null || !/^\d+$/.test(rawPage)) throw new Error('Invalid MangaDex page locator')
    const index = Number(rawPage), quality = params.get('quality') || settings(ctx).quality
    if (!Number.isSafeInteger(index) || !['original', 'data-saver'].includes(quality)) throw new Error('Invalid MangaDex image quality or page')
    for (let attempt = 0; attempt < 2; attempt++) {
      const server = await home(id, ctx, attempt > 0)
      const files = quality === 'data-saver' ? server.chapter.dataSaver : server.chapter.data
      const file = files[index]
      if (typeof file !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(file)) throw new Error('MangaDex page no longer exists; refresh the title')
      try { return await binary(`${server.baseUrl.replace(/\/$/, '')}/${quality === 'data-saver' ? 'data-saver' : 'data'}/${server.chapter.hash}/${encodeURIComponent(file)}`, ctx, true) }
      catch (error: any) { if (attempt || ctx.signal?.aborted || error.statusCode === 429 || (error.statusCode && ![403, 404].includes(error.statusCode) && error.statusCode < 500)) throw error }
    }
    throw new Error('MangaDex image retrieval failed')
  }
  return { search, browse: search, metadata, pages: async (params: { id: string }, ctx: Context) => (await metadata(params, ctx)).pages, asset, resolve: ({ url }: { url: string }, ctx: Context) => ({ id: `${resolveMangaDexUrl(url).id}:${settings(ctx).language}` }) }
}
export default createMangaDex()
