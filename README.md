# Moxnox Omni

Moxnox Omni is an independent omnichannel automation core for receiving and
answering comments and messages. The first vertical slice supports Instagram,
Messenger, WhatsApp and webchat events, with human review as the safe default.

The project starts in `dry-run` mode: it verifies and normalizes webhooks,
deduplicates events, evaluates deterministic rules and records proposed
responses without contacting a provider. Live delivery must be enabled
explicitly after credentials and Meta permissions are validated.

## What works in v0.4

- Meta webhook verification and HMAC-SHA256 signature validation.
- Instagram comments and DMs, Facebook Page comments and DMs, and WhatsApp text.
- A small webchat ingestion API.
- Event deduplication and append-only local audit trail.
- Deterministic keyword automations.
- Automatic escalation of sensitive, empty or unmatched content.
- Human approval and rejection endpoints.
- Provider dispatch adapters guarded by `DELIVERY_MODE`.
- Internal responsive cockpit at `/cockpit`.
- Unified inbox, message analysis, human review and integration status.
- Separate Instagram credentials for Capital do Engano and `@ogustavosouzapauli`.
- Account-specific automations for Capital do Engano, the Gu profile and WhatsApp.
- Initial Desejo que Pensa sales replies with human review for unrelated content.
- Cockpit editor for account-aware rules, activation and safe response simulation.
- Persistent automation overrides in the writable data volume.
- Backlog catalog with automatic suggestions and auditable manual classification.
- Dedicated views and counters for unclassified messages and potential leads.
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

Open `http://localhost:3333/cockpit` and enter the value configured in
`ADMIN_API_KEY`. The key is kept in browser session storage and disappears when
the tab is closed.

Do not set `DELIVERY_MODE=live` until the correct provider credentials,
permissions and webhook subscriptions have been tested in a non-production
Meta app.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/healthz` | Liveness check |
| `GET` | `/cockpit` | Internal operator interface |
| `GET` | `/webhooks/meta` | Meta subscription verification |
| `POST` | `/webhooks/meta` | Signed Meta events |
| `POST` | `/v1/webchat/messages` | Webchat ingestion (`x-site-token`) |
| `GET` | `/v1/reviews` | Pending human reviews (`x-admin-api-key`) |
| `GET` | `/v1/inbox` | Recent inbound activity and decisions |
| `GET` | `/v1/backlog` | Open catalog; supports `category` or `scope=all` |
| `GET` | `/v1/summary` | Operational counters |
| `GET` | `/v1/automations` | Current persistent automation rules |
| `PUT` | `/v1/automations/:id` | Create or replace a validated rule |
| `POST` | `/v1/automations/test` | Simulate matching without sending anything |
| `GET` | `/v1/integrations` | Credential status without revealing secrets |
| `POST` | `/v1/inbox/:id/classification` | Append a backlog classification and note |
| `POST` | `/v1/reviews/:id/approve` | Approve and deliver a reply |
| `POST` | `/v1/reviews/:id/reject` | Close without replying |
| `GET` | `/v1/conversations/:id` | Audited conversation records |

All `/v1` operational routes require `x-admin-api-key`, except webchat
ingestion, which uses its own site token. The cockpit never returns provider
access tokens or application secrets.

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
- [Meta setup](docs/META_SETUP.md)
- [Automation rules](docs/AUTOMATIONS.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
