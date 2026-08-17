# Internal pilot runbook

This runbook opens one account at a time. The first recommended account is
Capital do Engano; Gu and WhatsApp remain protected until they complete the same
test sequence.

## T-60 minutes: keep dry-run

1. Start the current release and open **Operação** in the cockpit.
2. Confirm a public HTTPS URL, webhook signature secrets and Capital credentials.
3. Keep these values:

   ```dotenv
   NODE_ENV=production
   DELIVERY_MODE=dry-run
   LIVE_ACCOUNTS=
   ```

4. Send one Instagram comment and one direct message from a test contact.
5. Confirm that both appear under Capital do Engano with the correct text and
   planned response.
6. Test every enabled Capital automation in the simulator. Pause any ambiguous
   rule instead of editing it under pressure.

## T-15 minutes: release one account

Preserve a copy of the writable `data` directory, then edit only:

```dotenv
DELIVERY_MODE=live
LIVE_ACCOUNTS=capital-do-engano
```

Restart the service. In **Operação**, Capital must show **Envio real** while Gu
and WhatsApp show **Protegida**. If the panel says **Live pede atenção**, do not
continue until the blocker is understood.

## First 30 minutes

- Keep the cockpit open on **Prioridade**.
- Read the first automated replies immediately after delivery.
- Handle human requests, sensitive content and failed deliveries manually.
- Do not add new trigger phrases during the first live window.
- Record surprising messages as backlog; a strange phrase is evidence, not an
  invitation to teach the bot improvisation.

## Immediate rollback

If a reply is wrong, repeated, sent from the wrong profile or provider failures
begin to accumulate:

```dotenv
DELIVERY_MODE=dry-run
LIVE_ACCOUNTS=
```

Restart the service and confirm **modo: dry-run** in the sidebar. Webhooks keep
receiving messages, but no provider reply is sent. Pause the offending rule,
simulate the exact message and only schedule another live window after review.

## End of shift

Review pending human messages, failed deliveries, leads and unclassified
phrases. Back up the writable data directory and record which rules actually
generated useful conversations or sales intent.
