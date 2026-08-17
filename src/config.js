import { readFile } from "node:fs/promises"
import path from "node:path"

const MIN_SECRET_LENGTH = 24

const clean = (value) => (typeof value === "string" ? value.trim() : "")
const isTemplateValue = (value) => /^(?:replace-|change-me|changeme)/i.test(value)

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
    publicBaseUrl: clean(env.PUBLIC_BASE_URL).replace(/\/$/, ""),
    adminApiKey: clean(env.ADMIN_API_KEY),
    webchatSiteToken: clean(env.WEBCHAT_SITE_TOKEN),
    metaAppId: clean(env.META_APP_ID),
    metaVerifyToken: clean(env.META_VERIFY_TOKEN),
    metaAppSecret: clean(env.META_APP_SECRET),
    metaApiVersion: clean(env.META_API_VERSION) || "v23.0",
    facebookGraphBaseUrl:
      clean(env.FACEBOOK_GRAPH_BASE_URL) || "https://graph.facebook.com",
    instagramGraphBaseUrl:
      clean(env.INSTAGRAM_GRAPH_BASE_URL) || "https://graph.instagram.com",
    instagramAccessToken: clean(env.INSTAGRAM_ACCESS_TOKEN),
    instagramAccounts: [
      {
        key: "capital-do-engano",
        label: clean(env.CAPITAL_INSTAGRAM_LABEL) || "Capital do Engano",
        accountId: clean(env.CAPITAL_INSTAGRAM_ACCOUNT_ID),
        accessToken: clean(env.CAPITAL_INSTAGRAM_ACCESS_TOKEN),
      },
      {
        key: "gu",
        label: clean(env.GU_INSTAGRAM_LABEL) || "@ogustavosouzapauli",
        accountId: clean(env.GU_INSTAGRAM_ACCOUNT_ID),
        accessToken: clean(env.GU_INSTAGRAM_ACCESS_TOKEN),
      },
    ],
    messengerPageId: clean(env.MESSENGER_PAGE_ID),
    messengerPageAccessToken: clean(env.MESSENGER_PAGE_ACCESS_TOKEN),
    whatsappBusinessAccountId: clean(env.WHATSAPP_BUSINESS_ACCOUNT_ID),
    whatsappPhoneNumberId: clean(env.WHATSAPP_PHONE_NUMBER_ID),
    whatsappAccessToken: clean(env.WHATSAPP_ACCESS_TOKEN),
    whatsappLabel: clean(env.WHATSAPP_LABEL) || "Capital do Engano · WhatsApp",
  }

  if (config.nodeEnv === "production") {
    for (const [name, value] of [
      ["ADMIN_API_KEY", config.adminApiKey],
      ["WEBCHAT_SITE_TOKEN", config.webchatSiteToken],
      ["META_VERIFY_TOKEN", config.metaVerifyToken],
      ["META_APP_SECRET", config.metaAppSecret],
    ]) {
      if (value.length < MIN_SECRET_LENGTH || isTemplateValue(value)) {
        throw new Error(
          `${name} must be a non-template secret with at least ${MIN_SECRET_LENGTH} characters`,
        )
      }
    }
  }

  if (config.deliveryMode === "live") {
    for (const account of config.instagramAccounts) {
      if (Boolean(account.accountId) !== Boolean(account.accessToken)) {
        throw new Error(
          `${account.key} requires both an Instagram account ID and access token`,
        )
      }
    }
    for (const [name, id, token] of [
      ["Messenger", config.messengerPageId, config.messengerPageAccessToken],
      ["WhatsApp", config.whatsappPhoneNumberId, config.whatsappAccessToken],
    ]) {
      if (Boolean(id) !== Boolean(token)) {
        throw new Error(`${name} requires both an account ID and access token`)
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
