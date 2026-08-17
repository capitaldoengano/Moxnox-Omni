# Data protection baseline

Comments and direct messages can contain personal and sensitive information.
The initial operating posture is therefore data minimization plus human review.

Before production:

- Document purposes, legal bases, retention periods and processors.
- Publish a privacy notice and a contact route for data-subject requests.
- Encrypt stored data and backups; rotate provider and administration secrets.
- Keep provider payloads only when required for audit or troubleshooting.
- Add role-based access, tenant isolation and immutable operator audit records.
- Define deletion, export, incident response and backup-restoration procedures.
- Test that crisis, violence, minors, payment disputes and clinical requests do
  not receive autonomous responses.
- Complete a privacy impact assessment when the operation can create high risk.

The v0.1 JSONL adapter is suitable for local validation only. Multi-customer
production requires a tenant-aware encrypted database and a documented
retention job.

