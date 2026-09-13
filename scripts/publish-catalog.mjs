import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { createHash, createPublicKey, verify } from 'node:crypto'
const index = JSON.parse(await readFile('dist/public/index.json', 'utf8'))
const payload = Buffer.from(index.payload, 'base64')
if (!verify(null, payload, index.publicKey, Buffer.from(index.signature, 'base64'))) throw new Error('Invalid index signature')
const catalog = JSON.parse(payload)
const allowed = JSON.parse(await readFile('public-packages.json', 'utf8'))
if (catalog.packages.length !== allowed.length || new Set(catalog.packages.map(p => p.manifest.id)).size !== allowed.length) throw new Error('Unexpected package set')
await mkdir('repository', { recursive: true })
for (const release of catalog.packages) {
  if (!allowed.includes(release.manifest.id)) throw new Error('Non-public package in index')
  const name = `${release.manifest.id}-${release.manifest.version}.inkrail.json`
  if (release.url !== `https://raw.githubusercontent.com/castrix/inkrail-sources/main/repository/${name}`) throw new Error('Unexpected package URL')
  const bytes = await readFile(`dist/public/${name}`)
  if (createHash('sha256').update(bytes).digest('hex') !== release.sha256) throw new Error('Package checksum mismatch')
  const prior = await readFile(`repository/${name}`).catch(e => { if (e.code === 'ENOENT') return null; throw e })
  if (prior && !prior.equals(bytes)) throw new Error(`Released version changed: ${name}. Bump the package version.`)
  await copyFile(`dist/public/${name}`, `repository/${name}`)
}
await copyFile('dist/public/index.json', 'repository/index.json')
const fingerprint = createHash('sha256').update(createPublicKey(index.publicKey).export({ type: 'spki', format: 'der' })).digest('hex')
await writeFile('repository/publisher-fingerprint.txt', fingerprint + '\n')
console.log(`Prepared ${catalog.packages.length} public packages. Publisher fingerprint: ${fingerprint}`)
