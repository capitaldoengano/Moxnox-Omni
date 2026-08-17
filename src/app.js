import { randomUUID } from "node:crypto"
import { createServer } from "node:http"
import { normalizeMetaPayload } from "./domain/normalize-meta.js"
import { readRawBody, sendJson, sendText } from "./lib/http.js"
import { safeEqual, verifyMetaSignature } from "./lib/security.js"

const parseJson = (buffer) => {
  try {
    return JSON.parse(buffer.toString("utf8"))
  } catch {
    const error = new Error("Invalid JSON")
    error.statusCode = 400
    throw error
  }
}

const authorized = (request, expected, header = "x-admin-api-key") =>
  Boolean(expected) && safeEqual(request.headers[header], expected)

export function createApp({ config, store, queue, pipeline }) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost")

      if (request.method === "GET" && url.pathname === "/healthz") {
        return sendJson(response, 200, { ok: true, service: "moxnox-omni" })
      }

      if (request.method === "GET" && url.pathname === "/webhooks/meta") {
        const valid =
          url.searchParams.get("hub.mode") === "subscribe" &&
          safeEqual(url.searchParams.get("hub.verify_token"), config.metaVerifyToken)
        if (!valid) return sendJson(response, 403, { error: "verification_failed" })
        return sendText(response, 200, url.searchParams.get("hub.challenge") ?? "")
      }

      if (request.method === "POST" && url.pathname === "/webhooks/meta") {
        const rawBody = await readRawBody(request)
        if (
          !verifyMetaSignature(
            rawBody,
            request.headers["x-hub-signature-256"],
            config.metaAppSecret,
          )
        ) {
          return sendJson(response, 401, { error: "invalid_signature" })
        }
        const events = normalizeMetaPayload(parseJson(rawBody))
        let accepted = 0
        for (const event of events) {
          if (await store.recordInbound(event)) {
            accepted += 1
            queue.enqueue(event)
          }
        }
        return sendJson(response, 202, { accepted, ignored: events.length - accepted })
      }

      if (request.method === "POST" && url.pathname === "/v1/webchat/messages") {
        if (!authorized(request, config.webchatSiteToken, "x-site-token")) {
          return sendJson(response, 401, { error: "unauthorized" })
        }
        const body = parseJson(await readRawBody(request))
        if (!body?.conversationId || !body?.text) {
          return sendJson(response, 400, { error: "conversationId_and_text_required" })
        }
        const event = {
          id: randomUUID(),
          externalId: `webchat:${body.clientMessageId ?? randomUUID()}`,
          provider: "moxnox",
          channel: "webchat",
          kind: "message",
          accountId: "webchat",
          contactId: String(body.contactId ?? body.conversationId),
          contactName: String(body.contactName ?? ""),
          conversationId: String(body.conversationId),
          postId: "",
          commentId: "",
          parentCommentId: "",
          text: String(body.text),
          receivedAt: new Date().toISOString(),
        }
        const created = await store.recordInbound(event)
        if (created) queue.enqueue(event)
        return sendJson(response, 202, { eventId: event.id, accepted: created })
      }

      if (url.pathname.startsWith("/v1/") && !authorized(request, config.adminApiKey)) {
        return sendJson(response, 401, { error: "unauthorized" })
      }

      if (request.method === "GET" && url.pathname === "/v1/reviews") {
        return sendJson(response, 200, { data: store.listReviews() })
      }

      const approveMatch = url.pathname.match(/^\/v1\/reviews\/([^/]+)\/approve$/)
      if (request.method === "POST" && approveMatch) {
        const body = parseJson(await readRawBody(request))
        if (!body?.text) return sendJson(response, 400, { error: "text_required" })
        const result = await pipeline.approve(
          decodeURIComponent(approveMatch[1]),
          String(body.text),
          String(body.target ?? "direct_message"),
        )
        return sendJson(response, 200, result)
      }

      const rejectMatch = url.pathname.match(/^\/v1\/reviews\/([^/]+)\/reject$/)
      if (request.method === "POST" && rejectMatch) {
        const body = parseJson(await readRawBody(request))
        await pipeline.reject(
          decodeURIComponent(rejectMatch[1]),
          String(body?.reason ?? "rejected_by_operator"),
        )
        return sendJson(response, 200, { ok: true })
      }

      const conversationMatch = url.pathname.match(/^\/v1\/conversations\/([^/]+)$/)
      if (request.method === "GET" && conversationMatch) {
        return sendJson(response, 200, {
          data: store.listConversation(decodeURIComponent(conversationMatch[1])),
        })
      }

      return sendJson(response, 404, { error: "not_found" })
    } catch (error) {
      console.error(error)
      return sendJson(response, error.statusCode ?? 500, {
        error: error.statusCode ? error.message : "internal_error",
      })
    }
  })
}

