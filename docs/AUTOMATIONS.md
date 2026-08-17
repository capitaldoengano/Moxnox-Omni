# Automation rules

The JSON file selected by `AUTOMATIONS_FILE` is the seed for a new installation.
On first start, its validated rules are copied to `DATA_DIR/automations.json`.
From then on, the cockpit and API edit that writable copy atomically, so changes
survive restarts and also work with the read-only application filesystem used by
the Docker setup.

Open **Automações** in `/cockpit` to create, edit, pause and test rules. The
simulator evaluates the same matching policy as an inbound event but never calls
a channel provider. Changes become available to the processing pipeline without
restarting the service.

Each rule can select:

- `accounts`: internal account keys such as `capital-do-engano`, `gu` or
  `whatsapp`;
- `channels`: provider-neutral channels such as `instagram` and `whatsapp`;
- `kinds`: `comment` or `message`;
- `match.mode`: `containsAny` or `containsAll`;
- `match.terms`: case- and accent-insensitive phrases;
- `action.publicReply`: public reply to a comment;
- `action.privateReply`: private reply started from a comment;
- `action.messageReply`: reply to an inbound direct message.

Example:

```json
{
  "id": "capital-product-interest",
  "enabled": true,
  "accounts": ["capital-do-engano"],
  "channels": ["instagram"],
  "kinds": ["comment", "message"],
  "match": {
    "mode": "containsAny",
    "terms": ["qual o valor", "tem vaga"]
  },
  "action": {
    "publicReply": "Te chamei no privado pra te passar certinho.",
    "privateReply": "Texto enviado no privado.",
    "messageReply": "Texto enviado no direct."
  }
}
```

Rules are evaluated in file order and the first match wins. Sensitive content
is intercepted before automation matching. Empty, unrelated or unmatched
content stays in human review.

## Initial Desejo que Pensa policy

The bundled rules answer only explicit commercial interest in Desejo que Pensa:
price, vacancies, registration, format and requests for more information. The
current offer is recorded as four online one-hour meetings for R$ 60, linking to
`https://capitaldoengano.github.io/desejoquepensa/`.

Payment problems, refunds, complaints, sensitive topics and unrelated
conversations are not answered automatically. Keep `DELIVERY_MODE=dry-run`
while reviewing copy or changing terms.

## Validation guardrails

- Every rule must target at least one known account, its matching channel and at
  least one event kind.
- A message rule requires `messageReply`; a comment rule requires a public or
  private comment reply.
- IDs are stable lowercase slugs and cannot be renamed from the editor.
- A rule can be paused without deleting its audit-friendly configuration.
- Trigger phrases and reply sizes are bounded before persistence.

The bundled JSON remains a clean installation seed. To intentionally reset a
running instance to it, stop the service, preserve a backup and remove only
`DATA_DIR/automations.json` before restarting.
