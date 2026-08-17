import test from "node:test"
import assert from "node:assert/strict"
import { normalizeMetaPayload } from "../src/domain/normalize-meta.js"

test("normalizes an Instagram comment", () => {
  const [event] = normalizeMetaPayload({
    object: "instagram",
    entry: [
      {
        id: "ig-account-1",
        changes: [
          {
            field: "comments",
            value: {
              id: "comment-1",
              text: "Quero informações",
              from: { id: "person-1", username: "pessoa" },
              media: { id: "post-1" },
            },
          },
        ],
      },
    ],
  })

  assert.equal(event.channel, "instagram")
  assert.equal(event.kind, "comment")
  assert.equal(event.externalId, "instagram:comment:comment-1")
  assert.equal(event.conversationId, "post-1")
  assert.equal(event.text, "Quero informações")
})

test("normalizes a WhatsApp text message", () => {
  const [event] = normalizeMetaPayload({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "phone-1" },
              contacts: [{ wa_id: "5511999999999", profile: { name: "Gu" } }],
              messages: [
                {
                  id: "wamid.1",
                  from: "5511999999999",
                  type: "text",
                  text: { body: "Como funciona?" },
                },
              ],
            },
          },
        ],
      },
    ],
  })

  assert.equal(event.channel, "whatsapp")
  assert.equal(event.externalId, "whatsapp:message:wamid.1")
  assert.equal(event.contactName, "Gu")
})

