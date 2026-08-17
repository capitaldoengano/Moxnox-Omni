# Meta setup for the internal cockpit

The repository never contains production credentials. Configure them only in
the deployment environment or in an untracked local `.env` file.

The default is Graph API `v26.0`. Pinning the version makes provider behavior
explicit; review the official changelog before changing it.

## Values required by Moxnox Omni

| Environment variable | Where it comes from | Secret |
|---|---|---|
| `META_APP_ID` | Meta app dashboard | No |
| `META_APP_SECRET` | Meta app settings | Yes |
| `META_VERIFY_TOKEN` | A long random value created by us | Yes |
| `CAPITAL_INSTAGRAM_ACCOUNT_ID` | Instagram professional account ID | No |
| `CAPITAL_INSTAGRAM_ACCESS_TOKEN` | Token authorized for the Capital account | Yes |
| `GU_INSTAGRAM_ACCOUNT_ID` | Instagram professional account ID | No |
| `GU_INSTAGRAM_ACCESS_TOKEN` | Token authorized for `@ogustavosouzapauli` | Yes |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp Business Account (WABA) ID | No |
| `WHATSAPP_PHONE_NUMBER_ID` | Cloud API phone number ID | No |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp Cloud API access token | Yes |
| `PUBLIC_BASE_URL` | Public HTTPS origin of this service | No |

Use a long-lived production token managed by the appropriate Meta business
account. Temporary dashboard tokens are useful only for initial tests.

## Recommended order

1. Create or select the Meta business app that will own the integrations.
2. Add Instagram and WhatsApp products in the Meta app dashboard.
3. Authorize both Instagram professional accounts and obtain each account ID and
   token separately.
4. Add the WhatsApp Business Account and obtain the WABA ID, phone number ID and
   Cloud API token.
5. Deploy Moxnox Omni with HTTPS and define `PUBLIC_BASE_URL`.
6. Register `${PUBLIC_BASE_URL}/webhooks/meta` as the callback URL. Use the exact
   same value as `META_VERIFY_TOKEN` during verification.
7. Subscribe only to the Instagram comment/message and WhatsApp message webhook
   fields needed by this application.
8. Keep `DELIVERY_MODE=dry-run`, send test events and inspect `/cockpit`.
9. Request the permissions and Advanced Access required by Meta before handling
   accounts that are not owned by app administrators or testers.
10. Enable `DELIVERY_MODE=live` only after inbound and outbound tests succeed.

The exact product names, permissions and review screens can change. Confirm the
current requirements in the official documentation:

- [Meta app basic settings](https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/basic-settings)
- [Instagram webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks)
- [Instagram API with Instagram Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login)
- [Instagram business login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login)
- [WhatsApp Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)
- [Graph API changelog](https://developers.facebook.com/docs/graph-api/changelog/)

For this Instagram Login implementation, request
`instagram_business_basic`, `instagram_business_manage_messages` and
`instagram_business_manage_comments`. WhatsApp sending requires
`whatsapp_business_messaging`; production administration may also require
`whatsapp_business_management`.

## Security rules

- Never paste access tokens in GitHub issues, pull requests, screenshots or chat.
- Never put real values in `.env.example`.
- Rotate a token immediately if it appears in logs or source control.
- The cockpit returns only `configured` or `pending` plus masked account IDs.
- The admin key lives in browser session storage, not permanent local storage.
