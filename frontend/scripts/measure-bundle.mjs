import { readdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(dirname(fileURLToPath(import.meta.url)), '../dist')
async function walk(folder) {
  const entries = await readdir(folder, { withFileTypes: true })
  const groups = await Promise.all(entries.map(async (entry) => {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) return walk(path)
    const data = await readFile(path)
    return [{
      path: relative(directory, path).replaceAll('\\', '/'),
      bytes: data.length,
      gzipBytes: gzipSync(data, { level: 6 }).length,
      sha256: createHash('sha256').update(data).digest('hex'),
    }]
  }))
  return groups.flat()
}
const files = (await walk(directory)).sort((a, b) => a.path.localeCompare(b.path))
console.log(JSON.stringify({
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  files,
  note: 'gzipBytes use Node zlib gzip level 6 as an offline estimate; the static server may serve uncompressed files.',
}, null, 2))
