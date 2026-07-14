# Attestly

> Upload approved company evidence, import a security questionnaire, receive defensible draft answers with exact supporting sources, and review every uncertain or high-risk claim before export.

**Alternative to the product-shape pioneered by Delve (YC ~S23)** — rank #1 of 500 in the YC-500 Fable 5 Venture Blueprint (score 7.5/10).

## Why this exists

Security, sales engineering, privacy, and legal teams repeatedly reconstruct answers to vendor questionnaires from policies, architecture documents, operational evidence, and old responses. Attestly turns that scattered material into a scoped, versioned evidence base and a reversible questionnaire workflow without hiding missing proof, stale sources, contradictions, conditional fields, or export risks.

Attestly is an evidence-grounded drafting and review system. It is not an auditor, certification provider, legal adviser, or autonomous source of company truth.

## Implementation status

### Phase 1 — Product constitution

The product, evidence, workflow, security, evaluation, and launch contracts are defined in [`docs/phase-1/`](./docs/phase-1/README.md).

### Phase 2 — Secure product foundation

Secure workspaces, authentication, tenant isolation, immutable uploads, queues, jobs, audit, CI, and staging foundations are implemented in [`docs/phase-2/`](./docs/phase-2/README.md).

### Phase 3 — Evidence ingestion and retrieval

Implemented in [`docs/phase-3/`](./docs/phase-3/README.md):

- logical evidence documents and immutable versions;
- evidence class, confidentiality, disclosure, scope, effective dates, and review dates;
- credential-free PDF, DOCX, XLSX, CSV, and TXT extraction;
- canonical nodes and exact citable spans;
- malware, quality, review, and approval gates;
- tenant-, scope-, date-, and disclosure-filtered retrieval;
- explicit contradiction relations and an evidence console.

### Phase 4 — Questionnaire intelligence and reversible export

Implemented in [`docs/phase-4/`](./docs/phase-4/README.md):

- immutable artifacts, import runs, mapping versions, and frozen snapshots;
- credential-free XLSX, CSV, and DOCX inspection;
- compatibility reports and structural warnings;
- exact question and answer-destination coordinates;
- instructions, polarity, compound claims, and tri-state conditions;
- deterministic export plans and package-level structural validation.

### Phase 5 — Evidence-grounded answer engine

Implemented in [`docs/phase-5/`](./docs/phase-5/README.md):

- deterministic answer states, confidence, citation, scope, disclosure, and outward-format validators;
- immutable generation runs, candidate snapshots, claim results, citations, and provider usage;
- provider-neutral fake and Anthropic adapters;
- Cloudflare Queue runtime with retries, cancellation, safe terminal failure, and outbox recovery;
- service retrieval evaluated as the original requester before model invocation;
- a read-only answer inspection console with regeneration and complete provenance;
- a versioned adversarial corpus and machine-readable release report enforced by CI.

Phase 5 drafts are unapproved. Phase 6 must implement human revisions, approvals, controlled reuse, and approved export integration.

## Repository map

```text
apps/
  web/                     workspace and secure upload application
  api/                     workspace API
  worker/                  object-validation worker
  evidence-console/        evidence admission and retrieval workspace
  evidence-api/            evidence lifecycle and retrieval API
  ingestion/               evidence extraction orchestrator
  extractor/               isolated evidence parser service
  questionnaire-console/   questionnaire mapping and export-plan workspace
  questionnaire-api/       questionnaire lifecycle and export API
  questionnaire-worker/    questionnaire queue orchestrator
  questionnaire-processor/ credential-free inspection and export service
  answer-console/          answer generation and provenance inspection workspace
  answer-api/              generation request and inspection API
  generation-worker/       evidence retrieval and provider orchestration worker
packages/
  foundation/              identity, authorization, jobs, and audit contracts
  evidence/                extraction, scope, span, and ranking contracts
  questionnaire/           mapping, conditions, snapshots, and export contracts
  answer/                  answer states, validation, providers, and evaluation
evaluation and reports/
  scripts/run-phase5-evaluation.ts
docs/
  phase-1/ through phase-5/
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
npm run dev:questionnaire-processor
npm run dev:questionnaire-worker
npm run dev:questionnaire-api
npm run dev:questionnaire-console
npm run dev:answer-api
npm run dev:generation-worker
npm run dev:answer-console
```

Service-role, parser, processor, and provider credentials must never use a `VITE_` prefix. The browser receives only public Supabase and API configuration.

## Verification

```bash
npm run format:check
npm run typecheck
npm run test
npm run eval:phase5
npm run build
npm run db:test
npm audit --omit=dev --audit-level=high
```

## MVP scope

- [x] Secure multi-tenant workspaces, authentication, roles, immutable uploads, jobs, and audit
- [x] Versioned evidence extraction, exact provenance, scope, approval, and retrieval
- [x] XLSX/CSV questionnaire import with compatibility and mapping review
- [x] Compound-question decomposition, polarity, conditions, and frozen snapshots
- [x] Deterministic XLSX/CSV export planning and round-trip structural validation
- [x] Structured AI drafts with exact citations, explanatory states, safe abstention, and inspection
- [ ] Human review, immutable edits, risk-based approvals, and approval invalidation
- [ ] Trusted answer reuse and approved structure-preserving export
- [ ] Production hardening, billing, integrations, beta, and launch

The MVP does **not** autonomously submit questionnaire answers to external portals.

## Architecture direction

The platform uses Cloudflare Workers + Hono and Supabase Auth, Postgres, RLS, private object storage, full-text retrieval, and optional pgvector. Heavy evidence and questionnaire parsing runs in separate Node services without database credentials.

The answer engine is provider-neutral. Tenant isolation, evidence eligibility, scope, disclosure, answer states, validators, approvals, mapping, and export operations remain outside model prompts.

## Delivery phases

1. **Product constitution and system definition** — implemented.
2. **Secure product foundation** — implemented.
3. **Evidence ingestion, provenance, approval, and retrieval** — implemented.
4. **Questionnaire normalization and structure-preserving import/export** — implemented.
5. **Evidence-grounded answer engine** — implemented as a pre-approval vertical slice.
6. **Human review, approval, controlled reuse, and approved export.**
7. **Security hardening, evaluation, integrations, billing, and production operations.**
8. **Design-partner beta, launch, and iteration.**

## Non-negotiable product rule

> Attestly must protect the boundary between what sounds correct and what this specific company can prove is correct for the requested product, environment, region, and time—and must place an answer only where the customer requested it and only after the required human approvals.

---

*Built from a Fable 5 (Claude Code) venture blueprint inspired by the AI-native compliance automation category.*
