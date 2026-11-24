# ACA TicketOps — Project summary

ACA TicketOps is an internal ticket-operations platform for the Andhra Cricket Association. It
replaces fragmented spreadsheets, chat threads, and paper records with one auditable system that
carries a ticket request from intake to reconciliation.

For setup, architecture, and commands see `README.md`. For current production status see
`PRODUCTION_READINESS.md`. For the task checklist see `ISSUES.md`.

## What the application does

- **Matches & venues** — create/edit matches, manage venues and stadium capacity, and delete
  matches only when no operational records exist.
- **Requests** — multi-line requests per ticket category, sourced from in-person, email, WhatsApp,
  letter, phone, online form, or internal entry.
- **Approvals** — configurable multi-step workflows with full/partial approval, rejection, and
  return for clarification, strictly sequential and transaction-safe.
- **Inventory & quotas** — pools by category/stand/block, hierarchical quotas with transfers, and
  quantity adjustment with audit.
- **Allocation & distribution** — reserve approved stock, confirm, then issue tickets to
  recipients with custody and quantity tracking.
- **Reporting** — live aggregates with match filters, CSV/Excel export, and clean printouts.
- **Administration** — users, roles, permissions, and supported system settings, all persisted.
- **Audit** — every material change writes an audit event in the same transaction.

## Technology

Next.js 15 App Router · React 18 · TypeScript · Tailwind CSS · Prisma · PostgreSQL 16 ·
jose + bcrypt authentication · Zod 4 validation · ExcelJS 4.4 · Jest · Docker.

## Scope boundaries (current release)

- MFA enrollment and verification are not implemented; MFA-enabled accounts are refused.
- SMTP, SMS, WhatsApp delivery, and MinIO/S3 storage are not connected.
- An initial create-only Prisma migration exists (`20261124062341_init`). It applies cleanly to
  new databases. Upgrading an existing populated database requires baselining
  (`prisma migrate resolve --applied …`) or a hand-written transition migration, plus a human
  SQL review before `prisma migrate deploy`.
- Login rate limiting is process-local and needs a shared store for multi-replica deployments.

## Roles

Seeded roles: Super Administrator, Match Administrator, Request Desk Operator, Department
Coordinator, Approval Authority, Quota Controller, Ticket Allocation Officer, Distribution
Officer, Senior Management, and Auditor. Global roles are re-evaluated on every request.
