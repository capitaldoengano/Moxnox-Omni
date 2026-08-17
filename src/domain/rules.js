const DEFAULT_REVIEW_TERMS = [
  "suicídio",
  "suicidio",
  "me matar",
  "violência",
  "violencia",
  "abuso",
  "menor de idade",
  "ameaça",
  "ameaca",
  "estorno",
  "denúncia",
  "denuncia",
]

const DEFAULT_HANDOFF_TERMS = [
  "falar com uma pessoa",
  "falar com alguém",
  "falar com alguem",
  "falar com humano",
  "atendimento humano",
  "quero um atendente",
  "chama o gu",
  "falar com o gu",
]

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")

const includesAny = (text, terms) => {
  const normalized = normalize(text)
  return terms.some((term) => normalized.includes(normalize(term)))
}

function matchesRule(rule, event) {
  if (!rule?.enabled) return false
  if (
    Array.isArray(rule.accounts) &&
    rule.accounts.length > 0 &&
    !rule.accounts.includes(event.accountKey)
  ) {
    return false
  }
  if (!rule.channels?.includes(event.channel)) return false
  if (!rule.kinds?.includes(event.kind)) return false
  const terms = Array.isArray(rule.match?.terms) ? rule.match.terms : []
  if (rule.match?.mode === "containsAll") {
    return terms.length > 0 && terms.every((term) => includesAny(event.text, [term]))
  }
  return terms.length > 0 && includesAny(event.text, terms)
}

export function decideEvent(
  event,
  rules,
  reviewTerms = DEFAULT_REVIEW_TERMS,
  handoffTerms = DEFAULT_HANDOFF_TERMS,
) {
  if (!event.text?.trim()) {
    return { outcome: "human_review", reason: "non_text_or_empty" }
  }
  if (includesAny(event.text, reviewTerms)) {
    return { outcome: "human_review", reason: "sensitive_content" }
  }
  if (includesAny(event.text, handoffTerms)) {
    return { outcome: "human_review", reason: "human_requested" }
  }
  const matched = rules.find((rule) => matchesRule(rule, event))
  if (!matched) {
    return { outcome: "human_review", reason: "no_matching_automation" }
  }
  return {
    outcome: "automated",
    reason: "rule_match",
    ruleId: matched.id,
    action: matched.action ?? {},
  }
}
