import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), wait: vi.fn(), browser: vi.fn() }))
vi.mock('impit', () => ({ Impit: class { fetch = mocks.fetch } }))
vi.mock('../src/scraper-dns', () => ({ scraperProxyUrl: async () => null }))
vi.mock('../src/browser', () => ({ fetchRendered: vi.fn(), fetchRenderedText: vi.fn(), fetchRenderedBinary: mocks.browser }))
vi.mock('../src/download-settings', () => ({ waitDownloadCooldown: mocks.wait }))
import { fetchBinary } from '../src/transport'
describe('download rate-limit retries', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.wait.mockResolvedValue(undefined)
  })
  const limited = () => ({ status: 429, ok: false, headers: new Headers({ 'retry-after': '90' }) })
  it('retries immediately when the cooldown helper skips its wait', async () => {
    mocks.fetch.mockResolvedValueOnce(limited()).mockResolvedValueOnce({ status: 200, ok: true, arrayBuffer: async () => new Uint8Array([1, 2]).buffer })
    expect(await fetchBinary('https://cdn.example/page.avif', { referer: 'https://reader.example/reader/1.html' })).toEqual(Buffer.from([1, 2]))
    expect(mocks.wait).toHaveBeenCalledWith('reader.example', 90_000)
    expect(mocks.browser).not.toHaveBeenCalled()
  })
  it('stops after three retries when the source keeps rejecting requests', async () => {
    mocks.fetch.mockResolvedValue(limited())
    await expect(fetchBinary('https://cdn.example/page.avif', { referer: 'https://reader.example/g/1/' })).rejects.toMatchObject({ statusCode: 429 })
    expect(mocks.fetch).toHaveBeenCalledTimes(4)
    expect(mocks.wait).toHaveBeenCalledTimes(3)
    expect(mocks.browser).not.toHaveBeenCalled()
  })
  it('deduplicates simultaneous requests for the same image', async () => {
    let finish!: (value: any) => void
    mocks.fetch.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const first = fetchBinary('https://cdn.example/shared.avif')
    const second = fetchBinary('https://cdn.example/shared.avif')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    finish({ status: 200, ok: true, arrayBuffer: async () => new Uint8Array([9]).buffer })
    expect(await first).toEqual(await second)
  })
  it('lets another image proceed while two requests are in rate-limit backoff', async () => {
    const releases: Array<() => void> = []
    const attempts = new Set<string>()
    mocks.wait.mockImplementation(() => new Promise<void>(resolve => releases.push(resolve)))
    mocks.fetch.mockImplementation(async (url: string) => {
      if (!url.endsWith('/visible') && !attempts.has(url)) { attempts.add(url); return limited() }
      return { status: 200, ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer }
    })
    const headers = { referer: 'https://reader.example/reader/1.html' }
    const first = fetchBinary('https://cdn.example/one', headers)
    const second = fetchBinary('https://cdn.example/two', headers)
    await vi.waitFor(() => expect(releases.length).toBe(2))
    try {
      await expect(Promise.race([
        fetchBinary('https://cdn.example/visible', headers),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Image slots blocked by backoff')), 500))
      ])).resolves.toEqual(Buffer.from([1]))
    } finally { releases.forEach(release => release()); await Promise.all([first, second]) }
  })

})
