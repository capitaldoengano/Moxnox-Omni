import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { EventStore } from "../src/infra/event-store.js"

test("keeps an append-only classification history and exposes the latest value", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "moxnox-classification-"))
  t.after(() => rm(dataDir, { recursive: true, force: true }))
  const store = new EventStore(dataDir)
  await store.initialize()
  await store.recordInbound({
    id: "event-1",
    externalId: "external-1",
    accountId: "account-1",
    accountKey: "capital-do-engano",
    contactId: "contact-1",
    channel: "instagram",
    kind: "message",
    text: "Quero participar",
  })
  await store.classify("event-1", { category: "potential_lead", note: "Primeiro contato" })
  await store.classify("event-1", { category: "qualified_lead", note: "Confirmou interesse" })

  const reloaded = new EventStore(dataDir)
  await reloaded.initialize()
  assert.deepEqual(
    reloaded.listInbox()[0].classification.category,
    "qualified_lead",
  )
  assert.equal(reloaded.listInbox()[0].classification.note, "Confirmou interesse")
  await assert.rejects(
    () => reloaded.classify("event-1", { category: "invented" }),
    /invalid_classification_category/,
  )
  await assert.rejects(
    () => reloaded.classify("missing", { category: "resolved" }),
    /event_not_found/,
  )
})
