import { randomUUID } from "node:crypto"

const textOrEmpty = (value) => (typeof value === "string" ? value : "")

const makeEvent = (input) => ({
  id: randomUUID(),
  provider: "meta",
  receivedAt: new Date().toISOString(),
  ...input,
})

function normalizeInstagramEntry(entry) {
  const events = []
  const changes = Array.isArray(entry.changes) ? entry.changes : []
  if (entry.field === "comments") {
    changes.push({ field: "comments", value: entry.value })
  }

  for (const change of changes) {
    if (change?.field !== "comments" || !change.value?.id) continue
    const value = change.value
    events.push(
      makeEvent({
        externalId: `instagram:comment:${value.id}`,
        channel: "instagram",
        kind: "comment",
        accountId: textOrEmpty(entry.id),
        contactId: textOrEmpty(value.from?.id),
        contactName: textOrEmpty(value.from?.username),
        conversationId: textOrEmpty(value.media?.id),
        postId: textOrEmpty(value.media?.id),
        commentId: textOrEmpty(value.id),
        parentCommentId: textOrEmpty(value.parent_id),
        text: textOrEmpty(value.text),
      }),
    )
  }

  for (const messageEvent of entry.messaging ?? []) {
    const message = messageEvent?.message
    if (!message?.mid || message.is_echo) continue
    events.push(
      makeEvent({
        externalId: `instagram:message:${message.mid}`,
        channel: "instagram",
        kind: "message",
        accountId: textOrEmpty(messageEvent.recipient?.id),
        contactId: textOrEmpty(messageEvent.sender?.id),
        contactName: "",
        conversationId: textOrEmpty(messageEvent.sender?.id),
        postId: "",
        commentId: "",
        parentCommentId: "",
        text: textOrEmpty(message.text),
      }),
    )
  }
  return events
}

function normalizePageEntry(entry) {
  const events = []
  for (const change of entry.changes ?? []) {
    const value = change?.value
    if (
      change?.field !== "feed" ||
      value?.item !== "comment" ||
      value?.verb !== "add" ||
      !value?.comment_id
    ) {
      continue
    }
    events.push(
      makeEvent({
        externalId: `messenger:comment:${value.comment_id}`,
        channel: "messenger",
        kind: "comment",
        accountId: textOrEmpty(entry.id),
        contactId: textOrEmpty(value.from?.id),
        contactName: textOrEmpty(value.from?.name),
        conversationId: textOrEmpty(value.post_id),
        postId: textOrEmpty(value.post_id),
        commentId: textOrEmpty(value.comment_id),
        parentCommentId: textOrEmpty(value.parent_id),
        text: textOrEmpty(value.message),
      }),
    )
  }

  for (const messageEvent of entry.messaging ?? []) {
    const message = messageEvent?.message
    if (!message?.mid || message.is_echo) continue
    events.push(
      makeEvent({
        externalId: `messenger:message:${message.mid}`,
        channel: "messenger",
        kind: "message",
        accountId: textOrEmpty(messageEvent.recipient?.id),
        contactId: textOrEmpty(messageEvent.sender?.id),
        contactName: "",
        conversationId: textOrEmpty(messageEvent.sender?.id),
        postId: "",
        commentId: "",
        parentCommentId: "",
        text: textOrEmpty(message.text),
      }),
    )
  }
  return events
}

function normalizeWhatsAppEntry(entry) {
  const events = []
  for (const change of entry.changes ?? []) {
    if (change?.field !== "messages") continue
    const value = change.value ?? {}
    const names = new Map(
      (value.contacts ?? []).map((contact) => [
        contact.wa_id,
        textOrEmpty(contact.profile?.name),
      ]),
    )
    for (const message of value.messages ?? []) {
      if (!message?.id) continue
      events.push(
        makeEvent({
          externalId: `whatsapp:message:${message.id}`,
          channel: "whatsapp",
          kind: "message",
          accountId: textOrEmpty(value.metadata?.phone_number_id),
          contactId: textOrEmpty(message.from),
          contactName: names.get(message.from) ?? "",
          conversationId: textOrEmpty(message.from),
          postId: "",
          commentId: "",
          parentCommentId: "",
          text: textOrEmpty(message.text?.body),
        }),
      )
    }
  }
  return events
}

export function normalizeMetaPayload(payload) {
  if (!payload || !Array.isArray(payload.entry)) return []
  return payload.entry.flatMap((entry) => {
    if (payload.object === "instagram") return normalizeInstagramEntry(entry)
    if (payload.object === "page") return normalizePageEntry(entry)
    if (payload.object === "whatsapp_business_account") {
      return normalizeWhatsAppEntry(entry)
    }
    return []
  })
}

