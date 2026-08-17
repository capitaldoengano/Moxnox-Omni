# Repository guidance

Moxnox Omni is an independent implementation. Do not copy code, schemas,
assets, tests, text or internal naming from ChatbotX, insta-bot, ManyChat or any
other chatbot product.

Use public provider documentation and this repository's own contracts as the
source of truth. Record any new external implementation reference in
`docs/PROVENANCE.md` before merging the related code.

Safety invariants:

1. Provider webhooks must be authenticated before parsing or enqueueing.
2. Delivery defaults to `dry-run`; production sends require explicit opt-in.
3. Unmatched or sensitive messages go to human review.
4. Never log access tokens, app secrets, message bodies or raw webhook payloads.
5. Deduplicate provider events before any outbound action.
6. A failed send must be recorded as failed, never reported as delivered.
7. Add tests for every new event shape and outbound adapter.
8. Keep the Apache license, NOTICE and provenance records current.

Run `npm run check` before publishing changes.

