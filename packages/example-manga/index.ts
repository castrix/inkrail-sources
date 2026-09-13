const item = { sourceNovelId: 'sample', sourceUrl: 'https://example.invalid/sample', indexUrl: 'https://example.invalid/sample/chapters', titleOriginal: 'Synthetic example — manga', author: 'Inkrail example', description: 'Generated demonstration content for extension developers.', coverUrl: null }
const pages = [{ sourcePageId: 'page-1', position: 1, sourceUrl: 'https://example.invalid/page.png', thumbnailUrl: 'https://example.invalid/page.png' }]
const search = async () => ({ results: [item], hasNext: false })
export default {
 search, browse: search,
 metadata: async () => ({ ...item, pages, tags: [], language: 'en' }),
 chapters: async () => ({ chapters: [{ sourceChapterId: 'chapter-1', position: 1, sourceUrl: 'https://example.invalid/chapter-1', titleOriginal: 'An example chapter', kind: 'MAIN' }], complete: true, expectedCount: 1 }),
 chapter: async () => ({ titleOriginal: 'An example chapter', paragraphs: ['This is synthetic demonstration content distributed with the source SDK.', 'A reader can download this chapter and keep reading it after uninstalling the example source.'], publishedAt: null }),
 pages: async () => pages,
 asset: async () => ({ base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4ioAAAAASUVORK5CYII=' })
}
