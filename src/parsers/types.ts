export interface NovelMetadata {
  sourceSite: string
  sourceNovelId: string
  sourceUrl: string
  indexUrl: string
  titleOriginal: string
  author: string | null
  category: string | null
  wordCountLabel: string | null
  sourceStatus: string | null
  description: string | null
  coverUrl: string | null
  sourceUpdatedAt: Date | null
}

export interface ChapterReference {
  sourceChapterId: string
  sourceUrl: string
  position: number
  titleOriginal: string
  kind: 'MAIN' | 'EXTRA' | 'ANNOUNCEMENT' | 'UNKNOWN'
}

export interface ParsedIndex {
  chapters: ChapterReference[]
  expectedCount: number | null
  complete: boolean
}

export interface ScrapedChapter {
  titleOriginal: string
  paragraphs: string[]
  publishedAt: Date | null
  author: string | null
}

export interface SourceNovelSummary {
  sourceSite: string
  sourceNovelId: string
  sourceUrl: string
  titleOriginal: string
  author: string | null
  category: string | null
  sourceStatus: string | null
  description: string | null
  coverUrl: string | null
}

export interface MangaPageReference {
  sourcePageId: string
  sourceUrl: string
  thumbnailUrl: string
  position: number
}

export interface MangaMetadata extends NovelMetadata {
  sourceSite: string
  publisher: string | null
  pages: MangaPageReference[]
  tags: string[]
  language: string | null
  favoriteCount: number | null
}
