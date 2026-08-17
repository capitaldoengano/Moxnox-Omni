import { randomUUID } from "node:crypto"
import { decideEvent } from "./rules.js"

function buildOutbound(event, action) {
  const messages = []
  if (event.kind === "comment" && action.publicReply) {
    messages.push({ target: "public_comment", text: action.publicReply })
  }
  if (event.kind === "comment" && action.privateReply) {
    messages.push({ target: "private_comment_reply", text: action.privateReply })
  }
  if (event.kind === "message" && action.messageReply) {
    messages.push({ target: "direct_message", text: action.messageReply })
  }
  return messages.map((message) => ({ id: randomUUID(), ...message }))
}

export function createPipeline({ store, rules, dispatcher }) {
  const deliver = async (event, outbound) => {
    try {
      const result = await dispatcher.send(event, outbound)
      await store.recordOutbound(event.id, { ...outbound, ...result })
      return result
    } catch (error) {
      await store.recordOutbound(event.id, {
        ...outbound,
        status: "failed",
        error: error.message,
      })
      throw error
    }
  }

  return {
    async process(event) {
      const decision = decideEvent(event, rules)
      await store.recordDecision(event.id, decision)
      if (decision.outcome !== "automated") return decision
      for (const outbound of buildOutbound(event, decision.action)) {
        await deliver(event, outbound)
      }
      return decision
    },

    async approve(eventId, text, target = "direct_message") {
      const event = store.getInbound(eventId)
      if (!event) throw new Error("Event not found")
      const outbound = { id: randomUUID(), target, text }
      const result = await deliver(event, outbound)
      await store.resolveReview(eventId, { outcome: "approved", outboundId: outbound.id })
      return result
    },

    async reject(eventId, reason = "rejected_by_operator") {
      if (!store.getInbound(eventId)) throw new Error("Event not found")
      await store.resolveReview(eventId, { outcome: "rejected", reason })
    },
  }
}

