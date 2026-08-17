import test from "node:test"
import assert from "node:assert/strict"
import { buildSetupStatus } from "../src/domain/setup-status.js"

test("builds an installation checklist without exposing configured values", () => {
  const config = {
    deliveryMode: "dry-run",
    publicBaseUrl: "https://omni.example.test",
    automationCooldownMinutes: 1440,
    adminApiKey: "admin-value-that-must-not-leak",
    webchatSiteToken: "webchat-value-that-must-not-leak",
    metaAppId: "meta-app-id-1234",
    metaAppSecret: "meta-secret-that-must-not-leak",
    metaVerifyToken: "verify-value-that-must-not-leak",
    instagramAccounts: [
      {
        key: "capital-do-engano",
        accountId: "capital-id-1234",
        accessToken: "capital-token-that-must-not-leak",
      },
      { key: "gu", accountId: "gu-id-5678", accessToken: "gu-token-that-must-not-leak" },
    ],
    whatsappBusinessAccountId: "waba-id-1234",
    whatsappPhoneNumberId: "phone-id-5678",
    whatsappAccessToken: "whatsapp-token-that-must-not-leak",
  }
  const status = buildSetupStatus(config)
  const serialized = JSON.stringify(status)

  assert.equal(status.access.method, "browser")
  assert.equal(status.access.cockpitUrl, "https://omni.example.test/cockpit")
  assert.equal(status.access.webhookUrl, "https://omni.example.test/webhooks/meta")
  assert.equal(status.network.webhookCanBeRegistered, true)
  assert.equal(status.progress.percentage, 100)
  assert.doesNotMatch(serialized, /must-not-leak/)
  assert.doesNotMatch(serialized, /meta-app-id-1234|capital-id-1234|phone-id-5678/)
})

test("warns when localhost cannot receive Meta webhooks", () => {
  const status = buildSetupStatus({
    deliveryMode: "dry-run",
    publicBaseUrl: "http://localhost:3333",
    instagramAccounts: [],
  })
  assert.equal(status.network.publicUrlIsLocal, true)
  assert.equal(status.network.webhookCanBeRegistered, false)
})
