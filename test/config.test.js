import test from "node:test"
import assert from "node:assert/strict"
import { loadConfig } from "../src/config.js"

const productionSecrets = {
  ADMIN_API_KEY: "admin-secret-with-more-than-24-characters",
  WEBCHAT_SITE_TOKEN: "site-secret-with-more-than-24-characters",
  META_VERIFY_TOKEN: "verify-secret-with-more-than-24-characters",
  META_APP_SECRET: "meta-secret-with-more-than-24-characters",
}

test("loads separate Instagram account credentials", () => {
  const config = loadConfig({
    CAPITAL_INSTAGRAM_ACCOUNT_ID: "capital-id",
    CAPITAL_INSTAGRAM_ACCESS_TOKEN: "capital-token",
    GU_INSTAGRAM_ACCOUNT_ID: "gu-id",
    GU_INSTAGRAM_ACCESS_TOKEN: "gu-token",
  })
  assert.deepEqual(
    config.instagramAccounts.map(({ key, label, accountId }) => ({
      key,
      label,
      accountId,
    })),
    [
      {
        key: "capital-do-engano",
        label: "Capital do Engano",
        accountId: "capital-id",
      },
      { key: "gu", label: "@ogustavosouzapauli", accountId: "gu-id" },
    ],
  )
  assert.equal(config.metaApiVersion, "v26.0")
  assert.equal(config.automationCooldownMinutes, 1440)
  assert.deepEqual(config.liveAccounts, [])
})

test("rejects template secrets in production", () => {
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: "production",
        ...productionSecrets,
        ADMIN_API_KEY: "replace-with-at-least-24-random-characters",
      }),
    /non-template secret/,
  )
})

test("requires complete provider credential pairs in live mode", () => {
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: "production",
        DELIVERY_MODE: "live",
        LIVE_ACCOUNTS: "gu",
        ...productionSecrets,
        GU_INSTAGRAM_ACCOUNT_ID: "gu-id-without-a-token",
      }),
    /requires both an Instagram account ID and access token/,
  )
})

test("allows the production cockpit to start before Meta is connected", () => {
  const config = loadConfig({
    NODE_ENV: "production",
    DELIVERY_MODE: "dry-run",
    ADMIN_API_KEY: productionSecrets.ADMIN_API_KEY,
    WEBCHAT_SITE_TOKEN: productionSecrets.WEBCHAT_SITE_TOKEN,
  })
  assert.equal(config.metaAppSecret, "")
  assert.equal(config.deliveryMode, "dry-run")
})

test("requires Meta webhook secrets before live delivery", () => {
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: "production",
        DELIVERY_MODE: "live",
        LIVE_ACCOUNTS: "webchat",
        ADMIN_API_KEY: productionSecrets.ADMIN_API_KEY,
        WEBCHAT_SITE_TOKEN: productionSecrets.WEBCHAT_SITE_TOKEN,
      }),
    /META_VERIFY_TOKEN/,
  )
})

test("requires an explicit and valid live account scope", () => {
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: "production",
        DELIVERY_MODE: "live",
        ...productionSecrets,
      }),
    /LIVE_ACCOUNTS must explicitly list/,
  )
  assert.throws(
    () => loadConfig({ LIVE_ACCOUNTS: "capital-do-engano,unknown" }),
    /unknown accounts/,
  )
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: "production",
        DELIVERY_MODE: "live",
        LIVE_ACCOUNTS: "capital-do-engano",
        ...productionSecrets,
      }),
    /capital-do-engano is listed.*not configured/,
  )
})

test("validates the automation repetition cooldown", () => {
  assert.throws(
    () => loadConfig({ AUTOMATION_COOLDOWN_MINUTES: "10081" }),
    /AUTOMATION_COOLDOWN_MINUTES/,
  )
  assert.equal(loadConfig({ AUTOMATION_COOLDOWN_MINUTES: "0" }).automationCooldownMinutes, 0)
})
