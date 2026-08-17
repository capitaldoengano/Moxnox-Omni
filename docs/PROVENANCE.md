# Implementation provenance

## Status

Moxnox Omni is an independent implementation written for the
`capitaldoengano/Moxnox-Omni` repository. No source code, database schema,
tests, assets, documentation or internal naming was copied from ChatbotX or the
attached Selenium-based Instagram bot.

The implementer had previously inspected those public projects to assess
feasibility. For that reason, this project does **not** make the stronger legal
claim of a formal clean-room process. Independence is established through new
code, a different minimal architecture and recorded implementation sources.

## Initial sources of functional requirements

- The project owner's request for one inbox and automated responses across
  Instagram comments/messages, WhatsApp and webchat.
- Meta developer documentation for webhook verification, Instagram comment
  moderation/private replies, Messenger and WhatsApp Cloud API requests.
- Node.js public documentation for HTTP, cryptography, files and tests.
- Apache Software Foundation's canonical Apache License 2.0 text.

## Third-party code

The v0.1 runtime has no third-party package dependencies. Base container images
and GitHub Actions are listed in `THIRD_PARTY_NOTICES.md`.

Every pull request that adds a dependency or adapts an external protocol must
update this document or the third-party notices.

