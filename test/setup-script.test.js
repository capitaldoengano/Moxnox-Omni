import test from "node:test"
import assert from "node:assert/strict"
import { copyFile, mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { Readable, Writable } from "node:stream"
import { tmpdir } from "node:os"
import path from "node:path"
import { buildEnvironment, runSetup } from "../scripts/setup.mjs"

const capture = () => {
  let contents = ""
  return {
    stream: new Writable({
      write(chunk, _encoding, callback) {
        contents += chunk.toString()
        callback()
      },
    }),
    contents: () => contents,
  }
}

test("generates strong local values without inventing Meta credentials", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "moxnox-setup-"))
  t.after(() => rm(dataDir, { recursive: true, force: true }))
  await copyFile(path.resolve(".env.example"), path.join(dataDir, ".env.example"))
  const output = capture()
  const result = await runSetup({
    rootDir: dataDir,
    input: Readable.from(["https://omni.example.test\n"]),
    output: output.stream,
  })
  const env = await readFile(path.join(dataDir, ".env"), "utf8")
  const mode = (await stat(path.join(dataDir, ".env"))).mode & 0o777

  assert.match(env, /^NODE_ENV=production$/m)
  assert.match(env, /^DELIVERY_MODE=dry-run$/m)
  assert.match(env, /^PUBLIC_BASE_URL=https:\/\/omni\.example\.test$/m)
  assert.match(env, new RegExp(`^ADMIN_API_KEY=${result.generated.adminApiKey}$`, "m"))
  assert.match(env, /^META_APP_SECRET=$/m)
  assert.doesNotMatch(env, /replace-with-at-least-24/)
  assert.equal(result.generated.adminApiKey.length >= 40, true)
  assert.equal(mode, 0o600)
  assert.match(output.contents(), /Chave do cockpit:/)

  await assert.rejects(
    () =>
      runSetup({
        rootDir: dataDir,
        input: Readable.from(["\n"]),
        output: capture().stream,
      }),
    /já existe/,
  )
})

test("buildEnvironment rejects values that could inject another variable", () => {
  const template = [
    "NODE_ENV=development",
    "DELIVERY_MODE=dry-run",
    "PUBLIC_BASE_URL=http://localhost:3333",
    "ADMIN_API_KEY=replace-me",
    "WEBCHAT_SITE_TOKEN=replace-me",
    "META_VERIFY_TOKEN=replace-me",
    "META_APP_SECRET=replace-me",
  ].join("\n")
  assert.throws(
    () =>
      buildEnvironment(template, {
        publicBaseUrl: "https://safe.test\nDELIVERY_MODE=live",
      }),
    /invalid line break/,
  )
})
