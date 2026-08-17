import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

const ALLOWED_ACCOUNTS = new Set([
  "capital-do-engano",
  "gu",
  "whatsapp",
  "messenger",
  "webchat",
])
const ALLOWED_CHANNELS = new Set(["instagram", "whatsapp", "messenger", "webchat"])
const ALLOWED_KINDS = new Set(["comment", "message"])
const ALLOWED_MODES = new Set(["containsAny", "containsAll"])
const ACTION_FIELDS = ["publicReply", "privateReply", "messageReply"]
const CHANNEL_BY_ACCOUNT = {
  "capital-do-engano": "instagram",
  gu: "instagram",
  whatsapp: "whatsapp",
  messenger: "messenger",
  webchat: "webchat",
}

const badRequest = (message) => {
  const error = new Error(message)
  error.statusCode = 400
  return error
}

const requiredList = (value, allowed, field) => {
  if (!Array.isArray(value) || value.length === 0) {
    throw badRequest(`${field}_required`)
  }
  const list = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))]
  if (list.length !== value.length || list.some((item) => !allowed.has(item))) {
    throw badRequest(`invalid_${field}`)
  }
  return list
}

const optionalText = (value, field, maxLength = 2_000) => {
  const text = String(value ?? "").trim()
  if (text.length > maxLength) throw badRequest(`${field}_too_long`)
  return text
}

export function validateAutomation(input) {
  const id = String(input?.id ?? "").trim()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 80) {
    throw badRequest("invalid_automation_id")
  }
  if (typeof input?.enabled !== "boolean") throw badRequest("enabled_must_be_boolean")

  const mode = String(input?.match?.mode ?? "")
  if (!ALLOWED_MODES.has(mode)) throw badRequest("invalid_match_mode")
  if (!Array.isArray(input?.match?.terms) || input.match.terms.length === 0) {
    throw badRequest("match_terms_required")
  }
  if (input.match.terms.length > 50) throw badRequest("too_many_match_terms")
  const terms = [
    ...new Set(input.match.terms.map((term) => optionalText(term, "match_term", 120))),
  ]
  if (terms.some((term) => !term)) throw badRequest("empty_match_term")

  const accounts = requiredList(input.accounts, ALLOWED_ACCOUNTS, "accounts")
  const channels = requiredList(input.channels, ALLOWED_CHANNELS, "channels")
  const kinds = requiredList(input.kinds, ALLOWED_KINDS, "kinds")
  const expectedChannels = new Set(accounts.map((account) => CHANNEL_BY_ACCOUNT[account]))
  if (
    channels.some((channel) => !expectedChannels.has(channel)) ||
    accounts.some((account) => !channels.includes(CHANNEL_BY_ACCOUNT[account]))
  ) {
    throw badRequest("account_channel_mismatch")
  }
  if (
    kinds.includes("comment") &&
    channels.some((channel) => !["instagram", "messenger"].includes(channel))
  ) {
    throw badRequest("channel_does_not_support_comments")
  }

  const action = Object.fromEntries(
    ACTION_FIELDS.map((field) => [field, optionalText(input?.action?.[field], field)]),
  )
  if (!Object.values(action).some(Boolean)) throw badRequest("automation_action_required")
  if (kinds.includes("message") && !action.messageReply) {
    throw badRequest("message_reply_required")
  }
  if (kinds.includes("comment") && !action.publicReply && !action.privateReply) {
    throw badRequest("comment_reply_required")
  }

  return {
    id,
    name: optionalText(input.name || id, "name", 100),
    enabled: input.enabled,
    accounts,
    channels,
    kinds,
    match: { mode, terms },
    action,
  }
}

const parseAutomations = (raw) => {
  const parsed = JSON.parse(raw)
  if (!parsed || !Array.isArray(parsed.automations)) {
    throw new Error("Automations file must contain an automations array")
  }
  const automations = parsed.automations.map(validateAutomation)
  if (new Set(automations.map((rule) => rule.id)).size !== automations.length) {
    throw new Error("Automation IDs must be unique")
  }
  return automations
}

export class AutomationStore {
  #filePath
  #seedFilePath
  #rules = []
  #writeTail = Promise.resolve()

  constructor(dataDir, seedFilePath) {
    this.#filePath = path.join(dataDir, "automations.json")
    this.#seedFilePath = seedFilePath
  }

  async initialize() {
    await mkdir(path.dirname(this.#filePath), { recursive: true })
    try {
      this.#rules = parseAutomations(await readFile(this.#filePath, "utf8"))
    } catch (error) {
      if (error.code !== "ENOENT") throw error
      this.#rules = parseAutomations(await readFile(this.#seedFilePath, "utf8"))
      await this.#persist(this.#rules)
    }
  }

  list() {
    return structuredClone(this.#rules)
  }

  async upsert(input) {
    const rule = validateAutomation(input)
    let saved
    const operation = this.#writeTail.catch(() => {}).then(async () => {
      const rules = structuredClone(this.#rules)
      const index = rules.findIndex((candidate) => candidate.id === rule.id)
      if (index === -1) rules.push(rule)
      else rules[index] = rule
      await this.#persist(rules)
      this.#rules = rules
      saved = structuredClone(rule)
    })
    this.#writeTail = operation
    await operation
    return saved
  }

  async #persist(rules) {
    const snapshot = JSON.stringify({ automations: rules }, null, 2) + "\n"
    const temporaryPath = `${this.#filePath}.${randomUUID()}.tmp`
    await writeFile(temporaryPath, snapshot, { encoding: "utf8", mode: 0o600 })
    await rename(temporaryPath, this.#filePath)
  }
}
