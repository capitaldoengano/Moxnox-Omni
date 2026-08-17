import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createApp } from "../src/app.js"
import { createPipeline } from "../src/domain/pipeline.js"
import { EventStore } from "../src/infra/event-store.js"
import { JobQueue } from "../src/infra/job-queue.js"

test("serves the cockpit and exposes authenticated operational data", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "moxnox-cockpit-"))
  const store = new EventStore(dataDir)
  await store.initialize()
  const dispatcher = {
    async send() {
      return { status: "planned", providerMessageId: null }
    },
  }
  const pipeline = createPipeline({ store, rules: [], dispatcher })
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
  const app = createApp({ config, store, queue, pipeline })
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
})
