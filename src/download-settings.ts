export async function waitDownloadCooldown(_source: string, ms: number) { await new Promise(r => setTimeout(r, Math.min(ms, 45000))) }
