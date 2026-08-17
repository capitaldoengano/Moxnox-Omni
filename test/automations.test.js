import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { loadAutomations } from "../src/config.js"
import { decideEvent } from "../src/domain/rules.js"

const automationsPath = path.resolve("config/automations.example.json")

test("ships separate Desejo que Pensa sales replies for each account", async () => {
  const automations = await loadAutomations(automationsPath)
  const cases = [
    ["capital-do-engano", "capital-desejo-que-pensa-sales"],
    ["gu", "gu-desejo-que-pensa-sales"],
    ["whatsapp", "whatsapp-desejo-que-pensa-sales"],
  ]
  for (const [accountKey, ruleId] of cases) {
    const decision = decideEvent(
      {
        accountKey,
        channel: accountKey === "whatsapp" ? "whatsapp" : "instagram",
        kind: "message",
        text: "Qual o valor e como funciona?",
      },
      automations,
    )
    assert.equal(decision.ruleId, ruleId)
    assert.match(decision.action.messageReply, /R\$ 60/)
    assert.match(
      decision.action.messageReply,
      /https:\/\/capitaldoengano\.github\.io\/desejoquepensa\//,
    )
  }
})

test("does not reuse the Capital reply on the Gu profile", async () => {
  const automations = await loadAutomations(automationsPath)
  const decision = decideEvent(
    {
      accountKey: "gu",
      channel: "instagram",
      kind: "message",
      text: "Tem vaga?",
    },
    automations,
  )
  assert.equal(decision.ruleId, "gu-desejo-que-pensa-sales")
  assert.match(decision.action.messageReply, /me conta o que te trouxe/)
})

test("keeps unrelated messages in human review", async () => {
  const automations = await loadAutomations(automationsPath)
  const decision = decideEvent(
    {
      accountKey: "capital-do-engano",
      channel: "instagram",
      kind: "message",
      text: "Queria conversar sobre outra coisa",
    },
    automations,
  )
  assert.equal(decision.outcome, "human_review")
})
