import { Impit } from 'impit'
import { scraperProxyUrl } from './scraper-dns'

let client: Impit | undefined
export const sourceFetch: typeof fetch = async (input, init) => {
  const proxyUrl = await scraperProxyUrl()
  if (!proxyUrl) return fetch(input, init)
  client ||= new Impit({ proxyUrl })
  const result = await client.fetch(input, init)
  const response = new Response([204, 205, 304].includes(result.status) ? null : result.body, {
    status: result.status, statusText: result.statusText, headers: result.headers
  })
  Object.defineProperty(response, 'url', { value: result.url })
  return response
}
