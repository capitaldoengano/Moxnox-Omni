# Moxnox Omni

Moxnox Omni is an independent omnichannel automation core for receiving and
answering comments and messages. The first vertical slice supports Instagram,
Messenger, WhatsApp and webchat events, with human review as the safe default.

The project starts in `dry-run` mode: it verifies and normalizes webhooks,
deduplicates events, evaluates deterministic rules and records proposed
responses without contacting a provider. Live delivery must be enabled
explicitly after credentials and Meta permissions are validated.

## What works in v0.1

- Meta webhook verification and HMAC-SHA256 signature validation.
- Instagram comments and DMs, Facebook Page comments and DMs, and WhatsApp text.
- A small webchat ingestion API.
- Event deduplication and append-only local audit trail.
- Deterministic keyword automations.
- Automatic escalation of sensitive, empty or unmatched content.
- Human approval and rejection endpoints.
- Provider dispatch adapters guarded by `DELIVERY_MODE`.
- Dependency-free Node.js runtime, tests, Docker image and CI.

## Quick start

Requirements: Node.js 24 or Docker 24+.

```bash
cp .env.example .env
npm test
npm start
```

Open `http://localhost:3333/healthz`. For Docker:

```bash
docker compose up --build
```

Do not set `DELIVERY_MODE=live` until the correct provider credentials,
permissions and webhook subscriptions have been tested in a non-production
Meta app.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/healthz` | Liveness check |
| `GET` | `/webhooks/meta` | Meta subscription verification |
| `POST` | `/webhooks/meta` | Signed Meta events |
| `POST` | `/v1/webchat/messages` | Webchat ingestion (`x-site-token`) |
| `GET` | `/v1/reviews` | Pending human reviews (`x-admin-api-key`) |
| `POST` | `/v1/reviews/:id/approve` | Approve and deliver a reply |
| `POST` | `/v1/reviews/:id/reject` | Close without replying |
| `GET` | `/v1/conversations/:id` | Audited conversation records |

## Commercial use

The source code is licensed under Apache License 2.0. You may run it as a paid
SaaS, sell hosting, support, integrations and implementation services, and
combine it with separately licensed modules that you own. Apache-2.0 does not
grant rights to the Moxnox Omni or Capital do Engano names, logos or visual
identity.

Published Apache-2.0 versions remain available to everyone under that license,
including potential competitors. See [Commercial model](docs/COMMERCIAL_MODEL.md)
and [Trademarks](TRADEMARKS.md). This documentation is operational guidance,
not legal advice.

## Project documents

- [Architecture](docs/ARCHITECTURE.md)
- [Implementation provenance](docs/PROVENANCE.md)
- [Commercial model](docs/COMMERCIAL_MODEL.md)
- [Data protection baseline](docs/DATA_PROTECTION.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

