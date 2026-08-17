import test from "node:test"
import assert from "node:assert/strict"
import { analyzeMessage } from "../src/domain/analyze-message.js"

test("identifies a likely info-product sales opportunity", () => {
  assert.deepEqual(
    analyzeMessage({ kind: "message", text: "Qual o valor e ainda tem vaga?" }),
    { intent: "sales", label: "Possível venda", priority: "high" },
  )
})

test("keeps sensitive decisions above commercial classification", () => {
  assert.equal(
    analyzeMessage(
      { kind: "message", text: "Quero saber o preço" },
      { outcome: "human_review", reason: "sensitive_content" },
    ).intent,
    "sensitive",
  )
})

test("treats ordinary comments as engagement", () => {
  assert.equal(analyzeMessage({ kind: "comment", text: "Esse post me pegou" }).intent, "engagement")
})
