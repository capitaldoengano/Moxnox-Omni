const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")

const includesAny = (text, terms) => {
  const normalized = normalize(text)
  return terms.some((term) => normalized.includes(normalize(term)))
}

const SALES_TERMS = [
  "valor",
  "preço",
  "quanto custa",
  "inscrição",
  "inscrever",
  "quero participar",
  "quero entrar",
  "tem vaga",
  "vagas",
  "desejo que pensa",
  "lab",
  "curso",
]

const SUPPORT_TERMS = [
  "pagamento",
  "paguei",
  "não consegui",
  "nao consegui",
  "erro",
  "problema",
  "reembolso",
  "estorno",
]

export function analyzeMessage(event, decision = null) {
  if (decision?.reason === "sensitive_content") {
    return { intent: "sensitive", label: "Tema sensível", priority: "high" }
  }
  if (includesAny(event.text, SALES_TERMS)) {
    return { intent: "sales", label: "Possível venda", priority: "high" }
  }
  if (includesAny(event.text, SUPPORT_TERMS)) {
    return { intent: "support", label: "Suporte", priority: "high" }
  }
  if (event.kind === "comment") {
    return { intent: "engagement", label: "Engajamento", priority: "normal" }
  }
  return { intent: "conversation", label: "Conversa", priority: "normal" }
}
