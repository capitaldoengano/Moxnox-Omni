const state = {
  apiKey: sessionStorage.getItem("moxnox-admin-key") ?? "",
  inbox: [],
  backlog: [],
  reviews: [],
  automations: [],
  summary: {},
  integrations: null,
  setup: null,
  readiness: null,
  analytics: {},
  filter: "priority",
  sort: "priority",
  backlogFilter: "open",
  search: "",
  selectedEventId: null,
  reviewDrafts: {},
  historyReturnFocus: null,
  currentView: "inbox",
  refreshTimer: null,
}

const classificationLabels = {
  unclassified: "Não classificada",
  potential_lead: "Potencial lead",
  qualified_lead: "Lead qualificado",
  follow_up: "Follow-up",
  customer: "Cliente",
  support: "Suporte",
  resolved: "Resolvida",
  discarded: "Descartada",
  sensitive: "Tema sensível",
}

const closedClassifications = new Set(["resolved", "discarded"])

const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]

function element(tag, options = {}, children = []) {
  const node = document.createElement(tag)
  if (options.className) node.className = options.className
  if (options.text !== undefined) node.textContent = options.text
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    node.setAttribute(name, value)
  }
  for (const child of children) {
    if (child) node.append(child)
  }
  return node
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers ?? {})
  headers.set("x-admin-api-key", state.apiKey)
  if (options.body) headers.set("content-type", "application/json")
  const response = await fetch(path, { ...options, headers })
  const payload = await response.json().catch(() => ({}))
  if (response.status === 401) throw new Error("unauthorized")
  if (!response.ok) throw new Error(payload.error ?? `Erro ${response.status}`)
  return payload.data ?? payload
}

function showToast(message) {
  const toast = $("#toast")
  toast.textContent = message
  toast.hidden = false
  window.setTimeout(() => {
    toast.hidden = true
  }, 3200)
}

function showLogin(message = "") {
  $("#login-view").hidden = false
  $("#app-view").hidden = true
  $("#login-error").textContent = message
  if (state.refreshTimer) {
    window.clearInterval(state.refreshTimer)
    state.refreshTimer = null
  }
}

function showApp() {
  $("#login-view").hidden = true
  $("#app-view").hidden = false
  if (!state.refreshTimer) {
    state.refreshTimer = window.setInterval(refresh, 30_000)
  }
}

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean)
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("pt-BR"))
    .join("")
}

function contactName(event) {
  if (event.contactName) return event.contactName
  const suffix = event.contactId?.slice(-4)
  return suffix ? `Contato •${suffix}` : "Contato"
}

function formatTime(value) {
  if (!value) return "sem atividade"
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function channelLabel(event) {
  if (event.channel === "instagram") {
    return event.kind === "comment" ? "Instagram · comentário" : "Instagram · direct"
  }
  if (event.channel === "whatsapp") return "WhatsApp"
  if (event.channel === "messenger") {
    return event.kind === "comment" ? "Facebook · comentário" : "Messenger"
  }
  return "Webchat"
}

function reasonLabel(item) {
  if (item.resolution?.outcome === "approved") return ["Aprovada", "auto"]
  if (item.resolution?.outcome === "rejected") return ["Encerrada", ""]
  if (item.decision?.outcome === "automated") return ["Automação", "auto"]
  if (item.decision?.reason === "sensitive_content") return ["Atenção", "review"]
  if (item.decision?.reason === "human_requested") return ["Pediu uma pessoa", "review"]
  if (item.decision?.reason === "recent_automation") return ["Ver contexto", "review"]
  if (item.decision?.reason === "account_not_live") return ["Conta protegida", "review"]
  if (item.decision?.outcome === "human_review") return ["Revisar", "review"]
  return ["Processando", ""]
}

function isPendingReview(item) {
  return item.decision?.outcome === "human_review" && !item.resolution
}

function isLead(item) {
  return (
    item.analysis?.intent === "sales" ||
    ["potential_lead", "qualified_lead", "follow_up"].includes(
      item.classification?.category,
    )
  )
}

function hasFailedDelivery(item) {
  return item.outbound?.some((outbound) => outbound.status === "failed") ?? false
}

function canDeliverEvent(event) {
  return (
    state.integrations?.deliveryMode === "live" &&
    state.integrations.liveAccounts?.includes(event.accountKey)
  )
}

function priorityScore(item) {
  if (item.decision?.reason === "human_requested") return 120
  if (item.decision?.reason === "sensitive_content") return 110
  if (hasFailedDelivery(item)) return 105
  if (item.decision?.reason === "recent_automation") return 100
  if (item.decision?.reason === "account_not_live") return 95
  if (isPendingReview(item)) return 90
  if (item.classification?.category === "qualified_lead") return 85
  if (item.classification?.category === "follow_up") return 80
  if (item.classification?.category === "potential_lead") return 70
  if (item.analysis?.intent === "sales") return 65
  return 0
}

function priorityLabel(item) {
  if (item.decision?.reason === "human_requested") return "Pediu atendimento"
  if (item.decision?.reason === "sensitive_content") return "Tema sensível"
  if (hasFailedDelivery(item)) return "Falha no envio"
  if (item.decision?.reason === "recent_automation") return "Evitar repetição"
  if (item.decision?.reason === "account_not_live") return "Conta protegida"
  if (isPendingReview(item)) return "Responder"
  if (item.classification?.category === "qualified_lead") return "Lead qualificado"
  if (item.classification?.category === "follow_up") return "Fazer follow-up"
  if (isLead(item)) return "Potencial lead"
  return null
}

function ageLabel(value) {
  const elapsed = Math.max(0, Date.now() - Date.parse(value))
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return "agora"
  if (minutes < 60) return `há ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return `há ${days}d`
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return "—"
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3_600) return `${Math.round(seconds / 60)}min`
  return `${Math.round(seconds / 3_600)}h`
}

function emptyState(message) {
  return element("div", { className: "empty-state", text: message })
}

function renderSummary() {
  $("#metric-backlog").textContent = state.summary.backlog ?? 0
  $("#metric-unclassified").textContent = state.summary.unclassified ?? 0
  $("#metric-leads").textContent = state.summary.potentialLeads ?? 0
  $("#metric-reviews").textContent = state.summary.pendingReviews ?? 0
  $("#nav-inbox-count").textContent = state.summary.inbound ?? 0
  $("#nav-backlog-count").textContent = state.summary.backlog ?? 0
  $("#nav-review-count").textContent = state.summary.pendingReviews ?? 0
}

function renderAnalytics() {
  $("#signal-automation").textContent = `${state.analytics.automationRate ?? 0}%`
  $("#signal-response-time").textContent = formatDuration(
    state.analytics.medianFirstResponseSeconds,
  )
  $("#signal-resolution").textContent = `${state.analytics.reviewResolutionRate ?? 0}%`
  $("#signal-overdue").textContent = state.analytics.pendingOver24Hours ?? 0
}

function historyButton(event) {
  const button = element("button", {
    className: "secondary-button compact-button history-button",
    text: "Histórico",
    attributes: { type: "button" },
  })
  button.addEventListener("click", () => openContactHistory(event))
  return button
}

function confirmLeadButton(item) {
  if (
    item.classification?.category !== "potential_lead" ||
    item.classification?.source === "manual"
  ) {
    return null
  }
  const button = element("button", {
    className: "secondary-button compact-button",
    text: "Confirmar lead",
    attributes: { type: "button" },
  })
  button.addEventListener("click", async () => {
    button.disabled = true
    try {
      await api(`/v1/inbox/${encodeURIComponent(item.event.id)}/classification`, {
        method: "POST",
        body: JSON.stringify({
          category: "potential_lead",
          note: "Lead confirmado na fila de mensagens",
        }),
      })
      showToast("Lead confirmado e registrado.")
      await refresh()
    } catch {
      showToast("Não foi possível confirmar o lead.")
      button.disabled = false
    }
  })
  return button
}

function conversationItem(item) {
  const event = item.event
  const name = contactName(event)
  const nextAction = priorityLabel(item)
  const button = element("button", {
    className: `conversation-item ${state.selectedEventId === event.id ? "is-selected" : ""}`,
    attributes: {
      type: "button",
      "aria-pressed": String(state.selectedEventId === event.id),
    },
  }, [
    element("span", { className: "avatar", text: initials(name) }),
    element("span", { className: "conversation-item-copy" }, [
      element("span", { className: "conversation-item-line" }, [
        element("strong", { text: name }),
        element("small", { text: ageLabel(item.receivedAt) }),
      ]),
      element("span", { className: "conversation-preview", text: event.text || "[sem texto]" }),
      element("span", { className: "conversation-item-line detail" }, [
        element("small", { text: channelLabel(event) }),
        nextAction ? element("small", { className: "conversation-priority", text: nextAction }) : null,
      ]),
    ]),
  ])
  button.addEventListener("click", () => {
    state.selectedEventId = event.id
    renderInbox()
  })
  return button
}

function matchesInboxFilter(item, filter) {
  if (filter === "priority") return priorityScore(item) > 0
  if (filter === "all") return true
  if (filter === "review") return isPendingReview(item)
  if (filter === "sales") return isLead(item)
  return false
}

function sortInbox(items) {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left.receivedAt)
    const rightTime = Date.parse(right.receivedAt)
    if (state.filter === "priority" || state.filter === "review") {
      const scoreDifference = priorityScore(right) - priorityScore(left)
      return scoreDifference || leftTime - rightTime
    }
    return rightTime - leftTime
  })
}

function conversationKey(item) {
  const event = item.event
  return event.contactId
    ? `${event.channel}:${event.accountId}:${event.contactId}`
    : event.id
}

function groupConversations(items) {
  const groups = new Map()
  for (const item of items) {
    const key = conversationKey(item)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return [...groups.values()].map((candidates) => {
    const pending = candidates.filter(isPendingReview)
    if (pending.length) return sortInbox(pending)[0]
    return [...candidates].sort(
      (left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt),
    )[0]
  })
}

function inboxSearchMatches(item, needle) {
  const event = item.event
  return [
    event.text,
    event.contactName,
    event.accountLabel,
    channelLabel(event),
    item.analysis?.label,
    classificationLabels[item.classification?.category],
  ]
    .join(" ")
    .toLocaleLowerCase("pt-BR")
    .includes(needle)
}

function inboxItems(filter, needle = "") {
  return groupConversations(
    state.inbox.filter(
      (item) => matchesInboxFilter(item, filter) && inboxSearchMatches(item, needle),
    ),
  )
}

function updateInboxCounts() {
  for (const filter of ["priority", "review", "sales", "all"]) {
    const count = inboxItems(filter).length
    const node = $(`[data-filter-count="${filter}"]`)
    if (node) node.textContent = count
  }
}

function setInboxFilter(filter) {
  state.filter = filter
  $$("#inbox-filters .conversation-tab").forEach((candidate) => {
    candidate.classList.toggle("is-active", candidate.dataset.filter === filter)
    candidate.setAttribute("aria-pressed", String(candidate.dataset.filter === filter))
  })
  renderInbox()
}

function conversationEmpty(title = "Selecione uma conversa", description = "O histórico e as ações aparecem aqui.") {
  return element("div", { className: "conversation-empty" }, [
    element("span", { className: "conversation-empty-mark", text: "M." }),
    element("h3", { text: title }),
    element("p", { text: description }),
  ])
}

function openItemInBacklog(item) {
  const category = item.classification?.category
  const visibleFilters = new Set([
    "unclassified",
    "potential_lead",
    "qualified_lead",
    "follow_up",
    "customer",
  ])
  state.backlogFilter = closedClassifications.has(category)
    ? "closed"
    : visibleFilters.has(category)
      ? category
      : "open"
  $$('[data-backlog-filter]').forEach((candidate) =>
    candidate.classList.toggle("is-active", candidate.dataset.backlogFilter === state.backlogFilter),
  )
  switchView("backlog")
  renderBacklog()
}

async function renderConversationDetail(item) {
  const detail = $("#conversation-detail")
  if (!item) {
    detail.replaceChildren(conversationEmpty())
    return
  }
  const event = item.event
  const requestedId = event.id
  const name = contactName(event)
  const [status, statusClass] = reasonLabel(item)
  const backlog = element("button", {
    className: "secondary-button compact-button",
    text: "Classificar",
    attributes: { type: "button" },
  })
  backlog.addEventListener("click", () => openItemInBacklog(item))
  const timeline = element("div", { className: "conversation-timeline" }, [
    element("p", { className: "muted-copy", text: "Carregando histórico…" }),
  ])
  const actions = [backlog, confirmLeadButton(item)]
  detail.replaceChildren(
    element("header", { className: "conversation-detail-head" }, [
      element("div", { className: "identity" }, [
        element("span", { className: "avatar", text: initials(name) }),
        element("div", {}, [
          element("strong", { text: name }),
          element("span", { text: `${event.accountLabel} · ${channelLabel(event)}` }),
        ]),
      ]),
      element("div", { className: "conversation-detail-actions" }, [
        element("span", { className: `status-tag ${statusClass}`, text: status }),
        ...actions,
      ]),
    ]),
    timeline,
    isPendingReview(item)
      ? createReviewComposer(item, { compact: true })
      : element("div", { className: "conversation-closed-state" }, [
          element("strong", { text: item.resolution ? "Atendimento concluído" : "Automação registrada" }),
          element("span", {
            text: item.resolution
              ? "A conversa permanece disponível para consulta."
              : "Se precisar de intervenção humana, use a classificação para organizar o próximo passo.",
          }),
        ]),
  )
  try {
    const records = await api(`/v1/inbox/${encodeURIComponent(event.id)}/history`)
    if (state.selectedEventId !== requestedId) return
    timeline.replaceChildren()
    for (const record of records) {
      const rendered = historyRecord(record)
      if (rendered) timeline.append(rendered)
    }
    if (!timeline.childElementCount) timeline.append(emptyState("Ainda não há histórico."))
    timeline.scrollTop = timeline.scrollHeight
  } catch {
    if (state.selectedEventId === requestedId) {
      timeline.replaceChildren(emptyState("Não foi possível carregar o histórico."))
    }
  }
}

function renderInbox() {
  const list = $("#inbox-list")
  list.replaceChildren()
  updateInboxCounts()
  const needle = state.search.toLocaleLowerCase("pt-BR")
  const filtered = sortInbox(inboxItems(state.filter, needle))
  const total = inboxItems("all").length
  $("#inbox-result-status").textContent = `${filtered.length} de ${total}`
  if (!filtered.length) {
    state.selectedEventId = null
    const empty = emptyState(
      state.filter === "priority"
        ? "Fila prioritária limpa. As outras mensagens continuam em Tudo."
        : "Nada por aqui com esse filtro.",
    )
    if (state.filter === "priority") {
      const showAll = element("button", {
        className: "secondary-button",
        text: "Mostrar todas",
        attributes: { type: "button" },
      })
      showAll.addEventListener("click", () => setInboxFilter("all"))
      empty.append(showAll)
    }
    list.append(empty)
    renderConversationDetail(null)
    return
  }
  if (!filtered.some((item) => item.event.id === state.selectedEventId)) {
    state.selectedEventId = filtered[0].event.id
  }
  for (const item of filtered) list.append(conversationItem(item))
  renderConversationDetail(
    filtered.find((item) => item.event.id === state.selectedEventId),
  )
}

function closeContactHistory() {
  $("#history-drawer").hidden = true
  $("#history-scrim").hidden = true
  document.body.classList.remove("drawer-open")
  state.historyReturnFocus?.focus()
  state.historyReturnFocus = null
}

function historyRecord(record) {
  if (record.type === "inbound") {
    return element("article", { className: "history-record inbound" }, [
      element("div", { className: "history-record-head" }, [
        element("strong", { text: "Recebida" }),
        element("span", { text: formatTime(record.at) }),
      ]),
      element("p", { text: record.event.text || "[sem texto]" }),
      element("small", { text: channelLabel(record.event) }),
    ])
  }
  if (record.type === "outbound") {
    const status =
      record.outbound.status === "planned"
        ? "Planejada em dry-run"
        : record.outbound.status === "failed"
          ? "Falha no envio"
          : "Resposta registrada"
    return element("article", { className: "history-record outbound" }, [
      element("div", { className: "history-record-head" }, [
        element("strong", { text: status }),
        element("span", { text: formatTime(record.at) }),
      ]),
      element("p", { text: record.outbound.text || "[sem texto]" }),
      record.outbound.error
        ? element("small", { className: "history-error", text: record.outbound.error })
        : null,
    ])
  }
  if (record.type === "classification") {
    return element("article", { className: "history-record system" }, [
      element("div", { className: "history-record-head" }, [
        element("strong", {
          text: classificationLabels[record.classification.category] ?? "Classificação",
        }),
        element("span", { text: formatTime(record.at) }),
      ]),
      record.classification.note
        ? element("p", { text: record.classification.note })
        : element("p", { text: "Classificação atualizada sem nota." }),
    ])
  }
  if (record.type === "review_resolution") {
    return element("article", { className: "history-record system" }, [
      element("div", { className: "history-record-head" }, [
        element("strong", {
          text: record.resolution.outcome === "approved" ? "Revisão respondida" : "Revisão encerrada",
        }),
        element("span", { text: formatTime(record.at) }),
      ]),
    ])
  }
  return null
}

async function openContactHistory(event) {
  state.historyReturnFocus = document.activeElement
  $("#history-title").textContent = contactName(event)
  $("#history-subtitle").textContent = `${event.accountLabel} · ${channelLabel(event)}`
  const timeline = $("#history-timeline")
  timeline.replaceChildren(element("p", { className: "muted-copy", text: "Carregando contexto…" }))
  $("#history-drawer").hidden = false
  $("#history-scrim").hidden = false
  document.body.classList.add("drawer-open")
  $("#history-close").focus()
  try {
    const records = await api(`/v1/inbox/${encodeURIComponent(event.id)}/history`)
    timeline.replaceChildren()
    if (!records.length) {
      timeline.append(emptyState("Ainda não há histórico para este contato."))
      return
    }
    for (const record of records) {
      const rendered = historyRecord(record)
      if (rendered) timeline.append(rendered)
    }
  } catch {
    timeline.replaceChildren(
      emptyState("Não foi possível carregar o histórico deste contato."),
    )
  }
}

function classificationSelect(item) {
  const select = element("select", {
    attributes: { "aria-label": "Classificação da mensagem" },
  })
  for (const [value, label] of Object.entries(classificationLabels)) {
    const option = element("option", { text: label, attributes: { value } })
    option.selected = item.classification.category === value
    select.append(option)
  }
  return select
}

function backlogCard(item) {
  const event = item.event
  const name = contactName(event)
  const select = classificationSelect(item)
  const note = element("input", {
    attributes: {
      value: item.classification.note ?? "",
      maxlength: "1000",
      placeholder: "Nota interna opcional",
      "aria-label": `Nota interna para ${name}`,
    },
  })
  const save = element("button", {
    className: "primary-button compact-button",
    text: "Salvar",
  })
  save.addEventListener("click", async () => {
    save.disabled = true
    try {
      await api(`/v1/inbox/${encodeURIComponent(event.id)}/classification`, {
        method: "POST",
        body: JSON.stringify({ category: select.value, note: note.value.trim() }),
      })
      showToast("Classificação registrada.")
      await refresh()
    } catch (error) {
      showToast(error.message === "unauthorized" ? "Chave inválida." : "Não foi possível classificar.")
    } finally {
      save.disabled = false
    }
  })

  return element("article", { className: "backlog-card" }, [
    element("div", { className: "message-meta" }, [
      element("div", { className: "identity" }, [
        element("span", { className: "avatar", text: initials(name) }),
        element("div", {}, [
          element("strong", { text: name }),
          element("span", { text: `${event.accountLabel} · ${channelLabel(event)}` }),
        ]),
      ]),
      element("span", { className: "timestamp", text: formatTime(item.receivedAt) }),
    ]),
    element("p", { className: "message-text", text: event.text || "[sem texto]" }),
    element("div", { className: "catalog-context" }, [
      element("span", {
        className: `status-tag ${item.analysis.intent === "sales" ? "sales" : ""}`,
        text: `Leitura: ${item.analysis.label}`,
      }),
      historyButton(event),
      element("span", {
        className: `status-tag ${item.classification.source === "manual" ? "auto" : ""}`,
        text: item.classification.source === "manual" ? "Catalogação manual" : "Sugestão automática",
      }),
    ]),
    element("div", { className: "classification-controls" }, [select, note, save]),
  ])
}

function renderBacklog() {
  const list = $("#backlog-list")
  list.replaceChildren()
  const filtered = state.backlog.filter((item) => {
    const category = item.classification.category
    if (state.backlogFilter === "open") return !closedClassifications.has(category)
    if (state.backlogFilter === "closed") return closedClassifications.has(category)
    return category === state.backlogFilter
  })
  if (!filtered.length) {
    list.append(emptyState("Nenhuma mensagem nessa etapa do catálogo."))
    return
  }
  for (const item of filtered) list.append(backlogCard(item))
}

function targetOptions(event) {
  if (event.kind === "message") return [["direct_message", "Responder em mensagem"]]
  return [
    ["public_comment", "Responder publicamente"],
    ["private_comment_reply", "Responder no privado"],
  ]
}

function reviewReasonText(reason) {
  return (
    {
      sensitive_content: "Tema sensível: leia o contexto antes de responder.",
      human_requested: "A pessoa pediu atendimento humano.",
      recent_automation: "A automação foi interrompida para não repetir a mesma resposta.",
      account_not_live: "Esta conta está protegida e não pode enviar respostas reais.",
      no_matching_automation: "Ainda não existe uma resposta automática confiável.",
    }[reason] ?? "Esta mensagem precisa de uma decisão humana."
  )
}

function createReviewComposer(item, { compact = false } = {}) {
  const event = item.event
  const name = contactName(event)
  const draft = state.reviewDrafts[event.id] ?? {
    text: "",
    target: targetOptions(event)[0]?.[0] ?? "direct_message",
  }
  state.reviewDrafts[event.id] = draft
  const textarea = element("textarea", {
    attributes: {
      placeholder: "Escreva uma resposta com contexto e no tom certo…",
      "aria-label": `Resposta para ${name}`,
    },
  })
  textarea.value = draft.text
  textarea.addEventListener("input", () => {
    draft.text = textarea.value
  })
  const select = element("select", { attributes: { "aria-label": "Destino da resposta" } })
  for (const [value, label] of targetOptions(event)) {
    const option = element("option", { text: label, attributes: { value } })
    option.selected = value === draft.target
    select.append(option)
  }
  select.addEventListener("change", () => {
    draft.target = select.value
  })
  const approve = element("button", {
    className: "primary-button",
    text: canDeliverEvent(event) ? "Enviar resposta" : "Simular resposta",
    attributes: { type: "button" },
  })
  const reject = element("button", {
    className: "danger-button",
    text: "Encerrar sem responder",
    attributes: { type: "button" },
  })
  approve.addEventListener("click", async () => {
    const text = textarea.value.trim()
    if (!text) {
      textarea.focus()
      return showToast("Escreva a resposta antes de aprovar.")
    }
    approve.disabled = true
    try {
      const result = await api(`/v1/reviews/${encodeURIComponent(event.id)}/approve`, {
        method: "POST",
        body: JSON.stringify({ text, target: select.value }),
      })
      if (result.status === "delivered") {
        delete state.reviewDrafts[event.id]
        showToast("Resposta enviada e registrada.")
      } else {
        showToast("Simulação registrada. Nada foi enviado e a conversa continua aberta.")
      }
      await refresh()
    } catch (error) {
      showToast(error.message === "unauthorized" ? "Chave inválida." : "Não foi possível responder.")
    } finally {
      approve.disabled = false
    }
  })
  reject.addEventListener("click", async () => {
    if (!window.confirm("Encerrar esta mensagem sem enviar uma resposta?")) return
    reject.disabled = true
    try {
      await api(`/v1/reviews/${encodeURIComponent(event.id)}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: "closed_by_operator" }),
      })
      delete state.reviewDrafts[event.id]
      showToast("Mensagem encerrada sem resposta.")
      await refresh()
    } catch {
      showToast("Não foi possível encerrar a mensagem.")
    } finally {
      reject.disabled = false
    }
  })
  return element(
    "div",
    {
      className: `review-composer ${compact ? "is-compact" : ""}`,
      attributes: { "data-review-composer": event.id },
    },
    [
      element("div", { className: "composer-head" }, [
        element("div", {}, [
          element("strong", { text: compact ? "Responder sem sair da fila" : "Sua resposta" }),
          element("p", { text: reviewReasonText(item.decision.reason) }),
        ]),
        compact ? null : historyButton(event),
      ]),
      textarea,
      element("div", { className: "review-actions" }, [select, reject, approve]),
    ],
  )
}

function reviewCard(item) {
  const event = item.event
  const name = contactName(event)
  return element("article", { className: "review-card" }, [
    element("div", { className: "review-head" }, [
      element("div", { className: "identity" }, [
        element("span", { className: "avatar", text: initials(name) }),
        element("div", {}, [
          element("strong", { text: name }),
          element("span", { text: `${event.accountLabel} · ${channelLabel(event)}` }),
        ]),
      ]),
      element("div", { className: "message-tags" }, [
        element("span", {
          className: "status-tag review",
          text:
            {
              sensitive_content: "Tema sensível",
              human_requested: "Pediu atendimento",
              recent_automation: "Resposta repetida evitada",
              account_not_live: "Conta protegida",
              no_matching_automation: "Sem automação",
            }[item.decision.reason] ?? "Revisar",
        }),
        historyButton(event),
      ]),
    ]),
    element("p", { className: "message-text", text: event.text || "[sem texto]" }),
    createReviewComposer(item),
  ])
}

function renderReviews() {
  const list = $("#review-list")
  list.replaceChildren()
  if (!state.reviews.length) {
    list.append(emptyState("Fila limpa. Nenhuma mensagem esperando por vocês."))
    return
  }
  for (const item of state.reviews) list.append(reviewCard(item))
}

function checkedValues(name) {
  return $$(`input[name="${name}"]:checked`).map((input) => input.value)
}

function setCheckedValues(name, values) {
  $$(`input[name="${name}"]`).forEach((input) => {
    input.checked = values.includes(input.value)
  })
}

function automationPayload() {
  return {
    id: $("#automation-id").value.trim(),
    name: $("#automation-name").value.trim(),
    enabled: $("#automation-enabled").checked,
    accounts: checkedValues("automation-account"),
    channels: checkedValues("automation-channel"),
    kinds: checkedValues("automation-kind"),
    match: {
      mode: $("#automation-mode").value,
      terms: $("#automation-terms")
        .value.split("\n")
        .map((term) => term.trim())
        .filter(Boolean),
    },
    action: {
      messageReply: $("#automation-message-reply").value.trim(),
      privateReply: $("#automation-private-reply").value.trim(),
      publicReply: $("#automation-public-reply").value.trim(),
    },
  }
}

function resetAutomationForm() {
  $("#automation-form").reset()
  delete $("#automation-id").dataset.edited
  $("#automation-enabled").checked = true
  setCheckedValues("automation-account", ["capital-do-engano"])
  setCheckedValues("automation-channel", ["instagram"])
  setCheckedValues("automation-kind", ["comment", "message"])
  $("#automation-editor-title").textContent = "Nova regra"
  $("#automation-form-status").textContent = ""
  $("#automation-id").readOnly = false
  $("#automation-name").focus()
}

function editAutomation(rule) {
  $("#automation-name").value = rule.name ?? rule.id
  $("#automation-id").value = rule.id
  $("#automation-id").readOnly = true
  $("#automation-enabled").checked = rule.enabled
  setCheckedValues("automation-account", rule.accounts)
  setCheckedValues("automation-channel", rule.channels)
  setCheckedValues("automation-kind", rule.kinds)
  $("#automation-mode").value = rule.match.mode
  $("#automation-terms").value = rule.match.terms.join("\n")
  $("#automation-message-reply").value = rule.action.messageReply ?? ""
  $("#automation-private-reply").value = rule.action.privateReply ?? ""
  $("#automation-public-reply").value = rule.action.publicReply ?? ""
  $("#automation-editor-title").textContent = rule.name ?? rule.id
  $("#automation-form-status").textContent = "Editando regra existente"
  $("#automation-form").scrollIntoView({ behavior: "smooth", block: "start" })
}

function automationCard(rule) {
  const edit = element("button", { className: "secondary-button compact-button", text: "Editar" })
  const toggle = element("button", {
    className: rule.enabled ? "danger-button compact-button" : "primary-button compact-button",
    text: rule.enabled ? "Pausar" : "Ativar",
  })
  edit.addEventListener("click", () => editAutomation(rule))
  toggle.addEventListener("click", async () => {
    toggle.disabled = true
    try {
      await api(`/v1/automations/${encodeURIComponent(rule.id)}`, {
        method: "PUT",
        body: JSON.stringify({ ...rule, enabled: !rule.enabled }),
      })
      showToast(rule.enabled ? "Regra pausada." : "Regra ativada.")
      await refresh()
    } catch {
      showToast("Não foi possível alterar a regra.")
    } finally {
      toggle.disabled = false
    }
  })
  const preview = rule.action.messageReply || rule.action.privateReply || rule.action.publicReply
  return element("article", { className: `automation-card ${rule.enabled ? "" : "is-paused"}` }, [
    element("div", { className: "automation-card-head" }, [
      element("div", {}, [
        element("strong", { text: rule.name ?? rule.id }),
        element("code", { text: rule.id }),
      ]),
      element("span", {
        className: `connection-status ${rule.enabled ? "ok" : "pending"}`,
        text: rule.enabled ? "Ativa" : "Pausada",
      }),
    ]),
    element("p", {
      className: "automation-scope",
      text: `${rule.accounts.join(", ")} · ${rule.channels.join(", ")} · ${rule.kinds.join(", ")}`,
    }),
    element("p", {
      className: "automation-terms",
      text: `Dispara com: ${rule.match.terms.slice(0, 5).join(" · ")}${rule.match.terms.length > 5 ? "…" : ""}`,
    }),
    element("p", { className: "response-preview", text: preview || "Sem resposta configurada" }),
    element("div", { className: "card-actions" }, [edit, toggle]),
  ])
}

function renderAutomations() {
  const list = $("#automation-list")
  list.replaceChildren()
  if (!state.automations.length) {
    list.append(emptyState("Nenhuma regra criada."))
    return
  }
  for (const rule of state.automations) list.append(automationCard(rule))
}

async function copyText(value, successMessage) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
    } else {
      const fallback = element("textarea", { attributes: { readonly: "" } })
      fallback.value = value
      document.body.append(fallback)
      fallback.select()
      document.execCommand("copy")
      fallback.remove()
    }
    showToast(successMessage)
  } catch {
    showToast("Não foi possível copiar automaticamente.")
  }
}

function copyButton(value, label = "Copiar") {
  const button = element("button", {
    className: "secondary-button compact-button",
    text: label,
    attributes: { type: "button" },
  })
  button.addEventListener("click", () => copyText(value, "Copiado."))
  return button
}

function accessCard(kicker, title, value, description, copyLabel = "Copiar") {
  const actions = []
  if (value) actions.push(copyButton(value, copyLabel))
  return element("article", { className: "access-card" }, [
    element("p", { className: "eyebrow", text: kicker }),
    element("h4", { text: title }),
    value ? element("code", { className: "access-value", text: value }) : null,
    element("p", { text: description }),
    actions.length ? element("div", { className: "card-actions" }, actions) : null,
  ])
}

function setupItemCard(entry) {
  const details = element("div", { className: "setup-item-copy" }, [
    element("strong", { text: entry.label }),
    element("code", { text: entry.key }),
    element("p", { text: entry.source }),
  ])
  const status = element("span", {
    className: `connection-status ${entry.configured ? "ok" : "pending"}`,
    text: entry.configured ? "Pronto" : "Falta",
  })
  const trailing = [status]
  if (entry.docsUrl) {
    trailing.push(
      element("a", {
        className: "docs-link",
        text: "Abrir guia oficial",
        attributes: {
          href: entry.docsUrl,
          target: "_blank",
          rel: "noreferrer",
        },
      }),
    )
  }
  return element("li", { className: "setup-item" }, [
    element("span", {
      className: `setup-dot ${entry.configured ? "ok" : "pending"}`,
      attributes: { "aria-hidden": "true" },
    }),
    details,
    element("div", { className: "setup-item-actions" }, trailing),
  ])
}

function setupGroupCard(group) {
  const configured = group.items.filter((entry) => entry.configured).length
  const list = element("ul", { className: "setup-items" })
  for (const entry of group.items) list.append(setupItemCard(entry))
  return element("article", { className: "setup-group-card" }, [
    element("div", { className: "setup-group-head" }, [
      element("div", {}, [
        element("h4", { text: group.title }),
        element("p", { text: group.description }),
      ]),
      element("strong", { text: `${configured}/${group.items.length}` }),
    ]),
    list,
  ])
}

function renderSetup() {
  if (!state.setup) return
  const access = $("#setup-access")
  access.replaceChildren(
    accessCard(
      "1 · PREPARAR",
      "Gerar o arquivo seguro",
      "npm run setup",
      "Rode uma vez na pasta do projeto. A chave do cockpit será mostrada no terminal.",
    ),
    accessCard(
      "2 · LIGAR",
      "Iniciar o serviço",
      "npm start",
      "O terminal mantém o processo ligado. Em Docker, use docker compose up -d --build.",
    ),
    accessCard(
      "3 · ACESSAR",
      "Abrir pelo navegador",
      state.setup.access.cockpitUrl,
      "Depois da partida, o uso cotidiano acontece no cockpit — não no terminal.",
      "Copiar URL",
    ),
    accessCard(
      "4 · CONECTAR META",
      "URL do webhook",
      state.setup.access.webhookUrl,
      "Cole esta URL no campo Callback URL do webhook no painel da Meta.",
      "Copiar webhook",
    ),
  )

  const progress = state.setup.progress
  $("#setup-progress-value").textContent = `${progress.percentage}%`
  $("#setup-progress-label").textContent = `${progress.configured} de ${progress.total} itens configurados`
  $("#setup-progress-bar").style.width = `${progress.percentage}%`
  if (state.setup.network.webhookCanBeRegistered) {
    $("#setup-network-note").textContent = "A URL pública usa HTTPS e pode ser registrada como webhook."
  } else if (state.setup.network.publicUrlIsLocal) {
    $("#setup-network-note").textContent =
      "localhost serve para conhecer o painel, mas a Meta precisa de uma URL pública HTTPS para entregar mensagens."
  } else {
    $("#setup-network-note").textContent =
      "A URL pública ainda precisa usar HTTPS antes de registrar o webhook na Meta."
  }

  const groups = $("#setup-group-list")
  groups.replaceChildren()
  for (const group of state.setup.groups) groups.append(setupGroupCard(group))
}

function renderReadiness() {
  if (!state.readiness) return
  const readiness = state.readiness
  const stageLabels = {
    configuration: ["Configuração incompleta", "blocked"],
    "dry-run": ["Pronto para testar", "warning"],
    attention: ["Live pede atenção", "blocked"],
    live: ["Operação ao vivo", "ok"],
  }
  const [title, status] = stageLabels[readiness.stage] ?? ["Verificando", "warning"]
  $("#readiness-title").textContent = title
  const stage = $("#readiness-stage")
  stage.textContent = readiness.stage === "dry-run" ? "dry-run" : title
  stage.className = `readiness-stage ${status}`
  $("#readiness-accounts").textContent = readiness.summary.configuredAccounts
  $("#readiness-live").textContent = readiness.summary.liveAccounts
  $("#readiness-inbound").textContent = readiness.summary.lastInboundAt
    ? formatTime(readiness.summary.lastInboundAt)
    : "nenhuma"
  $("#readiness-failures").textContent = readiness.summary.failedDeliveries

  const checks = $("#readiness-checks")
  checks.replaceChildren()
  for (const entry of readiness.checks) {
    checks.append(
      element("li", { className: `readiness-check ${entry.status}` }, [
        element("span", { className: "readiness-check-dot", attributes: { "aria-hidden": "true" } }),
        element("div", {}, [
          element("strong", { text: entry.label }),
          element("p", { text: entry.detail }),
        ]),
      ]),
    )
  }
}

function connectionCard(connection) {
  const activity = state.readiness?.accounts.find((account) => account.key === connection.key)
  const stateLabel = !connection.configured
    ? "Pendente"
    : connection.live
      ? "Envio real"
      : state.integrations?.deliveryMode === "live"
        ? "Protegida"
        : "Dry-run"
  return element("article", { className: "connection-card" }, [
    element("div", { className: "connection-head" }, [
      element("h4", { text: connection.label }),
      element("span", {
        className: `connection-status ${connection.live ? "ok" : connection.configured ? "guarded" : "pending"}`,
        text: stateLabel,
      }),
    ]),
    element("p", {
      text: `${connection.channel === "instagram" ? "Instagram" : "WhatsApp"} · ${connection.accountId ?? "ID ainda não informado"}`,
    }),
    activity
      ? element("p", {
          text: activity.lastInboundAt
            ? `Última entrada ${formatTime(activity.lastInboundAt)} · ${activity.pendingReviews} para revisar · ${activity.failedDeliveries} falhas`
            : "Nenhum evento real recebido por esta conta.",
        })
      : null,
  ])
}

function renderConnections() {
  if (!state.integrations) return
  const list = $("#connection-list")
  list.replaceChildren()
  const webhook = state.integrations.webhook
  list.append(
    element("article", { className: "connection-card" }, [
      element("div", { className: "connection-head" }, [
        element("h4", { text: "Webhook Meta" }),
        element("span", {
          className: `connection-status ${webhook.configured ? "ok" : "pending"}`,
          text: webhook.configured ? "Configurado" : "Pendente",
        }),
      ]),
      element("p", { text: webhook.url ?? "Defina PUBLIC_BASE_URL para gerar a URL pública." }),
    ]),
  )
  for (const connection of state.integrations.accounts) list.append(connectionCard(connection))
  const mode = state.integrations.deliveryMode ?? "dry-run"
  const liveCount = state.integrations.liveAccounts?.length ?? 0
  $("#delivery-mode").textContent =
    mode === "live" ? `live · ${liveCount} conta(s)` : "modo: dry-run"
  $("#delivery-mode").classList.toggle("live", mode === "live")
}

function switchView(view) {
  state.currentView = view
  const labels = {
    inbox: ["ATENDIMENTO", "Mensagens"],
    backlog: ["CATÁLOGO", "Backlog e leads"],
    reviews: ["DECISÃO HUMANA", "Precisa de você"],
    automations: ["CONFIGURAÇÃO", "Respostas automáticas"],
    setup: ["SEGURANÇA", "Pré-operação"],
  }
  for (const name of Object.keys(labels)) $(`#${name}-view`).hidden = name !== view
  $("#summary-strip").hidden = ["inbox", "automations", "setup"].includes(view)
  $("#view-kicker").textContent = labels[view][0]
  $("#view-title").textContent = labels[view][1]
  $$(".nav-item").forEach((button) => button.classList.toggle("is-active", button.dataset.view === view))
}

async function refresh() {
  $("#sync-status").textContent = "Atualizando…"
  try {
    const [summary, analytics, inbox, backlog, reviews, automations, integrations, setup, readiness] = await Promise.all([
      api("/v1/summary"),
      api("/v1/analytics"),
      api("/v1/inbox?limit=150"),
      api("/v1/backlog?scope=all"),
      api("/v1/reviews"),
      api("/v1/automations"),
      api("/v1/integrations"),
      api("/v1/setup"),
      api("/v1/readiness"),
    ])
    state.summary = summary
    state.analytics = analytics
    state.inbox = inbox
    state.backlog = backlog
    state.reviews = reviews
    state.automations = automations
    state.integrations = integrations
    state.setup = setup
    state.readiness = readiness
    renderSummary()
    renderAnalytics()
    renderInbox()
    renderBacklog()
    renderReviews()
    renderAutomations()
    renderConnections()
    renderSetup()
    renderReadiness()
    $("#sync-status").textContent = `Atualizado ${new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date())}`
  } catch (error) {
    if (error.message === "unauthorized") {
      state.apiKey = ""
      sessionStorage.removeItem("moxnox-admin-key")
      showLogin("Chave inválida ou expirada.")
      return
    }
    $("#sync-status").textContent = "Falha ao atualizar"
    showToast("O cockpit não conseguiu falar com o servidor.")
  }
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault()
  state.apiKey = $("#api-key").value.trim()
  if (!state.apiKey) return
  $("#login-error").textContent = ""
  try {
    await api("/v1/summary")
    sessionStorage.setItem("moxnox-admin-key", state.apiKey)
    showApp()
    await refresh()
  } catch {
    showLogin("Essa chave não abriu o cockpit. Confira o ADMIN_API_KEY.")
  }
})

$("#logout-button").addEventListener("click", () => {
  state.apiKey = ""
  sessionStorage.removeItem("moxnox-admin-key")
  $("#api-key").value = ""
  showLogin()
})

$("#refresh-button").addEventListener("click", refresh)

$("#inbox-search").addEventListener("input", (event) => {
  state.search = event.target.value
  renderInbox()
})

$("#inbox-filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]")
  if (!button) return
  setInboxFilter(button.dataset.filter)
})

$("#backlog-filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-backlog-filter]")
  if (!button) return
  state.backlogFilter = button.dataset.backlogFilter
  $$('[data-backlog-filter]').forEach((candidate) =>
    candidate.classList.toggle("is-active", candidate === button),
  )
  renderBacklog()
})

$("#new-automation-button").addEventListener("click", resetAutomationForm)

$("#automation-name").addEventListener("input", (event) => {
  const idInput = $("#automation-id")
  if (idInput.readOnly || idInput.dataset.edited === "true") return
  idInput.value = event.target.value
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 80)
})

$("#automation-id").addEventListener("input", (event) => {
  event.target.dataset.edited = "true"
})

$("#automation-form").addEventListener("submit", async (event) => {
  event.preventDefault()
  const rule = automationPayload()
  const submit = event.submitter
  submit.disabled = true
  $("#automation-form-status").textContent = "Salvando…"
  try {
    await api(`/v1/automations/${encodeURIComponent(rule.id)}`, {
      method: "PUT",
      body: JSON.stringify(rule),
    })
    $("#automation-form-status").textContent = "Regra salva e já disponível"
    showToast("Automação salva.")
    await refresh()
  } catch (error) {
    $("#automation-form-status").textContent = "Confira contas, canais, disparadores e respostas"
    showToast(`Não foi possível salvar: ${error.message}`)
  } finally {
    submit.disabled = false
  }
})

$("#automation-test-form").addEventListener("submit", async (event) => {
  event.preventDefault()
  const output = $("#automation-test-result")
  const submit = event.submitter
  submit.disabled = true
  output.textContent = "Simulando…"
  try {
    const result = await api("/v1/automations/test", {
      method: "POST",
      body: JSON.stringify({
        accountKey: $("#test-account").value,
        channel: $("#test-channel").value,
        kind: $("#test-kind").value,
        text: $("#test-message").value.trim(),
      }),
    })
    const decision = result.decision
    if (decision.outcome !== "automated") {
      output.textContent = `Vai para revisão humana: ${decision.reason}`
    } else {
      const action = decision.action ?? {}
      const replies =
        $("#test-kind").value === "message"
          ? [action.messageReply].filter(Boolean)
          : [action.privateReply, action.publicReply].filter(Boolean)
      output.textContent = `Regra ${decision.ruleId}: ${replies.join(" | ")}`
    }
  } catch (error) {
    output.textContent = `Teste não concluído: ${error.message}`
  } finally {
    submit.disabled = false
  }
})

$("#test-account").addEventListener("change", (event) => {
  const channelByAccount = {
    "capital-do-engano": "instagram",
    gu: "instagram",
    whatsapp: "whatsapp",
    messenger: "messenger",
    webchat: "webchat",
  }
  $("#test-channel").value = channelByAccount[event.target.value]
})

$("#history-close").addEventListener("click", closeContactHistory)
$("#history-scrim").addEventListener("click", closeContactHistory)
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#history-drawer").hidden) closeContactHistory()
})

$$(".nav-item").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view))
})

if (state.apiKey) {
  showApp()
  refresh()
} else {
  showLogin()
}
