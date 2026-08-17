const isConfigured = (value) =>
  Boolean(value) && !/^(?:replace-|change-me|changeme)/i.test(value)

const accountDefinitions = (config) => [
  ...(config.instagramAccounts ?? []).map((account) => ({
    key: account.key,
    label: account.label,
    channel: "instagram",
    configured: isConfigured(account.accountId) && isConfigured(account.accessToken),
  })),
  {
    key: "whatsapp",
    label: config.whatsappLabel ?? "WhatsApp",
    channel: "whatsapp",
    configured:
      isConfigured(config.whatsappPhoneNumberId) &&
      isConfigured(config.whatsappAccessToken),
  },
]

const check = (id, label, status, detail) => ({ id, label, status, detail })

export function buildOperationalReadiness(config, store) {
  const inbox = store.listInbox(null)
  const reviews = store.listReviews()
  const liveAccounts = new Set(config.liveAccounts ?? [])
  const accounts = accountDefinitions(config).map((account) => {
    const activity = inbox.filter((item) => item.event.accountKey === account.key)
    const failures = activity.filter(
      (item) => item.outbound.at(-1)?.status === "failed",
    ).length
    const pendingReviews = reviews.filter(
      (item) => item.event.accountKey === account.key,
    ).length
    const live = config.deliveryMode === "live" && liveAccounts.has(account.key)
    return {
      ...account,
      live,
      protected: config.deliveryMode === "live" && !live,
      inbound: activity.length,
      lastInboundAt: activity[0]?.receivedAt ?? null,
      pendingReviews,
      failedDeliveries: failures,
    }
  })

  const publicHttps =
    config.publicBaseUrl?.startsWith("https://") &&
    !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(config.publicBaseUrl)
  const webhookConfigured =
    isConfigured(config.metaVerifyToken) && isConfigured(config.metaAppSecret)
  const configuredAccounts = accounts.filter((account) => account.configured)
  const selectedAccounts = accounts.filter((account) => liveAccounts.has(account.key))
  const activeLiveAccounts = accounts.filter((account) => account.live)
  const lastInboundAt = inbox[0]?.receivedAt ?? null
  const failedDeliveries = accounts.reduce(
    (total, account) => total + account.failedDeliveries,
    0,
  )
  const liveSelectionValid =
    selectedAccounts.length > 0 && selectedAccounts.every((account) => account.configured)
  const liveSelectionTested =
    selectedAccounts.length > 0 && selectedAccounts.every((account) => account.lastInboundAt)
  const pilotReady = Boolean(publicHttps && webhookConfigured && configuredAccounts.length)
  const liveReady = Boolean(
    pilotReady &&
      config.nodeEnv === "production" &&
      config.deliveryMode === "live" &&
      liveSelectionValid &&
      liveSelectionTested &&
      failedDeliveries === 0,
  )

  const checks = [
    check(
      "public-https",
      "Endereço público HTTPS",
      publicHttps ? "ok" : "blocked",
      publicHttps
        ? "A Meta consegue alcançar o serviço."
        : "Publique o serviço em HTTPS antes de registrar o webhook.",
    ),
    check(
      "webhook-secrets",
      "Assinatura do webhook",
      webhookConfigured ? "ok" : "blocked",
      webhookConfigured
        ? "Os segredos necessários estão configurados."
        : "Faltam META_APP_SECRET ou META_VERIFY_TOKEN.",
    ),
    check(
      "provider-account",
      "Conta de atendimento",
      configuredAccounts.length ? "ok" : "blocked",
      configuredAccounts.length
        ? `${configuredAccounts.length} conta(s) com ID e token.`
        : "Configure ao menos uma conta da Meta.",
    ),
    check(
      "inbound-test",
      "Evento real recebido",
      lastInboundAt ? "ok" : "warning",
      lastInboundAt
        ? `Última entrada: ${lastInboundAt}`
        : "Envie uma mensagem de teste mantendo o dry-run.",
    ),
    check(
      "production-mode",
      "Ambiente de produção",
      config.nodeEnv === "production" ? "ok" : "warning",
      config.nodeEnv === "production"
        ? "NODE_ENV está em production."
        : "Use NODE_ENV=production na publicação.",
    ),
    check(
      "live-scope",
      "Escopo de envio",
      config.deliveryMode === "live" && liveSelectionValid ? "ok" : "warning",
      config.deliveryMode === "live"
        ? `${selectedAccounts.length} conta(s) explicitamente liberada(s).`
        : "Dry-run ativo; nenhuma mensagem será enviada ao provedor.",
    ),
    check(
      "delivery-failures",
      "Falhas de envio",
      failedDeliveries ? "warning" : "ok",
      failedDeliveries
        ? `${failedDeliveries} falha(s) registrada(s) para revisar.`
        : "Nenhuma falha registrada.",
    ),
  ]

  return {
    stage: liveReady
      ? "live"
      : config.deliveryMode === "live"
        ? "attention"
        : pilotReady
          ? "dry-run"
          : "configuration",
    pilotReady,
    liveReady,
    deliveryMode: config.deliveryMode,
    liveAccounts: [...liveAccounts],
    summary: {
      configuredAccounts: configuredAccounts.length,
      liveAccounts: activeLiveAccounts.length,
      lastInboundAt,
      pendingReviews: reviews.length,
      failedDeliveries,
    },
    checks,
    accounts,
  }
}
