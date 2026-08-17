import { mkdir, readFile, appendFile } from "node:fs/promises"
import path from "node:path"

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

  getInbound(eventId) {
    return this.#records.find(
      (record) => record.type === "inbound" && record.event.id === eventId,
    )?.event
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
        (record.type === "outbound" && eventIds.has(record.eventId)),
    )
  }
}

