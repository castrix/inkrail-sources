import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
createServer(async (req, res) => {
  const name = (req.url || '').slice(1)
  if (!/^[a-z0-9.-]+\.json$/.test(name)) { res.writeHead(404).end(); return }
  try { const file = await readFile(`dist/public/${name}`); res.writeHead(200, { 'content-type': 'application/json' }).end(file) }
  catch { res.writeHead(404).end() }
}).listen(Number(process.env.PORT || 4101), '127.0.0.1', () => console.log('Source repository available on loopback'))
