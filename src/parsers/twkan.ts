import * as cheerio from 'cheerio'
import type { ChapterReference, NovelMetadata, ParsedIndex, ScrapedChapter, SourceNovelSummary } from './types'

const TWKAN_HOSTS = new Set(['twkan.com', 'www.twkan.com'])

export function parseTwkanNovelId(input: string) {
  const url = new URL(input)
  if (!TWKAN_HOSTS.has(url.hostname.toLowerCase())) throw new Error('Only twkan.com URLs are supported')
  const match = url.pathname.match(/^\/book\/(\d+)(?:\/index)?\.html$/)
  if (!match) throw new Error('Expected a TWKAN book or index URL')
  return match[1]
}

function parseDate(value: string | undefined) {
  if (!value) return null
  const match = value.match(/(20\d{2}-\d{2}-\d{2})/)
  if (!match) return null
  const date = new Date(`${match[1]}T00:00:00+08:00`)
  return Number.isNaN(date.valueOf()) ? null : date
}

export function parseTwkanLanding(html: string, novelId: string): NovelMetadata {
  const $ = cheerio.load(html)
  const info = $('.booknav2')
  const titleOriginal = info.find('h1').first().text().trim()
  if (!titleOriginal) throw new Error('TWKAN landing page did not contain a title')

  const lines = info.find('p').map((_, el) => $(el).text().replace(/\s+/g, ' ').trim()).get()
  const author = lines.find(line => line.startsWith('作者：'))?.replace(/^作者：/, '').trim() || null
  const category = lines.find(line => line.startsWith('分類：'))?.replace(/^分類：/, '').trim() || null
  const combined = lines.find(line => line.includes('|')) || ''
  const [wordCountLabel, sourceStatus] = combined.split('|').map(value => value.trim())
  const description = $('#tab_info .navtxt p').first().text().replace(/\s+/g, ' ').trim() || null
  const cover = $('.bookimg2 img').first().attr('src') || null
  const sourceUrl = `https://twkan.com/book/${novelId}.html`

  return {
    sourceSite: 'twkan', sourceNovelId: novelId, sourceUrl,
    indexUrl: `https://twkan.com/book/${novelId}/index.html`, titleOriginal,
    author, category, wordCountLabel: wordCountLabel || null, sourceStatus: sourceStatus || null,
    description, coverUrl: cover ? new URL(cover, sourceUrl).href : null,
    sourceUpdatedAt: parseDate(lines.find(line => line.startsWith('更新：')))
  }
}

export function twkanSearchUrl(query: string, page = 1) {
  return `https://twkan.com/search/${encodeURIComponent(query.trim())}/${Math.max(1, page)}.html`
}

export function parseTwkanSearch(html: string): SourceNovelSummary[] {
  const $ = cheerio.load(html)
  const results: SourceNovelSummary[] = []
  const seen = new Set<string>()

  $('li').each((_, element) => {
    const item = $(element)
    const links = item.find('h3 a[href*="/book/"]').toArray()
    const titledLink = links.find(link => $(link).text().replace(/\s+/g, ' ').trim())
    const bookLink = $(titledLink || links[0])
    const href = bookLink.attr('href')
    const match = href?.match(/\/book\/(\d+)\.html/)
    if (!href || !match || seen.has(match[1])) return
    const titleOriginal = bookLink.text().replace(/\s+/g, ' ').trim() || item.find('img').first().attr('alt')?.trim() || ''
    if (!titleOriginal) return
    const labels = item.find('.labelbox label').map((__, label) => $(label).text().trim()).get()
    const image = item.find('img').first()
    const cover = image.attr('data-src') || image.attr('src') || null
    seen.add(match[1])
    results.push({
      sourceSite: 'twkan',
      sourceNovelId: match[1],
      sourceUrl: `https://twkan.com/book/${match[1]}.html`,
      titleOriginal,
      author: labels[0] || null,
      category: labels[1] || null,
      sourceStatus: labels[2] || null,
      description: item.find('ol').first().text().replace(/\s+/g, ' ').trim() || null,
      coverUrl: cover ? new URL(cover, 'https://twkan.com').href : null
    })
  })

  return results
}

export function classifyTwkanChapter(title: string): ChapterReference['kind'] {
  if (/第[零一二三四五六七八九十百千萬\d]+[章節回]/.test(title)) return 'MAIN'
  if (/(月票|抽獎|公告|通知|請假|上架感言|完本感言|月末總結|結果公示|更新說明)/i.test(title)) return 'ANNOUNCEMENT'
  if (/(番外|後記|序章|楔子)/i.test(title)) return 'EXTRA'
  return 'UNKNOWN'
}

export function parseTwkanIndex(html: string, novelId: string): ParsedIndex {
  const $ = cheerio.load(html)
  const unique = new Map<string, { url: string, title: string }>()
  $(`a[href*="/txt/${novelId}/"]`).each((_, el) => {
    const href = $(el).attr('href')
    const title = $(el).text().replace(/\s+/g, ' ').trim()
    const match = href?.match(new RegExp(`/txt/${novelId}/(\\d+)`))
    if (!href || !match || !title || unique.has(match[1])) return
    unique.set(match[1], { url: new URL(href, 'https://twkan.com').href, title })
  })

  const bodyText = $.root().text().replace(/\s+/g, '')
  const expectedMatch = bodyText.match(/(?:點擊)?展開全部(\d+)章節目錄/)
  const expectedCount = expectedMatch ? Number(expectedMatch[1]) : null
  const chapters = [...unique.entries()].map(([sourceChapterId, value], index) => ({
    sourceChapterId,
    sourceUrl: value.url,
    position: index + 1,
    titleOriginal: value.title,
    kind: classifyTwkanChapter(value.title)
  }))
  return { chapters, expectedCount, complete: expectedCount === null || chapters.length >= expectedCount }
}

const PROMO_PATTERNS = [
  /請記住找台灣小說上台灣小說網.*(?:最快的章節更新|精彩盡在)/i,
  /台灣小說網.*精彩.*twkan\.com/i
]

function compactWatermarkText(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
}

function isTwkanPromotion(value: string) {
  if (PROMO_PATTERNS.some(pattern => pattern.test(value))) return true
  const compact = compactWatermarkText(value)
  return compact.includes('台灣小說') && compact.includes('twkan') && (compact.includes('請記住') || compact.includes('章節更新'))
}

export function cleanTwkanParagraphs(values: string[]) {
  const cleaned: string[] = []
  for (const value of values) {
    const line = value.replace(/^[\s\u3000]+|[\s\u3000]+$/g, '').trim()
    if (!line || isTwkanPromotion(line) || ['「」', '『』', '.', '．', '>'].includes(line)) continue
    if (['」', '』'].includes(line) && cleaned.length) {
      cleaned[cleaned.length - 1] += line
      continue
    }
    cleaned.push(line)
  }
  return cleaned
}

export function parseTwkanChapter(html: string): ScrapedChapter {
  const $ = cheerio.load(html)
  const titleOriginal = $('h1').first().text().replace(/\s+/g, ' ').trim()
  const content = $('#txtcontent0').first()
  if (!titleOriginal || !content.length) throw new Error('TWKAN chapter page was missing its title or content')

  content.find('script, iframe, style, .txtad, .txtcenter, ins').remove()
  content.find('br').replaceWith('\n')
  const paragraphs = cleanTwkanParagraphs(content.text()
    .replace(/\r/g, '')
    .split(/\n+/)
  )

  if (paragraphs.length < 2 || paragraphs.join('').length < 80) {
    throw new Error('TWKAN chapter content was unexpectedly short')
  }
  const pageText = $.root().text()
  const metaMatch = pageText.match(/(20\d{2}-\d{2}-\d{2})(?:\s+\d{2}:\d{2}:\d{2})?\s*作者[：:]\s*([^\n]+)/)
  return {
    titleOriginal,
    paragraphs,
    publishedAt: parseDate(metaMatch?.[1]),
    author: metaMatch?.[2]?.trim() || null
  }
}
