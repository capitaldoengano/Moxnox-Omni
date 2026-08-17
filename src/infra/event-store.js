import { mkdir, readFile, appendFile } from "node:fs/promises"
import path from "node:path"
import { validateClassification } from "../domain/classification.js"

const contactKey = (event) =>
  event?.contactId
    ? `${event.channel}:${event.accountId}:${event.contactId}`
    : null

export class EventStore {
  #filePath
  #records = []
  #writeTail = Promise.resolve()

  constructor(dataDir) {
    this.#filePath = path.join(dataDir, "events.jsonl")
  }

  async initialize() {
    await mkdir(path.dirname(this.#filePath), { recursive: true })
    try {
      const raw = await readFile(this.#filePath, "utf8")
      this.#records = raw
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    } catch (error) {
      if (error.code !== "ENOENT") throw error
    }
  }

  async #append(record) {
    this.#records.push(record)
    this.#writeTail = this.#writeTail.then(() =>
      appendFile(this.#filePath, `${JSON.stringify(record)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      }),
    )
    await this.#writeTail
  }

  hasExternalId(externalId) {
    return this.#records.some(
      (record) =>
        record.type === "inbound" && record.event.externalId === externalId,
    )
  }

  async recordInbound(event) {
    if (this.hasExternalId(event.externalId)) return false
    await this.#append({ type: "inbound", at: new Date().toISOString(), event })
    return true
  }

  async recordDecision(eventId, decision) {
    await this.#append({
      type: "decision",
      at: new Date().toISOString(),
      eventId,
      decision,
    })
  }

  async recordOutbound(eventId, outbound) {
    await this.#append({
      type: "outbound",
      at: new Date().toISOString(),
      eventId,
      outbound,
    })
  }

  async resolveReview(eventId, resolution) {
    await this.#append({
      type: "review_resolution",
      at: new Date().toISOString(),
      eventId,
      resolution,
    })
  }

  async classify(eventId, input) {
    if (!this.getInbound(eventId)) {
      const error = new Error("event_not_found")
      error.statusCode = 404
      throw error
    }
    const classification = validateClassification(input)
    const at = new Date().toISOString()
    await this.#append({ type: "classification", at, eventId, classification })
    return { ...classification, classifiedAt: at }
  }

  getInbound(eventId) {
    return this.#records.find(
      (record) => record.type === "inbound" && record.event.id === eventId,
    )?.event
  }

  hasRecentAutomation(event, ruleId, windowMs, now = Date.now()) {
    if (!Number.isFinite(windowMs) || windowMs <= 0 || !ruleId) return false
    const key = contactKey(event)
    if (!key) return false
    const eventIds = new Set(
      this.#records
        .filter(
          (record) =>
            record.type === "inbound" &&
            record.event.id !== event.id &&
            contactKey(record.event) === key,
        )
        .map((record) => record.event.id),
    )
    const cutoff = now - windowMs
    const recentAutomatedEventIds = new Set(
      this.#records
        .filter(
          (record) =>
            record.type === "decision" &&
            eventIds.has(record.eventId) &&
            record.decision.outcome === "automated" &&
            record.decision.ruleId === ruleId &&
            Date.parse(record.at) >= cutoff,
        )
        .map((record) => record.eventId),
    )
    return this.#records.some(
      (record) =>
        record.type === "outbound" &&
        recentAutomatedEventIds.has(record.eventId) &&
        record.outbound.status !== "failed",
    )
  }

  listReviews() {
    const resolved = new Set(
      this.#records
        .filter((record) => record.type === "review_resolution")
        .map((record) => record.eventId),
    )
    return this.#records
      .filter(
        (record) =>
          record.type === "decision" &&
          record.decision.outcome === "human_review" &&
          !resolved.has(record.eventId),
      )
      .map((record) => ({
        event: this.getInbound(record.eventId),
        decision: record.decision,
        queuedAt: record.at,
      }))
  }

  listInbox(limit = 100) {
    const records = this.#records.filter((record) => record.type === "inbound")
    const inbound = (limit === null ? records : records.slice(-limit)).reverse()

    return inbound.map((record) => {
      const eventId = record.event.id
      const decisions = this.#records.filter(
        (candidate) => candidate.type === "decision" && candidate.eventId === eventId,
      )
      const outbound = this.#records.filter(
        (candidate) => candidate.type === "outbound" && candidate.eventId === eventId,
      )
      const resolutions = this.#records.filter(
        (candidate) =>
          candidate.type === "review_resolution" && candidate.eventId === eventId,
      )
      const classifications = this.#records.filter(
        (candidate) =>
          candidate.type === "classification" && candidate.eventId === eventId,
      )
      return {
        event: record.event,
        receivedAt: record.at,
        decision: decisions.at(-1)?.decision ?? null,
        outbound: outbound.map((candidate) => ({
          ...candidate.outbound,
          recordedAt: candidate.at,
        })),
        resolution: resolutions.at(-1)?.resolution ?? null,
        classification: classifications.at(-1)
          ? {
              ...classifications.at(-1).classification,
              classifiedAt: classifications.at(-1).at,
            }
          : null,
      }
    })
  }

  getSummary() {
    const inbound = this.#records.filter((record) => record.type === "inbound")
    const decisions = this.#records.filter((record) => record.type === "decision")
    const outbound = this.#records.filter((record) => record.type === "outbound")
    return {
      inbound: inbound.length,
      messages: inbound.filter((record) => record.event.kind === "message").length,
      comments: inbound.filter((record) => record.event.kind === "comment").length,
      contacts: new Set(
        inbound.map(
          (record) =>
            `${record.event.channel}:${record.event.accountId}:${record.event.contactId}`,
        ),
      ).size,
      automated: decisions.filter(
        (record) => record.decision.outcome === "automated",
      ).length,
      pendingReviews: this.listReviews().length,
      failedDeliveries: outbound.filter(
        (record) => record.outbound.status === "failed",
      ).length,
      lastInboundAt: inbound.at(-1)?.at ?? null,
    }
  }

  getAnalytics(now = Date.now()) {
    const inbound = this.#records.filter((record) => record.type === "inbound")
    const decisions = this.#records.filter((record) => record.type === "decision")
    const resolutions = this.#records.filter(
      (record) => record.type === "review_resolution",
    )
    const firstOutbound = new Map()
    for (const record of this.#records) {
      if (
        record.type === "outbound" &&
        record.outbound.status !== "failed" &&
        !firstOutbound.has(record.eventId)
      ) {
        firstOutbound.set(record.eventId, record)
      }
    }
    const inboundById = new Map(inbound.map((record) => [record.event.id, record]))
    const responseTimes = [...firstOutbound.entries()]
      .map(([eventId, outbound]) => {
        const receivedAt = Date.parse(inboundById.get(eventId)?.at ?? "")
        const respondedAt = Date.parse(outbound.at)
        return respondedAt >= receivedAt ? (respondedAt - receivedAt) / 1_000 : null
      })
      .filter((value) => value !== null)
      .sort((left, right) => left - right)
    const medianIndex = Math.floor(responseTimes.length / 2)
    const medianFirstResponseSeconds = responseTimes.length
      ? Math.round(
          responseTimes.length % 2
            ? responseTimes[medianIndex]
            : (responseTimes[medianIndex - 1] + responseTimes[medianIndex]) / 2,
        )
      : null
    const humanReviews = decisions.filter(
      (record) => record.decision.outcome === "human_review",
    )
    const resolvedIds = new Set(resolutions.map((record) => record.eventId))
    const automated = decisions.filter(
      (record) => record.decision.outcome === "automated",
    ).length
    return {
      processed: decisions.length,
      responded: firstOutbound.size,
      automationRate: decisions.length
        ? Math.round((automated / decisions.length) * 100)
        : 0,
      reviewResolutionRate: humanReviews.length
        ? Math.round(
            (humanReviews.filter((record) => resolvedIds.has(record.eventId)).length /
              humanReviews.length) *
              100,
          )
        : 0,
      medianFirstResponseSeconds,
      pendingOver24Hours: this.listReviews().filter(
        (review) => now - Date.parse(review.queuedAt) >= 24 * 60 * 60 * 1_000,
      ).length,
      humanRequested: decisions.filter(
        (record) => record.decision.reason === "human_requested",
      ).length,
      repetitionPrevented: decisions.filter(
        (record) => record.decision.reason === "recent_automation",
      ).length,
    }
  }

  listContactHistory(eventId) {
    const event = this.getInbound(eventId)
    if (!event) return null
    const key = contactKey(event)
    const eventIds = new Set(
      this.#records
        .filter(
          (record) =>
            record.type === "inbound" &&
            (key ? contactKey(record.event) === key : record.event.id === eventId),
        )
        .map((record) => record.event.id),
    )
    return this.#records.filter(
      (record) =>
        (record.type === "inbound" && eventIds.has(record.event.id)) ||
        (["outbound", "classification", "review_resolution"].includes(record.type) &&
          eventIds.has(record.eventId)),
    )
  }

  listConversation(conversationId) {
    const eventIds = new Set(
      this.#records
        .filter(
          (record) =>
            record.type === "inbound" &&
            record.event.conversationId === conversationId,
        )
        .map((record) => record.event.id),
    )
    return this.#records.filter(
      (record) =>
        (record.type === "inbound" && eventIds.has(record.event.id)) ||
        (["outbound", "classification"].includes(record.type) &&
          eventIds.has(record.eventId)),
    )
  }
}
