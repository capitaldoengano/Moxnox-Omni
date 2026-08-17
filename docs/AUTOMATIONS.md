# Automation rules

Automations live in the JSON file selected by `AUTOMATIONS_FILE`. The default
example is `config/automations.example.json`.

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
