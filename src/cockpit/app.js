const state = {
  apiKey: sessionStorage.getItem("moxnox-admin-key") ?? "",
  inbox: [],
  reviews: [],
  summary: {},
  integrations: null,
  filter: "all",
  search: "",
  currentView: "inbox",
  refreshTimer: null,
}

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
  if (state.refreshTimer) window.clearInterval(state.refreshTimer)
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
  if (item.decision?.outcome === "human_review") return ["Revisar", "review"]
  return ["Processando", ""]
}

function emptyState(message) {
  return element("div", { className: "empty-state", text: message })
}

function renderSummary() {
  $("#metric-inbound").textContent = state.summary.inbound ?? 0
  $("#metric-sales").textContent = state.summary.salesOpportunities ?? 0
  $("#metric-automated").textContent = state.summary.automated ?? 0
  $("#metric-reviews").textContent = state.summary.pendingReviews ?? 0
  $("#nav-inbox-count").textContent = state.summary.inbound ?? 0
  $("#nav-review-count").textContent = state.summary.pendingReviews ?? 0
}

function messageCard(item) {
  const event = item.event
  const name = contactName(event)
  const [status, statusClass] = reasonLabel(item)
  const latestOutbound = item.outbound?.at(-1)
  const identity = element("div", { className: "identity" }, [
    element("span", { className: "avatar", text: initials(name) }),
    element("div", {}, [
      element("strong", { text: name }),
      element("span", { text: event.accountLabel }),
    ]),
  ])
  const meta = element("div", { className: "message-meta" }, [
    identity,
    element("span", { className: "timestamp", text: formatTime(item.receivedAt) }),
  ])
  const footer = element("div", { className: "message-footer" }, [
    element("span", { className: "channel-tag", text: channelLabel(event) }),
    element("div", { className: "message-tags" }, [
      element("span", {
        className: `status-tag ${item.analysis?.intent === "sales" ? "sales" : ""}`,
        text: item.analysis?.label ?? "Conversa",
      }),
      element("span", { className: `status-tag ${statusClass}`, text: status }),
    ]),
  ])
  const children = [meta, element("p", { className: "message-text", text: event.text || "[sem texto]" })]
  if (latestOutbound?.text) {
    children.push(
      element("p", {
        className: "response-preview",
        text: `Resposta ${latestOutbound.status === "planned" ? "planejada" : "registrada"}: ${latestOutbound.text}`,
      }),
    )
  }
  children.push(footer)
  return element("article", { className: "message-card" }, children)
}

function renderInbox() {
  const list = $("#inbox-list")
  list.replaceChildren()
  const needle = state.search.toLocaleLowerCase("pt-BR")
  const filtered = state.inbox.filter((item) => {
    const event = item.event
    const matchesSearch = [event.text, event.contactName, event.accountLabel]
      .join(" ")
      .toLocaleLowerCase("pt-BR")
      .includes(needle)
    if (!matchesSearch) return false
    if (state.filter === "all") return true
    if (state.filter === "review") return item.decision?.outcome === "human_review" && !item.resolution
    if (state.filter === "sales") return item.analysis?.intent === "sales"
    if (state.filter === "comment") return event.kind === "comment"
    return event.channel === state.filter
  })
  if (!filtered.length) {
    list.append(emptyState("Nada por aqui com esse filtro."))
    return
  }
  for (const item of filtered) list.append(messageCard(item))
}

function targetOptions(event) {
  if (event.kind === "message") return [["direct_message", "Responder em mensagem"]]
  return [
    ["public_comment", "Responder publicamente"],
    ["private_comment_reply", "Responder no privado"],
  ]
}

function reviewCard(item) {
  const event = item.event
  const name = contactName(event)
  const textarea = element("textarea", {
    attributes: {
      placeholder: "Escreva uma resposta com contexto e no tom certo…",
      "aria-label": `Resposta para ${name}`,
    },
  })
  const select = element("select", { attributes: { "aria-label": "Destino da resposta" } })
  for (const [value, label] of targetOptions(event)) {
    select.append(element("option", { text: label, attributes: { value } }))
  }
  const approve = element("button", { className: "primary-button", text: "Aprovar e responder" })
  const reject = element("button", { className: "danger-button", text: "Encerrar" })
  approve.addEventListener("click", async () => {
    const text = textarea.value.trim()
    if (!text) {
      textarea.focus()
      return showToast("Escreva a resposta antes de aprovar.")
    }
    approve.disabled = true
    try {
      await api(`/v1/reviews/${encodeURIComponent(event.id)}/approve`, {
        method: "POST",
        body: JSON.stringify({ text, target: select.value }),
      })
      showToast("Resposta aprovada e registrada.")
      await refresh()
    } catch (error) {
      showToast(error.message === "unauthorized" ? "Chave inválida." : "Não foi possível responder.")
    } finally {
      approve.disabled = false
    }
  })
  reject.addEventListener("click", async () => {
    reject.disabled = true
    try {
      await api(`/v1/reviews/${encodeURIComponent(event.id)}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: "closed_by_operator" }),
      })
      showToast("Mensagem encerrada sem resposta.")
      await refresh()
    } catch {
      showToast("Não foi possível encerrar a mensagem.")
    } finally {
      reject.disabled = false
    }
  })
  return element("article", { className: "review-card" }, [
    element("div", { className: "review-head" }, [
      element("div", { className: "identity" }, [
        element("span", { className: "avatar", text: initials(name) }),
        element("div", {}, [
          element("strong", { text: name }),
          element("span", { text: `${event.accountLabel} · ${channelLabel(event)}` }),
        ]),
      ]),
      element("span", {
        className: "status-tag review",
        text: item.decision.reason === "sensitive_content" ? "Tema sensível" : "Sem automação",
      }),
    ]),
    element("p", { className: "message-text", text: event.text || "[sem texto]" }),
    textarea,
    element("div", { className: "review-actions" }, [select, reject, approve]),
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

function connectionCard(connection) {
  return element("article", { className: "connection-card" }, [
    element("div", { className: "connection-head" }, [
      element("h4", { text: connection.label }),
      element("span", {
        className: `connection-status ${connection.configured ? "ok" : "pending"}`,
        text: connection.configured ? "Configurado" : "Pendente",
      }),
    ]),
    element("p", {
      text: `${connection.channel === "instagram" ? "Instagram" : "WhatsApp"} · ${connection.accountId ?? "ID ainda não informado"}`,
    }),
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
  $("#delivery-mode").textContent = `modo: ${mode}`
  $("#delivery-mode").classList.toggle("live", mode === "live")
}

function switchView(view) {
  state.currentView = view
  const labels = {
    inbox: ["VISÃO GERAL", "Caixa de entrada"],
    reviews: ["DECISÃO HUMANA", "Precisa de você"],
    connections: ["CONFIGURAÇÃO", "Conexões"],
  }
  for (const name of Object.keys(labels)) $(`#${name}-view`).hidden = name !== view
  $("#summary-strip").hidden = view === "connections"
  $("#view-kicker").textContent = labels[view][0]
  $("#view-title").textContent = labels[view][1]
  $$(".nav-item").forEach((button) => button.classList.toggle("is-active", button.dataset.view === view))
}

async function refresh() {
  $("#sync-status").textContent = "Atualizando…"
  try {
    const [summary, inbox, reviews, integrations] = await Promise.all([
      api("/v1/summary"),
      api("/v1/inbox?limit=150"),
      api("/v1/reviews"),
      api("/v1/integrations"),
    ])
    state.summary = summary
    state.inbox = inbox
    state.reviews = reviews
    state.integrations = integrations
    renderSummary()
    renderInbox()
    renderReviews()
    renderConnections()
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
  state.filter = button.dataset.filter
  $$(".filter-button").forEach((candidate) => candidate.classList.toggle("is-active", candidate === button))
  renderInbox()
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
