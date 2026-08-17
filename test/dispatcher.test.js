import test from "node:test"
import assert from "node:assert/strict"
import { createDispatcher } from "../src/channels/dispatcher.js"

test("selects the Instagram token that owns the inbound account", async (t) => {
  const requests = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options })
    return new Response(JSON.stringify({ id: "provider-message-1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  const dispatcher = createDispatcher({
    deliveryMode: "live",
    liveAccounts: ["gu"],
    instagramGraphBaseUrl: "https://graph.instagram.example",
    metaApiVersion: "v23.0",
    instagramAccessToken: "",
    instagramAccounts: [
      { accountId: "capital-id", accessToken: "capital-access-token" },
      { accountId: "gu-id", accessToken: "gu-access-token" },
    ],
  })
  assert.equal(dispatcher.modeFor({ accountKey: "gu" }), "live")
  assert.equal(dispatcher.modeFor({ accountKey: "capital-do-engano" }), "protected")
  const result = await dispatcher.send(
    {
      channel: "instagram",
      accountKey: "gu",
      kind: "message",
      accountId: "gu-id",
      contactId: "contact-id",
    },
    { id: "outbound-id", target: "direct_message", text: "Olá" },
  )

  assert.equal(result.status, "delivered")
  assert.equal(requests.length, 1)
  assert.equal(requests[0].options.headers.authorization, "Bearer gu-access-token")
})

test("keeps non-selected accounts protected even when delivery mode is live", async () => {
  const dispatcher = createDispatcher({
    deliveryMode: "live",
    liveAccounts: ["capital-do-engano"],
  })
  const result = await dispatcher.send(
    { channel: "instagram", accountKey: "gu" },
    { id: "outbound-id", target: "direct_message", text: "Olá" },
  )
  assert.deepEqual(result, {
    status: "planned",
    providerMessageId: null,
    reason: "account_not_live",
  })
})
