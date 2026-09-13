import { parseTwkanIndex, parseTwkanLanding, parseTwkanSearch, twkanSearchUrl } from './parsers/twkan'
import type { NovelMetadata, ParsedIndex } from './parsers/types'
import { fetchHtml } from './transport'

export async function searchTwkan(query: string, page = 1) {
  const normalized = query.trim()
  if (!normalized) return { results: [], page: 1, query: '' }
  const response = await fetchHtml(twkanSearchUrl(normalized, page))
  const redirectedNovelId = response.finalUrl?.match(/\/book\/(\d+)\.html/)?.[1]
  if (redirectedNovelId) {
    const metadata = await fetchTwkanMetadata(redirectedNovelId)
    return { results: [{ ...metadata, description: metadata.description }], page, query: normalized }
  }
  return { results: parseTwkanSearch(response.html), page, query: normalized }
}

export async function fetchTwkanMetadata(novelId: string): Promise<NovelMetadata> {
  const landingUrl = `https://twkan.com/book/${novelId}.html`
  let response = await fetchHtml(landingUrl)
  try {
    return parseTwkanLanding(response.html, novelId)
  } catch {
    response = await fetchHtml(landingUrl, { forceBrowser: true })
    return parseTwkanLanding(response.html, novelId)
  }
}

export async function fetchTwkanDirectory(novelId: string, indexUrl = `https://twkan.com/book/${novelId}/index.html`): Promise<{ parsed: ParsedIndex, transport: string }> {
  let response = await fetchHtml(indexUrl)
  let parsed = parseTwkanIndex(response.html, novelId)
  if (!parsed.complete) {
    const expandedResponse = await fetchHtml(`https://twkan.com/ajax_novels/chapterlist/${novelId}.html`)
    const expanded = parseTwkanIndex(expandedResponse.html, novelId)
    if (expanded.chapters.length >= (parsed.expectedCount || 1)) {
      response = expandedResponse
      parsed = expanded
    } else {
      response = await fetchHtml(indexUrl, { forceBrowser: true, expandDirectory: true })
      parsed = parseTwkanIndex(response.html, novelId)
    }
  }
  if (!parsed.chapters.length) throw new Error('TWKAN index contained no chapters')
  return { parsed, transport: response.transport }
}
