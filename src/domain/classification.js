export const CLASSIFICATION_CATEGORIES = Object.freeze([
  "unclassified",
  "potential_lead",
  "qualified_lead",
  "follow_up",
  "customer",
  "support",
  "resolved",
  "discarded",
  "sensitive",
])

const categorySet = new Set(CLASSIFICATION_CATEGORIES)

const badRequest = (message) => {
  const error = new Error(message)
  error.statusCode = 400
  return error
}

export function validateClassification(input) {
  const category = String(input?.category ?? "")
  const note = String(input?.note ?? "").trim()
  if (!categorySet.has(category)) throw badRequest("invalid_classification_category")
  if (note.length > 1_000) throw badRequest("classification_note_too_long")
  return { category, note }
}

export function inferClassification(analysis) {
  const category =
    {
      sales: "potential_lead",
      support: "support",
      sensitive: "sensitive",
    }[analysis?.intent] ?? "unclassified"
  return { category, note: "", source: "automatic", classifiedAt: null }
}

export function effectiveClassification(item, analysis) {
  if (item.classification) {
    return {
      ...item.classification,
      source: "manual",
    }
  }
  if (item.resolution?.outcome === "rejected") {
    return { category: "resolved", note: "", source: "automatic", classifiedAt: null }
  }
  if (item.resolution?.outcome === "approved") {
    return { category: "follow_up", note: "", source: "automatic", classifiedAt: null }
  }
  return inferClassification(analysis)
}
