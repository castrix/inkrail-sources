import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const allowed = JSON.parse(readFileSync('public-packages.json', 'utf8'))
const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
const blocked = /(^|\/)(node_modules|dist|work|data)(\/|$)|(^|\/)\.env|\.(pem|key|db|sqlite|tmb|log)$|(^|\/)(adult-sources|hentainexus|hitomi|nhentai)([./]|$)/i
for (const path of paths) {
  if (blocked.test(path)) throw new Error(`Excluded path is tracked: ${path}`)
  if (path.startsWith('packages/') && !allowed.includes(path.split('/')[1])) throw new Error(`Unlisted package is tracked: ${path}`)
  const content = execFileSync('git', ['show', `:${path}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content) || /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{30,})\b/.test(content)) throw new Error(`Credential-like content in ${path}`)
}
console.log(`Public index audit passed: ${paths.length} files; packages: ${allowed.join(', ')}`)
