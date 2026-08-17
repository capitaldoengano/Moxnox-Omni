import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createPipeline } from "../src/domain/pipeline.js"
import { EventStore } from "../src/infra/event-store.js"

const rule = {
  id: "sales",
  enabled: true,
  accounts: ["capital-do-engano"],
  channels: ["instagram"],
  kinds: ["message"],
  match: { mode: "containsAny", terms: ["valor", "vaga"] },
  action: { messageReply: "Resposta comercial" },
}

const event = (id, text) => ({
  id,
  externalId: id,
  accountKey: "capital-do-engano",
  accountId: "capital-account",
  contactId: "same-contact",
  conversationId: "same-contact",
  channel: "instagram",
  kind: "message",
  text,
})

test("prevents a repeated sales pitch and preserves contact history", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "moxnox-cooldown-"))
  t.after(() => rm(dataDir, { recursive: true, force: true }))
  const store = new EventStore(dataDir)
  await store.initialize()
  const sent = []
  const pipeline = createPipeline({
    store,
    rules: [rule],
    automationCooldownMs: 24 * 60 * 60 * 1_000,
    dispatcher: {
      async send(_event, outbound) {
        sent.push(outbound)
        return { status: "planned" }
      },
    },
  })

  const first = event("first", "Qual o valor?")
  await store.recordInbound(first)
  assert.equal((await pipeline.process(first)).outcome, "automated")
  const second = event("second", "Ainda tem vaga?")
  await store.recordInbound(second)
  const decision = await pipeline.process(second)

  assert.equal(decision.outcome, "human_review")
  assert.equal(decision.reason, "recent_automation")
  assert.equal(sent.length, 1)
  assert.equal(store.listReviews()[0].event.id, "second")
  assert.equal(store.listContactHistory("second").length, 3)
  assert.equal(store.getAnalytics().repetitionPrevented, 1)
  assert.equal(store.getAnalytics().automationRate, 50)
})

test("does not start the repetition cooldown after a failed delivery", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "moxnox-failed-cooldown-"))
  t.after(() => rm(dataDir, { recursive: true, force: true }))
  const store = new EventStore(dataDir)
  await store.initialize()
  let attempts = 0
  const pipeline = createPipeline({
    store,
    rules: [rule],
    automationCooldownMs: 24 * 60 * 60 * 1_000,
    dispatcher: {
      async send() {
        attempts += 1
        if (attempts === 1) throw new Error("provider unavailable")
        return { status: "planned" }
      },
    },
  })

  const first = event("failed-first", "Qual o valor?")
  await store.recordInbound(first)
  await assert.rejects(() => pipeline.process(first), /provider unavailable/)
  const second = event("retry-second", "Ainda tem vaga?")
  await store.recordInbound(second)
  const decision = await pipeline.process(second)

  assert.equal(decision.outcome, "automated")
  assert.equal(attempts, 2)
  assert.equal(store.getAnalytics().responded, 1)
})
