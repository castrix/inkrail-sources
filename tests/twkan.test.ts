import { describe, expect, it } from 'vitest'
import { classifyTwkanChapter, cleanTwkanParagraphs, parseTwkanChapter, parseTwkanIndex, parseTwkanLanding, parseTwkanNovelId, parseTwkanSearch, twkanSearchUrl } from '../src/parsers/twkan'

describe('TWKAN adapter', () => {
  it('accepts only canonical TWKAN book URLs', () => {
    expect(parseTwkanNovelId('https://twkan.com/book/89971.html')).toBe('89971')
    expect(parseTwkanNovelId('https://twkan.com/book/89971/index.html')).toBe('89971')
    expect(() => parseTwkanNovelId('https://example.com/book/89971.html')).toThrow()
  })

  it('parses landing metadata', () => {
    const html = `<div class="bookbox"><div class="bookimg2"><img src="/cover.jpg"></div><div class="booknav2"><h1>我的魔法沒有上限！</h1><p>作者：瑟瑟發抖梨花貓</p><p>分類：玄幻奇幻</p><p>202.39萬字 | 連載</p><p>更新：2026-08-28</p></div></div><div id="tab_info"><div class="navtxt"><p>故事簡介。</p></div></div>`
    const metadata = parseTwkanLanding(html, '89971')
    expect(metadata.titleOriginal).toBe('我的魔法沒有上限！')
    expect(metadata.author).toBe('瑟瑟發抖梨花貓')
    expect(metadata.sourceStatus).toBe('連載')
    expect(metadata.coverUrl).toBe('https://twkan.com/cover.jpg')
  })

  it('deduplicates chapter links and preserves index order', () => {
    const html = `<div class="catalog"><a href="/txt/89971/1">第一章 開始</a><a href="/txt/89971/1">第一章 開始</a><a href="/txt/89971/2">番外 夜話</a></div><button>點擊展開全部2章節目錄</button>`
    const result = parseTwkanIndex(html, '89971')
    expect(result.complete).toBe(true)
    expect(result.chapters).toHaveLength(2)
    expect(result.chapters[1]).toMatchObject({ position: 2, sourceChapterId: '2', kind: 'EXTRA' })
  })

  it('removes embedded advertising and the known TWKAN watermark', () => {
    const html = `<h1>第一章 測試</h1><div id="txtcontent0">　　第一段，這是一個稍長的開場段落，用來確認空白和全形縮排會被正確清理。<br><br>　　（請記住找台灣小說上台灣小說網，精彩盡在𝐭𝐰𝐤𝐚𝐧.𝐜𝐨𝐦網站，觀看最快的章節更新）<br><div class="txtad">廣告</div><br>　　第二段內容足夠長，這裡繼續補充一些文字以通過完整性驗證，確保解析器不會接受空白頁面或挑戰頁面。<br><br>　　第三段在此結束，並且保持原有的小說標點。</div>`
    const chapter = parseTwkanChapter(html)
    expect(chapter.paragraphs).toEqual(['第一段，這是一個稍長的開場段落，用來確認空白和全形縮排會被正確清理。', '第二段內容足夠長，這裡繼續補充一些文字以通過完整性驗證，確保解析器不會接受空白頁面或挑戰頁面。', '第三段在此結束，並且保持原有的小說標點。'])
  })

  it('cleans obfuscated watermarks and broken punctuation fragments', () => {
    expect(cleanTwkanParagraphs([
      '第一段。', '「」', '第二段', '」',
      '（請記住 看台灣小說首選台灣小說網，t̸̸w̸̸k̸̸a̸̸n̸̸.c̸̸o̸̸m̸̸隨時看 網站，觀看最快的章節更新）',
      '.', '>', '第三段。'
    ])).toEqual(['第一段。', '第二段」', '第三段。'])
  })

  it('classifies announcements without discarding them', () => {
    expect(classifyTwkanChapter('月末總結+月票抽獎')).toBe('ANNOUNCEMENT')
    expect(classifyTwkanChapter('第十二章 新形象')).toBe('MAIN')
    expect(classifyTwkanChapter('第476章 造物權能【月中求月票！】')).toBe('MAIN')
  })

  it('builds search URLs and parses source cards without importing them', () => {
    expect(twkanSearchUrl('魔法', 2)).toBe('https://twkan.com/search/%E9%AD%94%E6%B3%95/2.html')
    const html = `<ul><li><a href="https://twkan.com/book/93181.html" class="imgbox"><img data-src="/cover.jpg"></a><div class="newnav"><h3><a href="/book/93181.html" class="imgbox"></a><a href="/book/93181.html">魔法卡牌</a></h3><div class="labelbox"><label>作者名</label><label>玄幻奇幻</label><label>連載</label></div><ol>一段簡介</ol></div></li></ul>`
    expect(parseTwkanSearch(html)).toEqual([expect.objectContaining({ sourceNovelId: '93181', titleOriginal: '魔法卡牌', author: '作者名', coverUrl: 'https://twkan.com/cover.jpg' })])
  })
})
