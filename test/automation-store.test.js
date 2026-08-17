import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createPipeline } from "../src/domain/pipeline.js"
import { AutomationStore } from "../src/infra/automation-store.js"
import { EventStore } from "../src/infra/event-store.js"

const seedFile = path.resolve("config/automations.example.json")

test("persists validated automation changes and reloads them", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "moxnox-automations-"))
  t.after(() => rm(dataDir, { recursive: true, force: true }))
  const store = new AutomationStore(dataDir, seedFile)
  await store.initialize()
  assert.equal(store.list().length, 3)

  const saved = await store.upsert({
    id: "webchat-new-interest",
    name: "Novo interesse no webchat",
    enabled: true,
    accounts: ["webchat"],
    channels: ["webchat"],
    kinds: ["message"],
    match: { mode: "containsAny", terms: ["quero saber"] },
    action: { messageReply: "Vamos conversar." },
  })
  assert.equal(saved.id, "webchat-new-interest")

  await Promise.all(
    ["one", "two"].map((suffix) =>
      store.upsert({
        id: `webchat-concurrent-${suffix}`,
        name: `Regra concorrente ${suffix}`,
        enabled: true,
        accounts: ["webchat"],
        channels: ["webchat"],
        kinds: ["message"],
        match: { mode: "containsAny", terms: [`gatilho ${suffix}`] },
        action: { messageReply: `Resposta ${suffix}` },
      }),
    ),
  )

  const reloaded = new AutomationStore(dataDir, seedFile)
  await reloaded.initialize()
  assert.equal(
    reloaded.list().find((rule) => rule.id === "webchat-new-interest").action.messageReply,
    "Vamos conversar.",
  )
  assert.equal(reloaded.list().filter((rule) => rule.id.startsWith("webchat-concurrent-")).length, 2)
  await assert.rejects(
    () =>
      reloaded.upsert({
        ...saved,
        accounts: [],
      }),
    /accounts_required/,
  )
})

test("pipeline reads updated rules without restarting", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "moxnox-dynamic-rules-"))
  t.after(() => rm(dataDir, { recursive: true, force: true }))
  const automationStore = new AutomationStore(dataDir, seedFile)
  await automationStore.initialize()
  await automationStore.upsert({
    id: "webchat-live-edit",
    name: "Edição imediata",
    enabled: true,
    accounts: ["webchat"],
    channels: ["webchat"],
    kinds: ["message"],
    match: { mode: "containsAny", terms: ["primeira versão"] },
    action: { messageReply: "Resposta inicial" },
  })
  const eventStore = new EventStore(dataDir)
  await eventStore.initialize()
  const sent = []
  const pipeline = createPipeline({
    store: eventStore,
    rules: () => automationStore.list(),
    dispatcher: {
      async send(_event, outbound) {
        sent.push(outbound)
        return { status: "planned" }
      },
    },
  })

  const first = {
    id: "event-first",
    externalId: "event-first",
    accountKey: "webchat",
    channel: "webchat",
    kind: "message",
    text: "primeira versão",
  }
  await eventStore.recordInbound(first)
  await pipeline.process(first)
  assert.equal(sent.at(-1).text, "Resposta inicial")

  await automationStore.upsert({
    id: "webchat-live-edit",
    name: "Edição imediata",
    enabled: true,
    accounts: ["webchat"],
    channels: ["webchat"],
    kinds: ["message"],
    match: { mode: "containsAny", terms: ["segunda versão"] },
    action: { messageReply: "Resposta atualizada" },
  })
  const second = { ...first, id: "event-second", externalId: "event-second", text: "segunda versão" }
  await eventStore.recordInbound(second)
  await pipeline.process(second)
  assert.equal(sent.at(-1).text, "Resposta atualizada")
})
