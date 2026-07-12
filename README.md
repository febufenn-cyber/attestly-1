# Attestly

> Upload approved company evidence, import a security questionnaire, receive defensible draft answers with exact supporting sources, and review every uncertain or high-risk claim before export.

**Alternative to the product-shape pioneered by Delve (YC ~S23)** — rank #1 of 500 in the YC-500 Fable 5 Venture Blueprint (score 7.5/10).

## Why this exists

Security, sales engineering, privacy, and legal teams repeatedly reconstruct answers to vendor questionnaires from policies, architecture documents, operational evidence, and old responses. Attestly turns that scattered material into a scoped, versioned evidence base and drafts answers without hiding missing proof, stale sources, or contradictions.

Attestly is an evidence-grounded drafting and review system. It is not an auditor, certification provider, legal adviser, or autonomous source of company truth.

## Implementation status

### Phase 1 — Product constitution

The product, evidence, workflow, security, evaluation, and launch contracts are defined in [`docs/phase-1/`](./docs/phase-1/README.md).

### Phase 2 — Secure product foundation

The secure vertical slice is implemented in [`docs/phase-2/`](./docs/phase-2/README.md):

- React/Vite browser application with email magic-link authentication;
- workspace creation, switching, membership roles, and one-time invitations;
- Hono API on Cloudflare Workers with verified Supabase JWTs and application authorization;
- Supabase Postgres schema, migrations, RLS, private Storage policies, and secure RPCs;
- immutable, tenant-owned upload identities and signed direct uploads;
- Cloudflare Queue worker with leasing, idempotency, retry classification, size/type validation, and SHA-256 hashing;
- transactional job/outbox creation and scheduled outbox recovery;
- append-only audit events with metadata redaction;
- two-tenant pgTAP attack tests;
- CI and protected manual staging deployment.

Phase 2 is an engineering foundation, not approval to process real customer data. Malware scanning, production region and retention approval, subprocessor review, and external security validation remain required before beta.

## Repository map

```text
apps/
  web/        authentication, workspaces, invitations, uploads, lifecycle dashboard
  api/        Hono request boundary, authorization, signed uploads, jobs, audit
  worker/     queue consumer, object validation, hashing, retries, outbox recovery
packages/
  foundation/ shared schemas, permissions, job states, queue contracts, redaction
supabase/
  migrations/ tenant-safe schema, RLS, Storage policies, secure RPCs
  tests/      two-tenant negative isolation suite
docs/
  phase-1/    product constitution and system definition
  phase-2/    secure-foundation documentation and ADRs
```

## Local development

Prerequisites: Node.js 22+ and a Docker-compatible runtime.

```bash
cp .env.example .env
npm install
npm run supabase:start
npm run supabase:reset
npm run db:test
npm run dev:api
npm run dev:worker
npm run dev:web
```

Use the local credentials returned by `supabase status`. Service-role credentials belong only in `apps/api/.dev.vars` and `apps/worker/.dev.vars`; never expose them through a `VITE_` variable.

## Verification

```bash
npm run format:check
npm run typecheck
npm run test
npm run build
npm run db:test
```

## MVP scope

- [x] Secure multi-tenant workspaces, authentication, membership roles, immutable upload foundation, jobs, and audit trail
- [ ] Versioned evidence extraction, scoping, approval, and retrieval
- [ ] XLSX/CSV questionnaire import with compatibility and mapping review
- [ ] Compound-question decomposition and claim-level evidence retrieval
- [ ] Structured AI drafts with exact citations and explanatory answer states
- [ ] Human review, risk-based approvals, and approval invalidation after material edits
- [ ] Structure-preserving export from a frozen approved snapshot
- [ ] Full adversarial evaluation, retention/deletion operations, billing, and production hardening

The MVP does **not** autonomously submit questionnaire answers to external portals.

## Architecture direction

The foundation uses Cloudflare Workers + Hono and Supabase Auth, Postgres, RLS, private object storage, and later pgvector, deployed through Wrangler.

The agent core remains provider-neutral. Model selection is configuration; tenant isolation, evidence rules, answer states, validators, and approvals stay outside model prompts.

## Business hypothesis

| | |
|---|---|
| Monetization | Per-questionnaire initially; seat/usage subscription after repeat use is validated |
| First customer | B2B SaaS teams whose sales cycles are delayed by recurring security questionnaires |
| Initial ICP | Approximately 20–300 employees, enterprise buyers, existing evidence, limited GRC staffing |
| GTM wedge | Controlled first-questionnaire pilot with measurable reviewer time saved |
| Competition risk | High: active AI-compliance market |
| Primary trust risk | Unsupported, stale, wrong-scope, cross-tenant, or over-disclosed answers |
| India angle | Helps Indian vendors complete US and international buyer security reviews faster |

## Delivery phases

1. **Product constitution and system definition** — implemented.
2. **Secure product foundation** — implemented as a pre-beta vertical slice.
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
