import test from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createApp } from "../src/app.js"
import { createPipeline } from "../src/domain/pipeline.js"
import { EventStore } from "../src/infra/event-store.js"
import { JobQueue } from "../src/infra/job-queue.js"

const secret = "test-secret-with-more-than-24-characters"

const signatureFor = (body) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`

test("verifies, ingests and deduplicates Meta webhooks", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "moxnox-omni-"))
  const store = new EventStore(dataDir)
  await store.initialize()
  const sent = []
  const dispatcher = {
    async send(event, outbound) {
      sent.push({ event, outbound })
      return { status: "planned", providerMessageId: null }
    },
  }
  const pipeline = createPipeline({
    store,
    dispatcher,
    rules: [
      {
        id: "information",
        enabled: true,
        channels: ["instagram"],
        kinds: ["comment"],
        match: { mode: "containsAny", terms: ["informação"] },
        action: { publicReply: "Resposta pública", privateReply: "Resposta privada" },
      },
    ],
  })
  const queue = new JobQueue((event) => pipeline.process(event))
  const app = createApp({
    config: {
      metaVerifyToken: "verify-token",
      metaAppSecret: secret,
      webchatSiteToken: "site-token",
      adminApiKey: "admin-key",
      instagramAccounts: [
        {
          key: "capital-do-engano",
          label: "Capital do Engano",
          accountId: "account-1",
        },
      ],
    },
    store,
    queue,
    pipeline,
  })
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve))
  const address = app.address()
  const baseUrl = `http://127.0.0.1:${address.port}`
  t.after(async () => {
    await new Promise((resolve) => app.close(resolve))
    await rm(dataDir, { recursive: true, force: true })
  })

  const payload = JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: "account-1",
        changes: [
          {
            field: "comments",
            value: {
              id: "comment-1",
              text: "Quero informação",
              from: { id: "person-1", username: "pessoa" },
              media: { id: "post-1" },
            },
          },
        ],
      },
    ],
  })

  const sendWebhook = () =>
    fetch(`${baseUrl}/webhooks/meta`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signatureFor(payload),
      },
      body: payload,
    })

  const first = await sendWebhook()
  assert.equal(first.status, 202)
  assert.deepEqual(await first.json(), { accepted: 1, ignored: 0 })
  await queue.drain()
  assert.equal(sent.length, 2)
  assert.equal(sent[0].event.accountKey, "capital-do-engano")
  assert.equal(sent[0].outbound.target, "private_comment_reply")
  assert.equal(sent[1].outbound.target, "public_comment")

  const duplicate = await sendWebhook()
  assert.deepEqual(await duplicate.json(), { accepted: 0, ignored: 1 })
})

test("rejects a webhook with an invalid signature", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "moxnox-omni-"))
  const store = new EventStore(dataDir)
  await store.initialize()
  const pipeline = createPipeline({
    store,
    rules: [],
    dispatcher: { send: async () => ({ status: "planned" }) },
  })
  const queue = new JobQueue((event) => pipeline.process(event))
  const app = createApp({
    config: {
      metaVerifyToken: "verify-token",
      metaAppSecret: secret,
      webchatSiteToken: "site-token",
      adminApiKey: "admin-key",
    },
    store,
    queue,
    pipeline,
  })
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve))
  const address = app.address()
  t.after(async () => {
    await new Promise((resolve) => app.close(resolve))
    await rm(dataDir, { recursive: true, force: true })
  })
  const response = await fetch(`http://127.0.0.1:${address.port}/webhooks/meta`, {
    method: "POST",
    headers: { "x-hub-signature-256": "sha256=invalid" },
    body: "{}",
  })
  assert.equal(response.status, 401)
})

test("does not accept an empty verification token", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "moxnox-omni-"))
  const store = new EventStore(dataDir)
  await store.initialize()
  const pipeline = createPipeline({
    store,
    rules: [],
    dispatcher: { send: async () => ({ status: "planned" }) },
  })
  const queue = new JobQueue((event) => pipeline.process(event))
  const app = createApp({
    config: {
      metaVerifyToken: "",
      metaAppSecret: secret,
      webchatSiteToken: "site-token",
      adminApiKey: "admin-key",
    },
    store,
    queue,
    pipeline,
  })
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve))
  const address = app.address()
  t.after(async () => {
    await new Promise((resolve) => app.close(resolve))
    await rm(dataDir, { recursive: true, force: true })
  })
  const response = await fetch(
    `http://127.0.0.1:${address.port}/webhooks/meta?hub.mode=subscribe&hub.challenge=x`,
  )
  assert.equal(response.status, 403)
})
