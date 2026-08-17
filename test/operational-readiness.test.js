import test from "node:test"
import assert from "node:assert/strict"
import { buildOperationalReadiness } from "../src/domain/operational-readiness.js"

const config = {
  nodeEnv: "production",
  deliveryMode: "dry-run",
  liveAccounts: [],
  publicBaseUrl: "https://omni.example.test",
  metaVerifyToken: "verify-secret",
  metaAppSecret: "app-secret",
  instagramAccounts: [
    {
      key: "capital-do-engano",
      label: "Capital do Engano",
      accountId: "capital-id",
      accessToken: "capital-secret",
    },
  ],
}

const inbound = {
  event: { accountKey: "capital-do-engano" },
  receivedAt: "2026-08-17T17:00:00.000Z",
  outbound: [],
}

test("separates dry-run readiness from live readiness", () => {
  const store = { listInbox: () => [inbound], listReviews: () => [] }
  const dryRun = buildOperationalReadiness(config, store)
  assert.equal(dryRun.stage, "dry-run")
  assert.equal(dryRun.pilotReady, true)
  assert.equal(dryRun.liveReady, false)
  assert.equal(dryRun.summary.liveAccounts, 0)

  const live = buildOperationalReadiness(
    { ...config, deliveryMode: "live", liveAccounts: ["capital-do-engano"] },
    store,
  )
  assert.equal(live.stage, "live")
  assert.equal(live.liveReady, true)
  assert.equal(live.accounts[0].live, true)
})

test("blocks pilot readiness without public HTTPS", () => {
  const status = buildOperationalReadiness(
    { ...config, publicBaseUrl: "http://localhost:3333" },
    { listInbox: () => [], listReviews: () => [] },
  )
  assert.equal(status.stage, "configuration")
  assert.equal(status.pilotReady, false)
  assert.equal(
    status.checks.find((entry) => entry.id === "public-https").status,
    "blocked",
  )
})
