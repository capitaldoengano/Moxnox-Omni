import { randomBytes } from "node:crypto"
import { access, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createInterface } from "node:readline/promises"
import { pathToFileURL } from "node:url"

const secret = () => randomBytes(32).toString("base64url")

const replaceValue = (template, key, value) => {
  if (/[\r\n]/.test(value)) throw new Error(`${key} contains an invalid line break`)
  const pattern = new RegExp(`^${key}=.*$`, "m")
  if (!pattern.test(template)) throw new Error(`${key} was not found in .env.example`)
  return template.replace(pattern, `${key}=${value}`)
}

export function buildEnvironment(template, { publicBaseUrl, generated = {} }) {
  let output = template
  for (const [key, value] of Object.entries({
    NODE_ENV: "production",
    DELIVERY_MODE: "dry-run",
    PUBLIC_BASE_URL: publicBaseUrl,
    ADMIN_API_KEY: generated.adminApiKey ?? secret(),
    WEBCHAT_SITE_TOKEN: generated.webchatSiteToken ?? secret(),
    META_VERIFY_TOKEN: generated.metaVerifyToken ?? secret(),
    META_APP_SECRET: "",
  })) {
    output = replaceValue(output, key, value)
  }
  return output
}

const parsePublicUrl = (value) => {
  const normalized = String(value || "http://localhost:3333").replace(/\/$/, "")
  const url = new URL(normalized)
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("A URL precisa começar com http:// ou https://")
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Informe somente a origem, sem caminho, consulta ou credenciais")
  }
  return url.origin
}

export async function runSetup({ rootDir = process.cwd(), input = process.stdin, output = process.stdout } = {}) {
  const templatePath = path.join(rootDir, ".env.example")
  const destinationPath = path.join(rootDir, ".env")
  try {
    await access(destinationPath)
    throw new Error("O arquivo .env já existe e não foi alterado.")
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
  const terminal = createInterface({ input, output })
  let publicBaseUrl
  try {
    const answer = await terminal.question(
      "URL pública do Moxnox [http://localhost:3333]: ",
    )
    publicBaseUrl = parsePublicUrl(answer.trim())
  } finally {
    terminal.close()
  }

  const generated = {
    adminApiKey: secret(),
    webchatSiteToken: secret(),
    metaVerifyToken: secret(),
  }
  const template = await readFile(templatePath, "utf8")
  const contents = buildEnvironment(template, { publicBaseUrl, generated })
  try {
    await writeFile(destinationPath, contents, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    })
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new Error("O arquivo .env já existe e não foi alterado.")
    }
    throw error
  }

  output.write("\nConfiguração local criada em .env.\n")
  output.write(`Chave do cockpit: ${generated.adminApiKey}\n`)
  output.write(`Token de verificação Meta: ${generated.metaVerifyToken}\n`)
  output.write("\nGuarde esses valores. Agora rode npm start e abra /cockpit.\n")
  output.write("No cockpit, entre em Operação para completar e testar as credenciais da Meta.\n")
  return { destinationPath, publicBaseUrl, generated }
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) {
  try {
    await runSetup()
  } catch (error) {
    console.error(`\nInstalação não concluída: ${error.message}`)
    process.exitCode = 1
  }
}
