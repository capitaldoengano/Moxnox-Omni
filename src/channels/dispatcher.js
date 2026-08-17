const trimSlash = (value) => value.replace(/\/$/, "")

async function postJson(url, token, body) {
  if (!token) throw new Error(`Missing access token for ${url}`)
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = payload?.error?.message ?? `Provider returned ${response.status}`
    throw new Error(message)
  }
  return payload
}

function instagramRequest(config, event, outbound) {
  const base = `${trimSlash(config.instagramGraphBaseUrl)}/${config.metaApiVersion}`
  const account = config.instagramAccounts?.find(
    (candidate) => candidate.accountId && candidate.accountId === event.accountId,
  )
  const accessToken = account?.accessToken || config.instagramAccessToken
  if (outbound.target === "public_comment") {
    return postJson(`${base}/${event.commentId}/replies`, accessToken, {
      message: outbound.text,
    })
  }
  const recipient =
    outbound.target === "private_comment_reply"
      ? { comment_id: event.commentId }
      : { id: event.contactId }
  return postJson(`${base}/me/messages`, accessToken, {
    recipient,
    message: { text: outbound.text },
  })
}

function messengerRequest(config, event, outbound) {
  const base = `${trimSlash(config.facebookGraphBaseUrl)}/${config.metaApiVersion}`
  if (outbound.target === "public_comment") {
    return postJson(
      `${base}/${event.commentId}/comments`,
      config.messengerPageAccessToken,
      { message: outbound.text },
    )
  }
  return postJson(
    `${base}/${config.messengerPageId}/messages`,
    config.messengerPageAccessToken,
    {
      recipient:
        outbound.target === "private_comment_reply"
          ? { comment_id: event.commentId }
          : { id: event.contactId },
      message: { text: outbound.text },
    },
  )
}

function whatsappRequest(config, event, outbound) {
  const base = `${trimSlash(config.facebookGraphBaseUrl)}/${config.metaApiVersion}`
  return postJson(
    `${base}/${config.whatsappPhoneNumberId}/messages`,
    config.whatsappAccessToken,
    {
      messaging_product: "whatsapp",
      to: event.contactId,
      type: "text",
      text: { body: outbound.text },
    },
  )
}

export function createDispatcher(config) {
  return {
    modeFor(event) {
      if (config.deliveryMode === "dry-run") return "dry-run"
      return config.liveAccounts?.includes(event.accountKey) ? "live" : "protected"
    },

    async send(event, outbound) {
      if (config.deliveryMode === "dry-run") {
        return { status: "planned", providerMessageId: null, reason: "dry_run" }
      }
      if (!config.liveAccounts?.includes(event.accountKey)) {
        return {
          status: "planned",
          providerMessageId: null,
          reason: "account_not_live",
        }
      }
      if (event.channel === "webchat") {
        return { status: "delivered", providerMessageId: `local:${outbound.id}` }
      }
      let payload
      if (event.channel === "instagram") {
        payload = await instagramRequest(config, event, outbound)
      } else if (event.channel === "messenger") {
        payload = await messengerRequest(config, event, outbound)
      } else if (event.channel === "whatsapp") {
        payload = await whatsappRequest(config, event, outbound)
      } else {
        throw new Error(`Unsupported outbound channel: ${event.channel}`)
      }
      return {
        status: "delivered",
        providerMessageId: payload.message_id ?? payload.id ?? null,
      }
    },
  }
}
