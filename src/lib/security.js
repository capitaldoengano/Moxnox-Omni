import { createHmac, timingSafeEqual } from "node:crypto"

export function safeEqual(left, right) {
  const a = Buffer.from(String(left ?? ""))
  const b = Buffer.from(String(right ?? ""))
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b)
}

export function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader?.startsWith("sha256=") || !appSecret) {
    return false
  }
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`
  return safeEqual(expected, signatureHeader)
}
