import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createApp } from "../src/app.js"
import { createPipeline } from "../src/domain/pipeline.js"
import { AutomationStore } from "../src/infra/automation-store.js"
import { EventStore } from "../src/infra/event-store.js"
import { JobQueue } from "../src/infra/job-queue.js"

test("serves the cockpit and exposes authenticated operational data", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "moxnox-cockpit-"))
  const store = new EventStore(dataDir)
  await store.initialize()
  const automationStore = new AutomationStore(
    dataDir,
    path.resolve("config/automations.example.json"),
  )
  await automationStore.initialize()
  const dispatcher = {
    async send() {
      return { status: "planned", providerMessageId: null }
    },
  }
  const pipeline = createPipeline({
    store,
    rules: () => automationStore.list(),
    dispatcher,
  })
  const queue = new JobQueue((event) => pipeline.process(event))
  const config = {
    deliveryMode: "dry-run",
    publicBaseUrl: "https://omni.example.test",
    adminApiKey: "internal-admin-key",
    webchatSiteToken: "internal-site-token",
    metaVerifyToken: "meta-verify-token",
    metaAppSecret: "meta-app-secret",
    metaAppId: "123456789",
    instagramAccounts: [
      {
        key: "capital-do-engano",
        label: "Capital do Engano",
        accountId: "instagram-capital-1234",
        accessToken: "capital-token-must-not-leak",
      },
      {
        key: "gu",
        label: "@ogustavosouzapauli",
        accountId: "instagram-gu-5678",
        accessToken: "gu-token-must-not-leak",
      },
    ],
    whatsappLabel: "Capital · WhatsApp",
    whatsappPhoneNumberId: "whatsapp-phone-9012",
    whatsappAccessToken: "whatsapp-token-must-not-leak",
  }
  const app = createApp({ config, store, queue, pipeline, automationStore })
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve))
  const baseUrl = `http://127.0.0.1:${app.address().port}`
  t.after(async () => {
    await new Promise((resolve) => app.close(resolve))
    await rm(dataDir, { recursive: true, force: true })
  })

  const cockpit = await fetch(`${baseUrl}/cockpit`)
  assert.equal(cockpit.status, 200)
  assert.match(cockpit.headers.get("content-type"), /text\/html/)
  assert.match(await cockpit.text(), /Cockpit interno/)

  const unauthorized = await fetch(`${baseUrl}/v1/integrations`)
  assert.equal(unauthorized.status, 401)

  const headers = { "x-admin-api-key": config.adminApiKey }
  const integrationsResponse = await fetch(`${baseUrl}/v1/integrations`, { headers })
  assert.equal(integrationsResponse.status, 200)
  const integrationsText = await integrationsResponse.text()
  assert.doesNotMatch(integrationsText, /must-not-leak/)
  const integrations = JSON.parse(integrationsText).data
  assert.equal(integrations.accounts.length, 3)
  assert.equal(integrations.accounts.every((account) => account.configured), true)
  assert.equal(integrations.webhook.url, "https://omni.example.test/webhooks/meta")

  const setupResponse = await fetch(`${baseUrl}/v1/setup`, { headers })
  const setupText = await setupResponse.text()
  assert.equal(setupResponse.status, 200)
  assert.doesNotMatch(setupText, /must-not-leak/)
  const setup = JSON.parse(setupText).data
  assert.equal(setup.access.method, "browser")
  assert.equal(setup.access.cockpitUrl, "https://omni.example.test/cockpit")
  assert.equal(setup.groups.some((group) => group.id === "instagram-gu"), true)

  const inbound = await fetch(`${baseUrl}/v1/webchat/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-site-token": config.webchatSiteToken,
    },
    body: JSON.stringify({
      conversationId: "conversation-1",
      clientMessageId: "message-1",
      contactName: "Pessoa teste",
      text: "Uma pergunta que ainda não possui regra",
    }),
  })
  const inboundPayload = await inbound.json()
  assert.equal(inbound.status, 202)
  await queue.drain()

  const summary = await fetch(`${baseUrl}/v1/summary`, { headers }).then((response) =>
    response.json(),
  )
  assert.equal(summary.data.inbound, 1)
  assert.equal(summary.data.pendingReviews, 1)

  const inbox = await fetch(`${baseUrl}/v1/inbox`, { headers }).then((response) =>
    response.json(),
  )
  assert.equal(inbox.data[0].event.accountLabel, "Webchat")
  assert.equal(inbox.data[0].decision.outcome, "human_review")

  const backlog = await fetch(`${baseUrl}/v1/backlog`, { headers }).then((response) =>
    response.json(),
  )
  assert.equal(backlog.data[0].classification.category, "unclassified")
  assert.equal(backlog.data[0].classification.source, "automatic")

  const classification = await fetch(
    `${baseUrl}/v1/inbox/${encodeURIComponent(inboundPayload.eventId)}/classification`,
    {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ category: "potential_lead", note: "Pediu mais detalhes" }),
    },
  ).then((response) => response.json())
  assert.equal(classification.data.classification.category, "potential_lead")
  assert.equal(classification.data.classification.source, "manual")

  const automations = await fetch(`${baseUrl}/v1/automations`, { headers }).then(
    (response) => response.json(),
  )
  assert.equal(automations.data.length, 3)
  const savedAutomation = await fetch(`${baseUrl}/v1/automations/webchat-interest`, {
    method: "PUT",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      id: "webchat-interest",
      name: "Interesse pelo webchat",
      enabled: true,
      accounts: ["webchat"],
      channels: ["webchat"],
      kinds: ["message"],
      match: { mode: "containsAny", terms: ["quero conhecer"] },
      action: { messageReply: "Conte mais sobre o que você procura." },
    }),
  }).then((response) => response.json())
  assert.equal(savedAutomation.data.id, "webchat-interest")
  const simulation = await fetch(`${baseUrl}/v1/automations/test`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      accountKey: "capital-do-engano",
      channel: "instagram",
      kind: "message",
      text: "Qual o valor?",
    }),
  }).then((response) => response.json())
  assert.equal(simulation.data.decision.ruleId, "capital-desejo-que-pensa-sales")

  const updatedSummary = await fetch(`${baseUrl}/v1/summary`, { headers }).then(
    (response) => response.json(),
  )
  assert.equal(updatedSummary.data.backlog, 1)
  assert.equal(updatedSummary.data.unclassified, 0)
  assert.equal(updatedSummary.data.potentialLeads, 1)

  const approval = await fetch(
    `${baseUrl}/v1/reviews/${encodeURIComponent(inboundPayload.eventId)}/approve`,
    {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ text: "Resposta humana", target: "direct_message" }),
    },
  )
  assert.equal(approval.status, 200)
  assert.equal(store.listReviews().length, 0)

  const analytics = await fetch(`${baseUrl}/v1/analytics`, { headers }).then(
    (response) => response.json(),
  )
  assert.equal(analytics.data.reviewResolutionRate, 100)
  assert.equal(analytics.data.responded, 1)

  const history = await fetch(
    `${baseUrl}/v1/inbox/${encodeURIComponent(inboundPayload.eventId)}/history`,
    { headers },
  ).then((response) => response.json())
  assert.deepEqual(
    history.data.map((record) => record.type),
    ["inbound", "classification", "outbound", "review_resolution"],
  )
})
