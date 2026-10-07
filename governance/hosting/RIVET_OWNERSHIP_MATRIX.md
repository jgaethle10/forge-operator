# RIVET Hosting Ownership and Governance Matrix

Status: **PLANNING ONLY - NOT AUTHORIZATION**

The purpose of this matrix is to make control visible before a hosting decision. No migration should proceed with an `UNKNOWN` production owner in any critical row.

| Asset / authority | Recommended legal/business owner | Recommended operator | Required access model | Migration rule |
|---|---|---|---|---|
| RIVET brand and brand assets | RIVET partners | Named partner-approved maintainers | Partner-controlled source of truth | Never altered by hosting migration |
| RIVET source code | As agreed by RIVET partners | Approved engineering operators | Repo permissions plus protected branches | Hosting move does not transfer IP |
| Domain registration | RIVET or partner-controlled entity | Named admin(s) | At least two recovery-capable admins | Do not transfer registrar merely to change hosting |
| DNS zone | RIVET or jointly controlled account | Approved operator | Partner-visible admin + emergency access | TTL and rollback target recorded before cutover |
| TLS | Follows DNS/hosting architecture | Hosting operator | Automated renewal with alerting | Certificate state verified externally before cutover |
| Hosting account | Depends on A/B/C | A: Evercraft; B: RIVET; C: split | Billing owner plus technical admins | Account owner must be explicit |
| Production credentials | RIVET-approved custody | Least-privilege operators | Secret manager, rotation, break-glass procedure | Never embedded in repo, artifacts, or receipts |
| Production database | RIVET/customer-data owner as contractually agreed | Hosting/data operator | Role-based access, encrypted backups | Data ownership does not change with server operator |
| Backups | Same data owner as source data | Independent backup operator/path preferred | Restore-capable authorized admins | At least one copy outside primary failure domain |
| Customer data | RIVET / contractual controller | Approved processors | Data minimization + auditable access | Processor list documented before migration |
| Analytics | RIVET unless separately licensed | Approved analytics operator | Scoped access | Migration cannot silently expand collection |
| EV/session datasets | Defined per source/license | AliEV/Evercraft only where authorized | Source-specific access controls | Dataset rights are not implied by hosting |
| AliEV intelligence | Evercraft unless separate agreement says otherwise | Evercraft | Authenticated versioned interface | May evolve independently only when RIVET output contract is unaffected |
| RIVET report schema/format | RIVET partners | Approved product engineering | Protected baseline | Frozen during hosting migration |
| Billing/customer charging | RIVET commercial governance | Agreed payment operator | Verified settlement and entitlement controls | Hosting migration does not alter prices or checkout |
| Monitoring | Hosting operator | Hosting operator + partner visibility | Read access for stakeholders | Must exist before cutover |
| Incident response | Jointly defined | Primary hosting operator | Named escalation path | RTO/RPO and authority documented |
| Deployment authority | Partner-approved | Hosting operator | Protected environment + approval gates | Production deploy cannot bypass fidelity gate |
| Rollback authority | Partner-approved emergency operators | Hosting operator | Break-glass permission | Must not require a new code change |

## Option-specific control model

### A: Evercraft-operated

RIVET retains product and brand authority. Evercraft receives delegated infrastructure authority. Partners should retain visibility into DNS, uptime, backups, deployment receipts, and emergency recovery. The agreement should explicitly state that hosting operation does not transfer ownership of RIVET IP, customer relationships, or brand.

### B: Separate provider

RIVET or a partner-controlled entity owns the provider account and billing. Evercraft can receive deploy/operator permissions without being the account owner. This is the cleanest model if the partners want infrastructure independence.

### C: Hybrid

RIVET controls public hosting, DNS, customer-facing runtime, and presentation. Evercraft controls AliEV and approved intelligence infrastructure. The boundary is a versioned authenticated API with explicit schemas, rate limits, provenance, and failure behavior. RIVET must remain operable enough to show a controlled degraded state if AliEV is unavailable.

## Decisions the partners must make

- Hosting option A, B, or C.
- Domain registrar owner and DNS administrator(s).
- Provider account owner if B or C is selected.
- Production credential custodians.
- Customer-data controller/processor language.
- Backup retention and restore authority.
- RTO and RPO targets.
- Which failures justify rollback.
- Who can authorize a RIVET product change separately from a hosting change.
