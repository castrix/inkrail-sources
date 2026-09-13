import { Impit } from 'impit'
import { fetchRendered, fetchRenderedBinary, fetchRenderedText } from './browser'
import { scraperProxyUrl } from './scraper-dns'
import { isSourceRateLimit, sourceRateLimitError } from './source-rate-limit'
import { waitDownloadCooldown } from './download-settings'
import type { DownloadSource } from './types'

let clientPromise: Promise<Impit> | undefined
async function impitClient() {
  clientPromise ||= scraperProxyUrl().then(proxyUrl => new Impit({ browser: 'chrome', ...(proxyUrl ? { proxyUrl } : {}) }))
  return clientPromise
}
let activeBinaryRequests = 0
const binaryWaiters: Array<() => void> = []

async function binarySlot() {
  if (activeBinaryRequests >= 2) await new Promise<void>(resolve => binaryWaiters.push(resolve))
  else activeBinaryRequests += 1
  return () => {
    const next = binaryWaiters.shift()
    if (next) next(); else activeBinaryRequests -= 1
  }
}

export function looksLikeChallenge(status: number, html: string) {
  return status === 403 || /<title>\s*Just a moment|Verify you are human|id=["']challenge-running|cf-chl-widget|Attention Required!\s*\|\s*Cloudflare/i.test(html)
}

export async function fetchHtml(url: string, options: { forceBrowser?: boolean, expandDirectory?: boolean, timeout?: number } = {}) {
  if (!options.forceBrowser) {
    try {
      const client = await impitClient()
      const response = await client.fetch(url, {
        timeout: options.timeout,
        headers: {
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'zh-TW,zh;q=0.9,en;q=0.6'
        }
      })
      const html = await response.text()
      if (response.ok && !looksLikeChallenge(response.status, html)) return { html, transport: 'impit' as const, finalUrl: response.url }
      if (!looksLikeChallenge(response.status, html) && response.status < 500) {
        throw new Error(`Source returned HTTP ${response.status}`)
      }
    } catch { /* Impit timed out or was blocked; use the browser session. */ }
  }
  return { html: await fetchRendered(url, options.expandDirectory), transport: 'browser' as const, finalUrl: url }
}

const pendingBinaries = new Map<string, Promise<Buffer>>()
export function fetchBinary(url: string, headers: Record<string, string> = {}) {
  const key = JSON.stringify([url, headers])
  const existing = pendingBinaries.get(key)
  if (existing) return existing
  const request = fetchBinaryOnce(url, headers).finally(() => pendingBinaries.delete(key))
  pendingBinaries.set(key, request)
  return request
}

async function fetchBinaryOnce(url: string, headers: Record<string, string>) {
  const host = new URL(headers.referer || url).hostname
  const source: DownloadSource = host
  for (let attempt = 0; ; attempt++) {
    let rateLimit: any
    const release = await binarySlot()
    try {
      try {
        const client = await impitClient()
        const response = await client.fetch(url, { headers, timeout: 20_000 })
        if (response.status === 429) throw sourceRateLimitError(response.headers.get('retry-after'))
        if (response.ok) return Buffer.from(await response.arrayBuffer())
      } catch (error) {
        if (isSourceRateLimit(error)) throw error
      }
      return await fetchRenderedBinary(url, headers)
    } catch (error: any) {
      if (!source || !isSourceRateLimit(error) || attempt >= 3) throw error
      rateLimit = error
    } finally { release() }
    // Backoff must not occupy an image-serving slot.
    await waitDownloadCooldown(source!, Math.max(Number(rateLimit.data?.retryAfterMs) || 60_000, 30_000 * 2 ** attempt))
  }
}

export async function fetchSourceJson<T>(url: string, timeout = 15_000, headers: Record<string, string> = {}): Promise<T> {
  try {
    const client = await impitClient()
    const response = await client.fetch(url, { timeout, headers: { accept: 'application/json', ...headers } })
    if (response.status === 429) throw sourceRateLimitError(response.headers.get('retry-after'))
    if (response.ok) return JSON.parse(await response.text()) as T
  } catch (error) {
    if (isSourceRateLimit(error)) throw error
    /* Fall through to the persistent browser session for other failures. */
  }
  return JSON.parse(await fetchRenderedText(url, { accept: 'application/json', ...headers })) as T
}

export async function fetchSourceText(url: string, timeout = 15_000, headers: Record<string, string> = {}) {
  try {
    const client = await impitClient()
    const response = await client.fetch(url, { timeout, headers: { accept: 'text/plain,application/javascript,*/*', ...headers } })
    if (response.ok) return await response.text()
  } catch { /* Fall through to the persistent browser session. */ }
  return fetchRenderedText(url, { accept: 'text/plain,application/javascript,*/*', ...headers })
}

export async function fetchBinaryRange(url: string, start: number, end: number, browserFallback = true) {
  const range = `bytes=${Math.max(0, start)}-${Math.max(start, end)}`
  try {
    const client = await impitClient()
    const response = await client.fetch(url, { timeout: 15_000, headers: { accept: 'application/octet-stream,*/*', range } })
    if (response.ok) {
      const body = Buffer.from(await response.arrayBuffer())
      const contentRange = response.headers.get('content-range')
      const total = Number(contentRange?.match(/\/(\d+)$/)?.[1] || response.headers.get('content-length') || body.length)
      return { body: response.status === 206 ? body : body.subarray(start, end + 1), total, partial: response.status === 206 }
    }
    throw new Error(`Source range request returned HTTP ${response.status}`)
  } catch (error) {
    if (!browserFallback) throw error
    /* Fall through to the persistent browser session. */
  }
  const body = await fetchRenderedBinary(url, { range, accept: 'application/octet-stream,*/*' })
  return { body, total: Math.max(end + 1, body.length), partial: true }
}
