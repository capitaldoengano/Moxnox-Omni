# Architecture

Moxnox Omni currently uses one small process to prove the complete event path
without hiding behavior behind infrastructure. The same process serves a small
internal cockpit. Interfaces are separated so the storage and queue can be
replaced without changing channel or policy code.

```mermaid
flowchart TD
  A[Official channel webhook] --> B[Authentication and normalization]
  B --> C[Deduplication and audit store]
  C --> D[Rules and safety policy]
  D --> E{Decision}
  E -->|Automated| F[Provider dispatcher]
  E -->|Sensitive or unmatched| G[Human review]
  G --> F
```

## Boundaries

- `src/domain`: provider-neutral events, policy decisions and response pipeline.
- `src/channels`: outbound provider protocol adapters.
- `src/cockpit`: dependency-free internal operator interface.
- `src/infra`: replaceable persistence and work queue.
- `src/lib`: small security and HTTP primitives.
- `src/app.js`: transport routes and authentication.

## Scale path

The append-only JSONL store and in-process queue are intentional v0.1 adapters.
Before multi-instance production, replace them with PostgreSQL and a durable
queue, add per-tenant encryption keys, rate limits, migrations, backups and
delivery reconciliation. The domain API should stay stable while those adapters
change.
