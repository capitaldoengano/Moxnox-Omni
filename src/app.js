import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
import { analyzeMessage } from "./domain/analyze-message.js"
import {
  CLASSIFICATION_CATEGORIES,
  effectiveClassification,
} from "./domain/classification.js"
import { normalizeMetaPayload } from "./domain/normalize-meta.js"
import { decideEvent } from "./domain/rules.js"
import { buildSetupStatus } from "./domain/setup-status.js"
import { readRawBody, sendAsset, sendJson, sendText } from "./lib/http.js"
import { safeEqual, verifyMetaSignature } from "./lib/security.js"

const cockpitDirectory = fileURLToPath(new URL("./cockpit/", import.meta.url))
const cockpitAssets = new Map([
  ["/cockpit", ["index.html", "text/html; charset=utf-8"]],
  ["/cockpit/", ["index.html", "text/html; charset=utf-8"]],
  ["/cockpit/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/cockpit/styles.css", ["styles.css", "text/css; charset=utf-8"]],
])

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

const maskedId = (value) => (value ? `••••${value.slice(-4)}` : null)
const isConfigured = (value) =>
  Boolean(value) && !/^(?:replace-|change-me|changeme)/i.test(value)

const accountKey = (config, event) => {
  if (event.channel === "instagram") {
    return (
      config.instagramAccounts?.find((account) => account.accountId === event.accountId)
        ?.key ?? "unknown"
    )
  }
  if (event.channel === "whatsapp") {
    return event.accountId === config.whatsappPhoneNumberId ? "whatsapp" : "unknown"
  }
  if (event.channel === "messenger") return "messenger"
  if (event.channel === "webchat") return "webchat"
  return "unknown"
}

const accountLabel = (config, event) => {
  if (event.channel === "instagram") {
    return (
      config.instagramAccounts?.find((account) => account.accountId === event.accountId)
        ?.label ?? "Instagram"
    )
  }
  if (event.channel === "whatsapp") return config.whatsappLabel ?? "WhatsApp"
  if (event.channel === "messenger") return "Messenger"
  return "Webchat"
}

const enrichItem = (config, item) => {
  const analysis = analyzeMessage(item.event, item.decision)
  return {
    ...item,
    analysis,
    classification: effectiveClassification(item, analysis),
    event: { ...item.event, accountLabel: accountLabel(config, item.event) },
  }
}

const integrations = (config) => ({
  deliveryMode: config.deliveryMode,
  webhook: {
    configured: isConfigured(config.metaVerifyToken) && isConfigured(config.metaAppSecret),
    url: config.publicBaseUrl ? `${config.publicBaseUrl}/webhooks/meta` : null,
    appId: maskedId(config.metaAppId),
  },
  accounts: [
    ...(config.instagramAccounts ?? []).map((account) => ({
      key: account.key,
      label: account.label,
      channel: "instagram",
      configured: isConfigured(account.accountId) && isConfigured(account.accessToken),
      accountId: maskedId(account.accountId),
    })),
    {
      key: "whatsapp",
      label: config.whatsappLabel ?? "WhatsApp",
      channel: "whatsapp",
      configured:
        isConfigured(config.whatsappPhoneNumberId) &&
        isConfigured(config.whatsappAccessToken),
      accountId: maskedId(config.whatsappPhoneNumberId),
    },
  ],
})

const allowedTargets = (event) => {
  if (event.kind === "message") return ["direct_message"]
  if (["instagram", "messenger"].includes(event.channel)) {
    return ["public_comment", "private_comment_reply"]
  }
  return []
}

export function createApp({ config, store, queue, pipeline, automationStore = null }) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost")

      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(302, {
          location: "/cockpit",
          "cache-control": "no-store",
        })
        return response.end()
      }

      const cockpitAsset = request.method === "GET" && cockpitAssets.get(url.pathname)
      if (cockpitAsset) {
        const [fileName, contentType] = cockpitAsset
        const body = await readFile(`${cockpitDirectory}${fileName}`)
        return sendAsset(response, 200, body, contentType)
      }

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
        const events = normalizeMetaPayload(parseJson(rawBody)).map((event) => ({
          ...event,
          accountKey: accountKey(config, event),
        }))
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
          accountKey: "webchat",
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
        return sendJson(response, 200, {
          data: store.listReviews().map((item) => enrichItem(config, item)),
        })
      }

      if (request.method === "GET" && url.pathname === "/v1/inbox") {
        const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "100", 10)
        const limit = Number.isInteger(requestedLimit)
          ? Math.min(Math.max(requestedLimit, 1), 250)
          : 100
        return sendJson(response, 200, {
          data: store.listInbox(limit).map((item) => enrichItem(config, item)),
        })
      }

      if (request.method === "GET" && url.pathname === "/v1/summary") {
        const data = store.getSummary()
        const classified = store.listInbox(null).map((item) => enrichItem(config, item))
        const open = classified.filter(
          (item) => !["resolved", "discarded"].includes(item.classification.category),
        )
        data.backlog = open.length
        data.unclassified = open.filter(
          (item) => item.classification.category === "unclassified",
        ).length
        data.potentialLeads = open.filter(
          (item) => item.classification.category === "potential_lead",
        ).length
        data.followUps = open.filter(
          (item) => item.classification.category === "follow_up",
        ).length
        data.salesOpportunities = data.potentialLeads
        return sendJson(response, 200, { data })
      }

      if (request.method === "GET" && url.pathname === "/v1/analytics") {
        return sendJson(response, 200, { data: store.getAnalytics() })
      }

      if (request.method === "GET" && url.pathname === "/v1/backlog") {
        const category = url.searchParams.get("category")
        if (category && !CLASSIFICATION_CATEGORIES.includes(category)) {
          return sendJson(response, 400, { error: "invalid_classification_category" })
        }
        let data = store.listInbox(null).map((item) => enrichItem(config, item))
        if (category) {
          data = data.filter((item) => item.classification.category === category)
        } else if (url.searchParams.get("scope") !== "all") {
          data = data.filter(
            (item) => !["resolved", "discarded"].includes(item.classification.category),
          )
        }
        return sendJson(response, 200, { data })
      }

      if (request.method === "GET" && url.pathname === "/v1/automations") {
        if (!automationStore) return sendJson(response, 503, { error: "not_available" })
        return sendJson(response, 200, { data: automationStore.list() })
      }

      if (request.method === "POST" && url.pathname === "/v1/automations/test") {
        if (!automationStore) return sendJson(response, 503, { error: "not_available" })
        const body = parseJson(await readRawBody(request))
        const account = String(body?.accountKey ?? "")
        const channel = String(body?.channel ?? "")
        const kind = String(body?.kind ?? "")
        const text = String(body?.text ?? "").trim()
        const testChannels = {
          "capital-do-engano": "instagram",
          gu: "instagram",
          whatsapp: "whatsapp",
          messenger: "messenger",
          webchat: "webchat",
        }
        if (!testChannels[account] || testChannels[account] !== channel) {
          return sendJson(response, 400, { error: "invalid_test_context" })
        }
        if (!text || !["comment", "message"].includes(kind)) {
          return sendJson(response, 400, { error: "invalid_test_message" })
        }
        const event = { accountKey: account, channel, kind, text }
        const decision = decideEvent(event, automationStore.list())
        return sendJson(response, 200, {
          data: { decision, analysis: analyzeMessage(event, decision) },
        })
      }

      const automationMatch = url.pathname.match(/^\/v1\/automations\/([^/]+)$/)
      if (request.method === "PUT" && automationMatch) {
        if (!automationStore) return sendJson(response, 503, { error: "not_available" })
        const id = decodeURIComponent(automationMatch[1])
        const body = parseJson(await readRawBody(request))
        if (body?.id && body.id !== id) {
          return sendJson(response, 400, { error: "automation_id_mismatch" })
        }
        const data = await automationStore.upsert({ ...body, id })
        return sendJson(response, 200, { data })
      }

      if (request.method === "GET" && url.pathname === "/v1/integrations") {
        return sendJson(response, 200, { data: integrations(config) })
      }

      if (request.method === "GET" && url.pathname === "/v1/setup") {
        return sendJson(response, 200, { data: buildSetupStatus(config) })
      }

      const approveMatch = url.pathname.match(/^\/v1\/reviews\/([^/]+)\/approve$/)
      if (request.method === "POST" && approveMatch) {
        const body = parseJson(await readRawBody(request))
        if (!body?.text) return sendJson(response, 400, { error: "text_required" })
        const eventId = decodeURIComponent(approveMatch[1])
        const event = store.getInbound(eventId)
        if (!event) return sendJson(response, 404, { error: "event_not_found" })
        const target = String(body.target ?? "direct_message")
        if (!allowedTargets(event).includes(target)) {
          return sendJson(response, 400, { error: "invalid_target" })
        }
        const result = await pipeline.approve(
          eventId,
          String(body.text),
          target,
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

      const classificationMatch = url.pathname.match(
        /^\/v1\/inbox\/([^/]+)\/classification$/,
      )
      if (request.method === "POST" && classificationMatch) {
        const eventId = decodeURIComponent(classificationMatch[1])
        const body = parseJson(await readRawBody(request))
        await store.classify(eventId, body)
        const item = store
          .listInbox(null)
          .find((candidate) => candidate.event.id === eventId)
        return sendJson(response, 200, { data: enrichItem(config, item) })
      }

      const historyMatch = url.pathname.match(/^\/v1\/inbox\/([^/]+)\/history$/)
      if (request.method === "GET" && historyMatch) {
        const data = store.listContactHistory(decodeURIComponent(historyMatch[1]))
        if (!data) return sendJson(response, 404, { error: "event_not_found" })
        return sendJson(response, 200, { data })
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
