import { readFile } from "node:fs/promises"
import path from "node:path"

const MIN_SECRET_LENGTH = 24

const clean = (value) => (typeof value === "string" ? value.trim() : "")

const parsePort = (value) => {
  const parsed = Number.parseInt(value ?? "3333", 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535")
  }
  return parsed
}

export function loadConfig(env = process.env) {
  const deliveryMode = clean(env.DELIVERY_MODE) || "dry-run"
  if (!["dry-run", "live"].includes(deliveryMode)) {
    throw new Error("DELIVERY_MODE must be dry-run or live")
  }

  const config = {
    nodeEnv: clean(env.NODE_ENV) || "development",
    host: clean(env.HOST) || "0.0.0.0",
    port: parsePort(env.PORT),
    deliveryMode,
    dataDir: path.resolve(clean(env.DATA_DIR) || "./data"),
    automationsFile: path.resolve(
      clean(env.AUTOMATIONS_FILE) || "./config/automations.example.json",
    ),
    adminApiKey: clean(env.ADMIN_API_KEY),
    webchatSiteToken: clean(env.WEBCHAT_SITE_TOKEN),
    metaVerifyToken: clean(env.META_VERIFY_TOKEN),
    metaAppSecret: clean(env.META_APP_SECRET),
    metaApiVersion: clean(env.META_API_VERSION) || "v23.0",
    facebookGraphBaseUrl:
      clean(env.FACEBOOK_GRAPH_BASE_URL) || "https://graph.facebook.com",
    instagramGraphBaseUrl:
      clean(env.INSTAGRAM_GRAPH_BASE_URL) || "https://graph.instagram.com",
    instagramAccessToken: clean(env.INSTAGRAM_ACCESS_TOKEN),
    messengerPageId: clean(env.MESSENGER_PAGE_ID),
    messengerPageAccessToken: clean(env.MESSENGER_PAGE_ACCESS_TOKEN),
    whatsappPhoneNumberId: clean(env.WHATSAPP_PHONE_NUMBER_ID),
    whatsappAccessToken: clean(env.WHATSAPP_ACCESS_TOKEN),
  }

  if (config.nodeEnv === "production") {
    for (const [name, value] of [
      ["ADMIN_API_KEY", config.adminApiKey],
      ["WEBCHAT_SITE_TOKEN", config.webchatSiteToken],
      ["META_VERIFY_TOKEN", config.metaVerifyToken],
      ["META_APP_SECRET", config.metaAppSecret],
    ]) {
      if (value.length < MIN_SECRET_LENGTH) {
        throw new Error(`${name} must have at least ${MIN_SECRET_LENGTH} characters`)
      }
    }
  }

  return config
}

export async function loadAutomations(filePath) {
  const raw = await readFile(filePath, "utf8")
  const parsed = JSON.parse(raw)
  if (!parsed || !Array.isArray(parsed.automations)) {
    throw new Error("Automations file must contain an automations array")
  }
  return parsed.automations
}

