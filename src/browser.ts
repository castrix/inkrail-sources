import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'playwright'
import { dataRoot } from './storage'
import { scraperProxyUrl } from './scraper-dns'
import { sourceRateLimitError } from './source-rate-limit'

type ManualBrowserState = {
  status: 'CLOSED' | 'OPENING' | 'READY' | 'VERIFICATION_REQUIRED' | 'ERROR'
  url: string | null
  title: string | null
  message: string | null
  checkedAt: string
}

const globalBrowser = globalThis as unknown as {
  twkanContext?: BrowserContext
  twkanHeadful?: boolean
  twkanManualPage?: Page
  twkanManualState?: ManualBrowserState
}

function state(status: ManualBrowserState['status'], values: Partial<ManualBrowserState> = {}): ManualBrowserState {
  const next = { status, url: null, title: null, message: null, checkedAt: new Date().toISOString(), ...values }
  globalBrowser.twkanManualState = next
  return next
}

async function requiresVerification(page: Page, title: string) {
  if (/Just a moment|Attention Required|Verify you are human|captcha/i.test(title)) return true
  const challengeSelectors = ['#challenge-running', '.cf-chl-widget', '.cf-turnstile', 'iframe[src*="challenges.cloudflare.com"]']
  for (const selector of challengeSelectors) {
    if (await page.locator(selector).first().isVisible().catch(() => false)) return true
  }
  return page.getByText(/Verify you are human|checking your browser|complete the security check/i).first().isVisible().catch(() => false)
}

async function context(headless: boolean) {
  if (globalBrowser.twkanContext && globalBrowser.twkanHeadful === !headless) return globalBrowser.twkanContext
  if (globalBrowser.twkanContext) await globalBrowser.twkanContext.close().catch(() => undefined)
  const profileName = (process.env.INKRAIL_BROWSER_PROFILE || 'twkan').replace(/[^a-zA-Z0-9_-]/g, '_')
  const profile = resolve(dataRoot(), 'browser-profiles', profileName)
  await mkdir(profile, { recursive: true })
  const proxyUrl = await scraperProxyUrl()
  globalBrowser.twkanContext = await chromium.launchPersistentContext(profile, {
    headless,
    viewport: { width: 1280, height: 900 },
    locale: 'zh-TW',
    ...(proxyUrl ? { proxy: { server: proxyUrl } } : {})
  })
  globalBrowser.twkanContext.on('close', () => {
    globalBrowser.twkanContext = undefined
    globalBrowser.twkanManualPage = undefined
    state('CLOSED', { message: 'The Windows browser session is closed.' })
  })
  globalBrowser.twkanHeadful = !headless
  return globalBrowser.twkanContext
}

export async function fetchRendered(url: string, expandDirectory = false) {
  const browser = await context(true)
  const page = await browser.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    const title = await page.title()
    const rendered = await page.content()
    if (/Just a moment|Attention Required/i.test(title) || /Verify you are human|id=["']challenge-running|cf-chl-widget/i.test(rendered)) {
      throw new Error('WAITING_FOR_ACCESS')
    }
    if (expandDirectory) {
      const expand = page.getByText(/點擊展開全部\d+章節目錄/)
      if (await expand.count()) {
        await expand.click()
        await page.waitForTimeout(500)
      }
    }
    return await page.content()
  } finally {
    await page.close()
  }
}

export async function fetchRenderedBinary(url: string, headers: Record<string, string> = {}) {
  const browser = await context(true)
  const response = await browser.request.get(url, { headers, timeout: 45_000 })
  if (response.status() === 429) throw sourceRateLimitError(response.headers()['retry-after'] || null)
  if (!response.ok()) throw new Error(`Browser asset download returned HTTP ${response.status()}`)
  return Buffer.from(await response.body())
}

export async function fetchRenderedText(url: string, headers: Record<string, string> = {}) {
  const browser = await context(true)
  const response = await browser.request.get(url, { headers, timeout: 45_000 })
  if (response.status() === 429) throw sourceRateLimitError(response.headers()['retry-after'] || null)
  const text = await response.text()
  if (!response.ok()) throw new Error(`Browser source request returned HTTP ${response.status()}`)
  if (/Just a moment|Attention Required|Verify you are human|captcha/i.test(text)) throw new Error('WAITING_FOR_ACCESS')
  return text
}

export async function openManualTwkanSession(url = 'https://twkan.com/') {
  state('OPENING', { url, message: 'Opening the persistent browser on the Windows host.' })
  try {
    const browser = await context(false)
    const pages = browser.pages()
    const page = globalBrowser.twkanManualPage && !globalBrowser.twkanManualPage.isClosed() ? globalBrowser.twkanManualPage : pages[0] || await browser.newPage()
    globalBrowser.twkanManualPage = page
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.bringToFront()
    return manualTwkanStatus()
  } catch (error) {
    return state('ERROR', { url, message: error instanceof Error ? error.message : String(error) })
  }
}

export async function manualTwkanStatus(): Promise<ManualBrowserState> {
  const page = globalBrowser.twkanManualPage
  if (!page || page.isClosed()) return state('CLOSED', { message: 'The persistent TWKAN browser is not open.' })
  try {
    const [url, title] = await Promise.all([Promise.resolve(page.url()), page.title()])
    if (await requiresVerification(page, title)) {
      return state('VERIFICATION_REQUIRED', { url, title, message: 'TWKAN requires CAPTCHA or browser verification on the Windows host.' })
    }
    return state('READY', { url, title, message: 'The persistent TWKAN browser is ready on the Windows host.' })
  } catch (error) {
    return state('ERROR', { message: error instanceof Error ? error.message : String(error) })
  }
}
