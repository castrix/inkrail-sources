import { describe, it, expect, vi } from 'vitest'
import { chapterPages, mangaChapterDirectory, createMangaDex, mangaSummary, resolveMangaDexUrl, searchUrl } from '../src/mangadex'

const mangaId = '11111111-1111-4111-8111-111111111111'
const chapterId = '22222222-2222-4222-8222-222222222222'
const secondId = '33333333-3333-4333-8333-333333333333'
const thirdId = '44444444-4444-4444-8444-444444444444'
const ctx = { config: {} }
const title = { id: mangaId, attributes: { title: { en: 'Test manga', id: 'Manga uji' }, description: { en: 'Synthetic fixture' }, contentRating: 'safe', status: 'ongoing', tags: [{ attributes: { name: { en: 'Adventure' } } }] }, relationships: [{ id: 'author', type: 'author', attributes: { name: 'Example author' } }, { id: 'cover', type: 'cover_art', attributes: { fileName: 'cover.jpg' } }] }
function chapter(id = chapterId, number = '1', extra = {}) { return { id, attributes: { pages: 2, translatedLanguage: 'en', volume: '1', chapter: number, publishAt: '2024-01-01T00:00:00Z', externalUrl: null, ...extra } } }
const ok = (value: any) => new Response(JSON.stringify({ result: 'ok', ...value }), { headers: { 'content-type': 'application/json' } })
function mocked(responses: Response[]) { const fetcher = vi.fn(); for (const r of responses) fetcher.mockResolvedValueOnce(r); return { fetcher, source: createMangaDex(fetcher, 0) } }

describe('MangaDex source', () => {
  it('uses paginated official API queries and language/rating settings', () => {
    const url = searchUrl({ query: 'test & title', page: 2, sort: 'popular', status: 'completed' }, { config: { language: 'id', rating: 'safe' } })
    expect(url.origin).toBe('https://api.mangadex.org')
    expect(url.searchParams.get('offset')).toBe('20')
    expect(url.searchParams.get('title')).toBe('test & title')
    expect(url.searchParams.getAll('contentRating[]')).toEqual(['safe'])
    expect(url.searchParams.get('availableTranslatedLanguage[]')).toBe('id')
    expect(url.searchParams.get('order[followedCount]')).toBe('desc')
    expect(() => searchUrl({ page: 501 }, ctx)).toThrow()
  })
  it('normalizes metadata and gives each reading language a stable identity', () => {
    expect(mangaSummary(title, 'id')).toMatchObject({ sourceNovelId: `${mangaId}:id`, titleOriginal: 'Manga uji', author: 'Example author', tags: ['Adventure'], coverUrl: `https://uploads.mangadex.org/covers/${mangaId}/cover.jpg.256.jpg` })
  })
  it('accepts only MangaDex title URLs with UUIDs', () => {
    expect(resolveMangaDexUrl(`https://mangadex.org/title/${mangaId}/test`)).toEqual({ id: mangaId })
    for (const url of [`https://evil-mangadex.org/title/${mangaId}`, `https://mangadex.org/chapter/${chapterId}`, 'https://mangadex.org/title/123', `https://mangadex.org@evil.example/title/${mangaId}`]) expect(() => resolveMangaDexUrl(url)).toThrow()
    expect(createMangaDex().resolve({ url: `https://mangadex.org/title/${mangaId}` }, { config: { language: 'id' } })).toEqual({ id: `${mangaId}:id` })
  })
  it('orders chapters numerically, deduplicates scanlations and excludes unhosted/wrong-language chapters', () => {
    const pages = chapterPages([chapter(secondId, '10'), chapter(), chapter(thirdId, '1', { publishAt: '2024-02-01' }), chapter(thirdId, '2', { externalUrl: 'https://publisher.example' }), chapter(thirdId, '3', { translatedLanguage: 'id' }), chapter(thirdId, '4', { pages: 0 }), chapter()], 'en', 'original')
    expect(pages).toHaveLength(4)
    expect(pages.map(p => p.sourcePageId)).toEqual([`${chapterId}:1`, `${chapterId}:2`, `${secondId}:1`, `${secondId}:2`])
    expect(pages[0].sourceUrl).toBe(`https://api.mangadex.org/at-home/server/${chapterId}#inkrail-page=0&quality=original`)
  })
  it('orders the chapter directory numerically without changing existing page positions', () => {
    const feed = [chapter(secondId, '26', { volume: null }), chapter(chapterId, '1')]
    const pages = chapterPages(feed, 'en', 'original')
    expect(pages[0].sourcePageId).toBe(`${secondId}:1`)
    const directory = mangaChapterDirectory(feed, pages)
    expect(directory.map(c => c.sourceChapterId)).toEqual([chapterId, secondId])
    expect(directory[0].sourcePageIds).toEqual([`${chapterId}:1`, `${chapterId}:2`])
    expect(pages[0].position).toBe(1)
  })
  it('paginates the complete chapter feed without fetching every chapter image server', async () => {
    const { source, fetcher } = mocked([ok({ data: title }), ok({ data: [chapter()], total: 2 }), ok({ data: [chapter(secondId, '2')], total: 2 })])
    const value = await source.metadata({ id: `${mangaId}:en` }, { config: { language: 'id' } })
    expect(value.sourceNovelId).toBe(`${mangaId}:en`)
    expect(value.pages).toHaveLength(4)
    expect(value.mangaChapters).toEqual([
      { sourceChapterId: chapterId, titleOriginal: 'Vol. 1 · Chapter 1', position: 1, sourcePageIds: [`${chapterId}:1`, `${chapterId}:2`] },
      { sourceChapterId: secondId, titleOriginal: 'Vol. 1 · Chapter 2', position: 2, sourcePageIds: [`${secondId}:1`, `${secondId}:2`] }
    ])
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(new URL(fetcher.mock.calls[2][0]).searchParams.get('offset')).toBe('1')
    expect(new URL(fetcher.mock.calls[1][0]).searchParams.get('translatedLanguage[]')).toBe('en')
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/at-home/'))).toBe(false)
    await source.metadata({ id: `${mangaId}:en` }, ctx)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('refuses incomplete feeds and titles above the selected content rating', async () => {
    const { source } = mocked([ok({ data: title }), ok({ data: [], total: 1 })])
    await expect(source.metadata({ id: mangaId }, ctx)).rejects.toThrow('Incomplete')
    const mature = mocked([ok({ data: { ...title, attributes: { ...title.attributes, contentRating: 'pornographic' } } })])
    await expect(mature.source.metadata({ id: mangaId }, ctx)).rejects.toThrow('content-rating')
    expect(mature.fetcher).toHaveBeenCalledTimes(1)
  })
  it('does not silently return an empty book for external-only releases', async () => {
    const { source } = mocked([ok({ data: title }), ok({ data: [chapter(chapterId, '1', { externalUrl: 'https://publisher.example' })], total: 1 })])
    await expect(source.metadata({ id: mangaId }, ctx)).rejects.toThrow('No hosted MangaDex chapters')
  })
  it('resolves data-saver locators lazily and refreshes an expired CDN on 404', async () => {
    const home = (baseUrl: string) => ok({ baseUrl, chapter: { hash: 'abcdef', data: ['original.jpg'], dataSaver: ['small.jpg'] } })
    const { source, fetcher } = mocked([home('https://uploads.mangadex.org/old'), new Response('', { status: 404 }), home('https://uploads.mangadex.org/new'), new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })])
    const result = await source.asset({ url: `https://api.mangadex.org/at-home/server/${chapterId}#inkrail-page=0&quality=data-saver` }, ctx)
    expect(result.base64).toBe('AQID')
    expect(fetcher.mock.calls[3][0]).toBe('https://uploads.mangadex.org/new/data-saver/abcdef/small.jpg')
  })
  it('reports volunteer image-node outcomes without authentication headers', async () => {
    const { source, fetcher } = mocked([ok({ baseUrl: 'https://node.example/path', chapter: { hash: 'abcdef', data: ['1.jpg'], dataSaver: ['1.jpg'] } }), new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/jpeg', 'x-cache': 'HIT' } }), new Response('')])
    await source.asset({ url: `https://api.mangadex.org/at-home/server/${chapterId}#inkrail-page=0&quality=original` }, ctx)
    expect(fetcher.mock.calls[2][0]).toBe('https://api.mangadex.network/report')
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({ success: true, cached: true, bytes: 1 })
    expect(fetcher.mock.calls[2][1].headers).toEqual({ 'content-type': 'application/json' })
  })
  it('surfaces rate-limit cooldowns and passes cancellation to fetch', async () => {
    const { source, fetcher } = mocked([new Response('', { status: 429, headers: { 'retry-after': '60' } })])
    const controller = new AbortController()
    await expect(source.browse({}, { config: {}, signal: controller.signal })).rejects.toMatchObject({ statusCode: 429, data: { retryAfterMs: 60000 } })
    expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })
  it('rejects foreign asset URLs and malformed page locators before network access', async () => {
    const { source, fetcher } = mocked([])
    for (const url of ['file:///etc/passwd', 'https://evil.example/image.png', `https://api.mangadex.org/at-home/server/${chapterId}`, `https://api.mangadex.org/at-home/server/${chapterId}#inkrail-page=-1`]) await expect(source.asset({ url }, ctx)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('computes hasNext from the API total', async () => {
    const { source } = mocked([ok({ data: [title], total: 21 })])
    expect(await source.search({ page: 1 }, ctx)).toMatchObject({ hasNext: true, results: [{ sourceNovelId: `${mangaId}:en` }] })
  })
})
