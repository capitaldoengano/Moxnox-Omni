import { readFile, readdir } from "node:fs/promises"
import path from "node:path"

const roots = ["src", "config", "docs", ".github"]
const suspicious = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:access[_-]?token|app[_-]?secret|api[_-]?key)\s*[:=]\s*["'][A-Za-z0-9_\-.]{24,}["']/i,
]

async function filesUnder(root) {
  const entries = await readdir(root, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const fullPath = path.join(root, entry.name)
      return entry.isDirectory() ? filesUnder(fullPath) : [fullPath]
    }),
  )
  return nested.flat()
}

for (const root of roots) {
  for (const file of await filesUnder(root)) {
    const contents = await readFile(file, "utf8")
    if (suspicious.some((pattern) => pattern.test(contents))) {
      console.error(`Potential secret found in ${file}`)
      process.exitCode = 1
    }
  }
}

if (!process.exitCode) console.log("Secret scan passed")
