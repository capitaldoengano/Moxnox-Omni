import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { EventStore } from "../src/infra/event-store.js"

const event = {
  id: "event-1",
  externalId: "provider:event-1",
  accountKey: "capital-do-engano",
  accountId: "capital-account",
  contactId: "contact-1",
  channel: "instagram",
  kind: "message",
  text: "Olá",
}

test("deduplicates concurrent inbound writes and lists safe recovery work", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "moxnox-event-store-"))
  t.after(() => rm(dataDir, { recursive: true, force: true }))
  const store = new EventStore(dataDir)
  await store.initialize()

  const results = await Promise.all([store.recordInbound(event), store.recordInbound(event)])
  assert.deepEqual(results.sort(), [false, true])
  assert.deepEqual(store.listUnprocessedEvents().map((item) => item.id), ["event-1"])

  await store.recordDecision(event.id, { outcome: "human_review", reason: "test" })
  assert.deepEqual(store.listUnprocessedEvents(), [])

  const reopened = new EventStore(dataDir)
  await reopened.initialize()
  assert.equal(await reopened.recordInbound(event), false)
})
