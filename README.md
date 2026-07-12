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

The secure workspace, authentication, tenant isolation, immutable uploads, queues, jobs, audit trail, CI, and staging foundations are implemented in [`docs/phase-2/`](./docs/phase-2/README.md).

### Phase 3 — Evidence ingestion and retrieval

The evidence-admission vertical slice is implemented in [`docs/phase-3/`](./docs/phase-3/README.md):

- logical evidence documents and immutable versions;
- evidence class, confidentiality, external disclosure policy, scope, effective dates, and review dates;
- dedicated credential-free extraction service;
- PDF, DOCX, XLSX, CSV, and TXT adapters;
- canonical document nodes and exact citable spans;
- extraction quality and warning gates;
- malware-scan approval requirement;
- knowledge-owner evidence approval;
- Postgres lexical retrieval with scope and disclosure eligibility before ranking;
- optional provider-neutral pgvector records;
- explicit contradiction relations;
- reviewer-facing evidence console;
- Phase 3 tenant, scope, approval, and retrieval tests.

Phase 3 does not yet generate questionnaire answers. It establishes which exact source material may later support them.

## Repository map

```text
apps/
  web/               Phase 2 workspace and secure upload application
  api/               Phase 2 workspace API
  worker/            Phase 2 object-validation worker
  evidence-console/  evidence admission, review, spans, and search laboratory
  evidence-api/      evidence lifecycle, approval, and retrieval API
  ingestion/         extraction queue orchestrator
  extractor/         isolated Node parser service
packages/
  foundation/        shared identity, authorization, jobs, and audit contracts
  evidence/          canonical extraction, scope, span, and ranking contracts
supabase/
  migrations/        tenant-safe platform and evidence domain
  tests/             multi-tenant attack and evidence-retrieval suites
docs/
  phase-1/           product constitution
  phase-2/           secure foundation
  phase-3/           evidence intelligence
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

npm run dev:extractor
npm run dev:ingestion
npm run dev:evidence-api
npm run dev:evidence-console
```

Use local credentials returned by `supabase status`. Service-role and extractor internal credentials must never use a `VITE_` prefix.

## Verification

```bash
npm run format:check
npm run typecheck
npm run test
npm run build
npm run db:test
npm audit --omit=dev --audit-level=high
```

## MVP scope

- [x] Secure multi-tenant workspaces, authentication, roles, immutable uploads, jobs, and audit trail
- [x] Versioned evidence extraction, exact provenance, scope, approval, and lexical retrieval
- [ ] XLSX/CSV questionnaire import with compatibility and mapping review
- [ ] Compound-question decomposition and claim-level evidence retrieval
- [ ] Structured AI drafts with exact citations and explanatory answer states
- [ ] Human review, risk-based approvals, and approval invalidation after material edits
- [ ] Structure-preserving export from a frozen approved snapshot
- [ ] Full adversarial evaluation, retention/deletion operations, billing, and production hardening

The MVP does **not** autonomously submit questionnaire answers to external portals.

## Architecture direction

The platform uses Cloudflare Workers + Hono and Supabase Auth, Postgres, RLS, private object storage, full-text retrieval, and optional pgvector. Heavy document parsing runs in a separate Node service without database credentials.

The future answer engine remains provider-neutral. Tenant isolation, evidence eligibility, scope, answer states, validators, and approvals remain outside model prompts.

## Delivery phases

1. **Product constitution and system definition** — implemented.
2. **Secure product foundation** — implemented.
3. **Evidence ingestion, provenance, approval, and retrieval** — implemented as a pre-beta vertical slice.
4. **Questionnaire normalization and structure-preserving import/export.**
5. **Evidence-grounded answer engine.**
6. **Human review and approval product.**
7. **Security hardening, evaluation, billing, and production operations.**
8. **Design-partner beta, launch, and iteration.**

## Non-negotiable product rule

> Attestly must protect the boundary between what sounds correct and what this specific company can prove is correct for the requested product, environment, region, and time.

---

*Built from a Fable 5 (Claude Code) venture blueprint inspired by the AI-native compliance automation category.*
