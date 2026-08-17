# Security policy

## Supported versions

Only the latest release on the default branch receives security fixes during
the pre-1.0 phase.

## Reporting a vulnerability

Use GitHub's private security-advisory feature for this repository. Do not open
a public issue containing credentials, personal messages, exploit steps or raw
webhook payloads.

Include the affected version, impact, safe reproduction steps and any suggested
mitigation. Maintainers should acknowledge a complete report within five
business days and coordinate disclosure after a fix is available.

## Secrets

Never commit `.env` files, Meta tokens, app secrets or real conversation data.
If a credential is exposed, revoke and replace it at the provider before
rewriting repository history.

