import { searchTwkan, fetchTwkanMetadata, fetchTwkanDirectory } from '../../src/sources'
import { parseTwkanChapter, parseTwkanNovelId } from '../../src/parsers/twkan'
import { fetchHtml } from '../../src/transport'
import { asset } from '../../src/asset'
import { openManualTwkanSession, manualTwkanStatus } from '../../src/browser'
export default {
 search: ({ query = '', page = 1 }) => searchTwkan(query, page),
 browse: ({ query = '', page = 1 }) => searchTwkan(query, page),
 metadata: ({ id }) => fetchTwkanMetadata(id),
 chapters: async ({ id }) => (await fetchTwkanDirectory(id)).parsed,
 chapter: async ({ url }) => parseTwkanChapter((await fetchHtml(url)).html),
 resolve: ({ url }) => ({ id: parseTwkanNovelId(url) }),
 browser: ({ action }) => action === 'open' ? openManualTwkanSession() : manualTwkanStatus(),
 asset
}
