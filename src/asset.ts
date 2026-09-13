import { fetchBinary } from './transport'
export async function asset({ url, referer }: { url: string, referer?: string }) {
 const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported asset URL')
 const binary = await fetchBinary(url, referer ? { referer } : {}); if (binary.length > 24 * 1024 * 1024) throw new Error('Asset too large')
 return { base64: binary.toString('base64') }
}
