const isConfigured = (value) =>
  Boolean(value) && !/^(?:replace-|change-me|changeme)/i.test(value)

const item = (key, label, value, source, options = {}) => ({
  key,
  label,
  configured: isConfigured(value),
  source,
  secret: options.secret ?? false,
  required: options.required ?? true,
  docsUrl: options.docsUrl ?? null,
})

const META_APPS_URL = "https://developers.facebook.com/apps/"
const META_APP_DOCS_URL =
  "https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/basic-settings"
const META_WEBHOOK_DOCS_URL =
  "https://developers.facebook.com/documentation/instagram-platform/webhooks"
const INSTAGRAM_DOCS_URL =
  "https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login"
const INSTAGRAM_MESSAGING_DOCS_URL =
  "https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login"
const WHATSAPP_DOCS_URL =
  "https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started"

export function buildSetupStatus(config) {
  const cockpitUrl = config.publicBaseUrl
    ? `${config.publicBaseUrl}/cockpit`
    : "/cockpit"
  const webhookUrl = config.publicBaseUrl
    ? `${config.publicBaseUrl}/webhooks/meta`
    : null
  const publicUrlIsLocal =
    !config.publicBaseUrl ||
    /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(config.publicBaseUrl)
  const publicUrlUsesHttps = config.publicBaseUrl?.startsWith("https://") ?? false

  const groups = [
    {
      id: "local",
      title: "Acesso e segurança local",
      description: "O instalador gera essas chaves. Elas não vêm da Meta.",
      items: [
        item("ADMIN_API_KEY", "Chave do cockpit", config.adminApiKey, "Gerada por npm run setup", {
          secret: true,
        }),
        item(
          "WEBCHAT_SITE_TOKEN",
          "Token do webchat",
          config.webchatSiteToken,
          "Gerado por npm run setup",
          { secret: true },
        ),
        item(
          "PUBLIC_BASE_URL",
          "Endereço público HTTPS",
          config.publicBaseUrl,
          "Domínio onde o Moxnox será publicado",
        ),
        item(
          "AUTOMATION_COOLDOWN_MINUTES",
          "Intervalo contra resposta repetida",
          String(config.automationCooldownMinutes ?? ""),
          "Definido no .env; 1440 equivale a 24 horas",
        ),
      ],
    },
    {
      id: "meta-app",
      title: "Aplicativo da Meta",
      description: "Crie um app de negócios e copie os dados das configurações básicas.",
      items: [
        item("META_APP_ID", "App ID", config.metaAppId, "Meta for Developers · Configurações básicas", {
          docsUrl: META_APPS_URL,
        }),
        item(
          "META_APP_SECRET",
          "App Secret",
          config.metaAppSecret,
          "Meta for Developers · Configurações básicas",
          { secret: true, docsUrl: META_APP_DOCS_URL },
        ),
        item(
          "META_VERIFY_TOKEN",
          "Token de verificação do webhook",
          config.metaVerifyToken,
          "Gerado por npm run setup; cole o mesmo valor na Meta",
          { secret: true, docsUrl: META_WEBHOOK_DOCS_URL },
        ),
      ],
    },
    {
      id: "instagram-capital",
      title: "Instagram · Capital do Engano",
      description: "Conecte a conta profissional pelo produto Instagram do app.",
      items: [
        item(
          "CAPITAL_INSTAGRAM_ACCOUNT_ID",
          "ID da conta profissional",
          config.instagramAccounts?.find((account) => account.key === "capital-do-engano")
            ?.accountId,
          "Instagram · API Setup",
          { docsUrl: INSTAGRAM_DOCS_URL },
        ),
        item(
          "CAPITAL_INSTAGRAM_ACCESS_TOKEN",
          "Access token da Capital",
          config.instagramAccounts?.find((account) => account.key === "capital-do-engano")
            ?.accessToken,
          "Instagram · API Setup",
          { secret: true, docsUrl: INSTAGRAM_MESSAGING_DOCS_URL },
        ),
      ],
    },
    {
      id: "instagram-gu",
      title: "Instagram · @ogustavosouzapauli",
      description: "A conta do Gu usa ID e token próprios; nada de token comunitário.",
      items: [
        item(
          "GU_INSTAGRAM_ACCOUNT_ID",
          "ID da conta profissional",
          config.instagramAccounts?.find((account) => account.key === "gu")?.accountId,
          "Instagram · API Setup",
          { docsUrl: INSTAGRAM_DOCS_URL },
        ),
        item(
          "GU_INSTAGRAM_ACCESS_TOKEN",
          "Access token do Gu",
          config.instagramAccounts?.find((account) => account.key === "gu")?.accessToken,
          "Instagram · API Setup",
          { secret: true, docsUrl: INSTAGRAM_MESSAGING_DOCS_URL },
        ),
      ],
    },
    {
      id: "whatsapp",
      title: "WhatsApp Cloud API",
      description: "Os três valores aparecem na configuração da API do WhatsApp.",
      items: [
        item(
          "WHATSAPP_BUSINESS_ACCOUNT_ID",
          "WhatsApp Business Account ID",
          config.whatsappBusinessAccountId,
          "WhatsApp · API Setup",
          { docsUrl: WHATSAPP_DOCS_URL },
        ),
        item(
          "WHATSAPP_PHONE_NUMBER_ID",
          "Phone Number ID",
          config.whatsappPhoneNumberId,
          "WhatsApp · API Setup",
          { docsUrl: WHATSAPP_DOCS_URL },
        ),
        item(
          "WHATSAPP_ACCESS_TOKEN",
          "Access token do WhatsApp",
          config.whatsappAccessToken,
          "WhatsApp · API Setup",
          { secret: true, docsUrl: WHATSAPP_DOCS_URL },
        ),
      ],
    },
  ]

  const requiredItems = groups.flatMap((group) => group.items).filter((entry) => entry.required)
  const configuredItems = requiredItems.filter((entry) => entry.configured)
  return {
    access: {
      method: "browser",
      cockpitUrl,
      webhookUrl,
      terminalRequiredFor: "install_and_restart",
    },
    deliveryMode: config.deliveryMode,
    network: {
      publicUrlIsLocal,
      publicUrlUsesHttps,
      webhookCanBeRegistered: Boolean(webhookUrl) && publicUrlUsesHttps && !publicUrlIsLocal,
    },
    progress: {
      configured: configuredItems.length,
      total: requiredItems.length,
      percentage: Math.round((configuredItems.length / requiredItems.length) * 100),
    },
    groups,
  }
}
