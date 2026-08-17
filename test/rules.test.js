import test from "node:test"
import assert from "node:assert/strict"
import { decideEvent } from "../src/domain/rules.js"

const rules = [
  {
    id: "information",
    enabled: true,
    channels: ["instagram"],
    kinds: ["comment"],
    match: { mode: "containsAny", terms: ["informação"] },
    action: { privateReply: "Olá" },
  },
]

test("matches terms without depending on accents", () => {
  const decision = decideEvent(
    { channel: "instagram", kind: "comment", text: "Quero informacao" },
    rules,
  )
  assert.equal(decision.outcome, "automated")
  assert.equal(decision.ruleId, "information")
})

test("sends sensitive content to human review", () => {
  const decision = decideEvent(
    { channel: "instagram", kind: "comment", text: "Quero denunciar um abuso" },
    rules,
  )
  assert.deepEqual(decision, {
    outcome: "human_review",
    reason: "sensitive_content",
  })
})

test("does not invent an answer when no rule matches", () => {
  const decision = decideEvent(
    { channel: "instagram", kind: "comment", text: "Outra coisa" },
    rules,
  )
  assert.equal(decision.outcome, "human_review")
  assert.equal(decision.reason, "no_matching_automation")
})

