# Approval and inventory implementation tracker

## Implemented on this branch

| Area | Correction | Verification |
| --- | --- | --- |
| Final approval and quota | A serializable transaction claims the step, validates eligible stock and the requester's explicitly linked organisation quota, commits a confirmed allocation and audit events, and updates request and quota counters. | Isolated PostgreSQL tests cover partial approval, quota shortage, competing approvals, and duplicate approval. |
| Issuance | Issue from confirmed stock without consuming available stock again. Keyed retries replay the original issuance. | PostgreSQL and route tests cover partial issuance, replay, and quantity guards. |
| Cancellation | Cancel an entirely unissued automatic allocation, with a reason, releasing stock and quota in the same transaction. | PostgreSQL tests cover release, duplicate cancellation, and refusal after issuance. |
| Stock and visibility | Report stored availability, distinguish allocated but unissued from cumulative commitments, and require a reason for quantity adjustments. | Type check and test suite. Browser verification is pending. |
| Schema | Add the two existing InventoryPool fields missing from the migration history. | Verified on fresh isolated PostgreSQL. |

## Policy choices and remaining work

- Explicitly linked quotas are match-specific. Complimentary allocations use the linked quota first and may draw from general complimentary stock within the entitlement. Pools linked to other quotas are excluded. Unlinked requesters use only unrestricted, single-purpose stock.
- Mixed-purpose pools need reliable consumed quantities by purpose before automatic or manual allocation can safely use them. Verify which legacy requests lack a ticket type or an organisation quota link before rollout. This branch defaults a missing ticket type to complimentary.
- Cancellation covers whole, unissued automatic allocations. Returns, reusable-versus-void verification, partial cancellation, acknowledgement and closure, and allocation or quota transfers need separate implementation and tests.
- Approval delegation, amendments beyond reapproval, scoped role policy and escalation scheduling need further work. Issuance requests sent by older clients without an idempotency key retain their existing behavior.
- The dashboard uses current pool counters. Existing pool discrepancies from earlier double deductions may remain visible. Historical drafts, balances and production records require a separately approved read-only review and any subsequent reconciliation requires explicit management approval.
- This branch does not finish the broader matching, search, import/export, notification and reporting enhancements in the master document. Production release and migration approval remain separate.

## Cross-module checks on the hotfix

| Module | Verified locally | Still needs isolated workflow verification |
| --- | --- | --- |
| Requests, approvals, allocations and distribution | Lifecycle route tests and validation. Full approval always uses requested quantities. | Browser retest of the updated dialog, quota shortage, and concurrent allocation against PostgreSQL. |
| Inventory and quota | Mixed-purpose writes require a balanced stock split. Committed or issued pools retain their purpose. Quota summaries use stored pool classification and totals across all matching quota pages. | Compare the same match and category in Inventory and Quota Management. Review legacy pool splits separately. |
| Reports, Revenue and Reconciliation | Mixed issuance counts once. Revenue filters by match ID. Reconciliation uses stored available stock. | Compare issued and available quantities end to end. The financial reports do not infer a value for issuance with unverified purpose. |
| District integration | Dry-run and sales use available, unrestricted purchase stock. Sales claim stock transactionally. Refunds that cannot be safely traced require reconciliation. | Validate the real provider payload, retries, and refund-to-sale mapping before relying on live integration. |

Role-based screens, match replication, imports and exports, notification delivery, and historical reconciliation still need a module-by-module browser and integration pass. Existing automated coverage helps detect regressions but does not establish production parity.
