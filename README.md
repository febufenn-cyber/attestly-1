# Attestly

> Upload approved company evidence, import a security questionnaire, receive defensible draft answers with exact supporting sources, and review every uncertain or high-risk claim before export.

**Alternative to the product-shape pioneered by Delve (YC ~S23)** — rank #1 of 500 in the YC-500 Fable 5 Venture Blueprint (score 7.5/10).

## Why this exists

Security, sales engineering, privacy, and legal teams repeatedly reconstruct answers to vendor questionnaires from policies, architecture documents, operational evidence, and old responses. Attestly turns that scattered material into a scoped, versioned evidence base and drafts answers without hiding missing proof, stale sources, or contradictions.

Attestly is an evidence-grounded drafting and review system. It is not an auditor, certification provider, legal adviser, or autonomous source of company truth.

## Phase 1 specification

The original seed has been converted into a detailed product constitution and build specification:

- [Phase 1 index](./docs/phase-1/README.md)
- [Product requirements](./docs/phase-1/PRODUCT_REQUIREMENTS.md)
- [Product and AI constitution](./docs/phase-1/PRODUCT_CONSTITUTION.md)
- [Canonical domain model](./docs/phase-1/DOMAIN_MODEL.md)
- [Questionnaire import/export specification](./docs/phase-1/QUESTIONNAIRE_AND_EXPORT_SPEC.md)
- [Security, privacy, and threat model](./docs/phase-1/SECURITY_PRIVACY_THREAT_MODEL.md)
- [Roles, approvals, and audit controls](./docs/phase-1/ROLES_APPROVALS_AND_AUDIT.md)
- [Evaluation and launch gates](./docs/phase-1/EVALUATION_AND_LAUNCH_GATES.md)
- [MVP scope and exit criteria](./docs/phase-1/MVP_SCOPE_AND_EXIT_CRITERIA.md)
- [Architecture Decision Records](./docs/phase-1/ADRs/)

## MVP scope

- [ ] Secure multi-tenant workspaces, authentication, roles, and audit trail
- [ ] Versioned evidence upload, extraction, scoping, approval, and retrieval
- [ ] XLSX/CSV questionnaire import with compatibility and mapping review
- [ ] Compound-question decomposition and claim-level evidence retrieval
- [ ] Structured AI drafts with exact citations and explanatory answer states
- [ ] Human review, risk-based approvals, and approval invalidation after material edits
- [ ] Structure-preserving export from a frozen approved snapshot
- [ ] Evaluation harness, adversarial tests, retention, and deletion controls

The MVP does **not** autonomously submit questionnaire answers to external portals.

## Architecture direction

The proposed implementation direction remains Cloudflare Workers + Hono and Supabase (Postgres, Auth, RLS, object storage, and pgvector), deployed with Wrangler.

The agent core is provider-neutral. Claude or another approved model provider may be selected through configuration after evaluation; evidence rules, tenant isolation, answer states, validators, and approval requirements live outside model prompts.

**Planned integrations:** model provider; Google Drive; Stripe.

**Core data:** versioned evidence corpus, scoped claims, questionnaire snapshots, answer revisions, citations, approvals, and immutable audit events.

## Business hypothesis

| | |
|---|---|
| Monetization | Per-questionnaire initially; seat/usage subscription after repeat use is validated |
| First customer | B2B SaaS teams whose sales cycles are delayed by recurring security questionnaires |
| Initial ICP | Approximately 20–300 employees, enterprise buyers, existing evidence, limited GRC staffing |
| GTM wedge | Controlled first-questionnaire pilot with measurable reviewer time saved |
| Competition risk | High: active AI-compliance market |
| Primary trust risk | Unsupported, stale, wrong-scope, or over-disclosed answers |
| India angle | Helps Indian vendors complete US and international buyer security reviews faster |

## Delivery phases

1. **Product constitution and system definition** — implemented in `docs/phase-1/`.
2. **Secure project foundation** — schema, RLS, auth, storage, jobs, audit, CI/CD.
3. **Evidence ingestion and retrieval.**
4. **Questionnaire normalization and structure-preserving import/export.**
5. **Evidence-grounded answer engine.**
6. **Human review and approval product.**
7. **Security hardening, evaluation, billing, and production operations.**
8. **Design-partner beta, launch, and iteration.**

## Non-negotiable product rule

> Attestly must protect the boundary between what sounds correct and what this specific company can prove is correct for the requested product, environment, region, and time.

---

*Built from a Fable 5 (Claude Code) venture blueprint inspired by the AI-native compliance automation category.*
