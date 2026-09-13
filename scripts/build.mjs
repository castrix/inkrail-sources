import { build } from 'esbuild'
import { readdir, readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { createHash, sign, createPublicKey } from 'node:crypto'
if (!process.env.INKRAIL_SIGNING_KEY || !process.env.INKRAIL_RELEASE_BASE_URL) throw new Error('Set INKRAIL_SIGNING_KEY to a private PEM file and INKRAIL_RELEASE_BASE_URL to the release directory URL')
const key = await readFile(process.env.INKRAIL_SIGNING_KEY, 'utf8')
const publicKey = createPublicKey(key).export({ type: 'spki', format: 'pem' }).toString()
const packages = []
const publicIds = JSON.parse(await readFile('public-packages.json', 'utf8'))
if (!Array.isArray(publicIds) || new Set(publicIds).size !== publicIds.length || publicIds.some(id => typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id))) throw new Error('Invalid public package list')
const output = 'dist/public'
await mkdir(output, { recursive: true })
// Remove stale generated releases only in the dedicated public output folder.
for (const file of await readdir(output)) if (file === 'index.json' || /^[a-z0-9-]+-\d+\.\d+\.\d+\.inkrail\.json$/.test(file)) await unlink(`${output}/${file}`)
for (const id of publicIds) {
  const manifest = JSON.parse(await readFile(`packages/${id}/manifest.json`, 'utf8'))
  if (manifest.id !== id) throw new Error(`Package ID mismatch: ${id}`)
  const result = await build({ entryPoints: [`packages/${id}/index.ts`], bundle: true, platform: 'node', target: 'node24', format: 'esm', external: ['impit', 'playwright'], write: false, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } })
  const bytes = Buffer.from(JSON.stringify({ manifest, files: { 'index.mjs': result.outputFiles[0].text } }))
  const file = `${id}-${manifest.version}.inkrail.json`
  await writeFile(`${output}/${file}`, bytes)
  packages.push({ manifest, url: new URL(file, process.env.INKRAIL_RELEASE_BASE_URL.replace(/\/?$/, '/')).href, sha256: createHash('sha256').update(bytes).digest('hex') })
}
const payload = Buffer.from(JSON.stringify({ name: 'Inkrail sources', packages }))
await writeFile(`${output}/index.json`, JSON.stringify({ publicKey, payload: payload.toString('base64'), signature: sign(null, payload, key).toString('base64') }))
console.log(`Publisher fingerprint: ${createHash('sha256').update(createPublicKey(key).export({ type: 'spki', format: 'der' })).digest('hex')}`)
console.log(`Built ${packages.length} signed source releases`)
