# Phase 5 — Evidence-Grounded Answer Engine

## Status

Engineering complete as a pre-beta vertical slice. Phase 5 is not approval to send generated drafts to customers or process production evidence. Human review, approvals, controlled reuse, and approved export belong to Phase 6.

## Objective

Phase 5 converts one frozen Phase 4 questionnaire question and an authorized Phase 3 evidence candidate set into a structured, reviewable draft. It does not approve answers, modify questionnaire artifacts, or export customer representations.

The model is a replaceable drafting component. Canonical answer state, citation validity, scope eligibility, confidence caps, disclosure rules, reviewer routing, persistence, and export eligibility remain deterministic platform responsibilities.

## Implemented pipeline

```text
frozen questionnaire snapshot
→ question + atomic claim requests
→ service retrieval evaluated as the original requester
→ immutable candidate and input snapshot
→ provider-neutral fake or Anthropic adapter
→ schema-constrained model output
→ deterministic claim, citation, scope, disclosure, and format validation
→ canonical answer state and confidence caps
→ immutable answer revision and provider-usage record
→ read-only Phase 5 inspection console
→ versioned adversarial release evaluation
```

## Components

- `packages/answer` — answer states, confidence, validators, provider gateway, evaluation metrics, and gold corpus.
- `apps/answer-api` — authenticated generation request and inspection API.
- `apps/generation-worker` — queue orchestration, retrieval, provider invocation, retries, safe failure, and outbox recovery.
- `apps/answer-console` — question/run status, regeneration, atomic claims, exact citations, limitations, confidence, provider identity, and validation inspection.
- `supabase/migrations/202607130013...202607140017` — immutable generation ledger and runtime boundaries.
- `scripts/run-phase5-evaluation.ts` — machine-readable release evaluation.
- [`RUNBOOK.md`](./RUNBOOK.md) — staging and incident operations.
- [`EXIT_REVIEW.md`](./EXIT_REVIEW.md) — final Phase 5 engineering decision and known limits.

## Runtime boundaries

- The browser requests generation through the authenticated answer API.
- The API creates a tenant-owned run and transactional queue outbox.
- A Cloudflare Queue worker leases the job and retrieves only eligible evidence.
- Service retrieval rechecks the original requester’s active membership and restricted-content role.
- The exact structured input and candidate order are persisted before provider invocation.
- Providers have no database credentials, tools, approval rights, or export rights.
- Retry attempts must reuse the same input hash.
- Malformed or terminal provider output becomes a blocked revision with no outward value.
- Token, latency, and estimated cost metadata are stored without prompt or evidence content.
- The inspection console contains generation and regeneration actions only; it has no approval or export capability.

## Non-negotiable rules

1. The generator consumes only frozen questionnaire snapshots.
2. Evidence eligibility is resolved before model invocation.
3. Every supported material claim requires an exact citation to an eligible evidence span.
4. Citation quotes must be exact substrings of the cited span after safe normalization.
5. A scope-mismatched span cannot support a claim.
6. Historical evidence cannot produce the principal `supported` state.
7. Contradictory evidence must be preserved and surfaced.
8. Unsupported compound clauses cannot be omitted to manufacture an affirmative answer.
9. Universal quantifiers cannot be introduced unless established by the question and evidence.
10. Disclosure policy is enforced before content is sent for an external-summary or external-quote draft.
11. Invalid model output fails closed as `blocked_from_automation` and produces no outward value.
12. The answer engine cannot write questionnaire source or export tables.
13. The generated draft is never an externally approved representation.

## Provider configuration

Local development and CI use the deterministic fake provider. Staging and production use the Anthropic adapter only after the environment supplies:

- `ANTHROPIC_API_KEY` to the generation worker;
- an approved model identity in the answer API;
- approved input and output token-cost configuration;
- separate staging and production queues and dead-letter queues.

The fake provider is rejected in production.

## Verification

The Phase 5 test and evaluation system covers:

- supported, partially supported, no-evidence, historical, scope-mismatch, contradicted, and blocked outcomes;
- exact quote and candidate-set citation validation;
- prompt-injection containment;
- malformed output and rate-limit classification;
- tenant-first service retrieval;
- restricted-evidence exclusion for contributors;
- immutable retry input;
- idempotent provider usage;
- typed failure states;
- cancellation authorization;
- regeneration as a new immutable run;
- blocked drafts with no outward value.

Run the release evaluation with:

```bash
npm run eval:phase5
```

The machine-readable result is written to `reports/phase5-evaluation-report.json`, uploaded by CI, and blocks release when a critical gate fails.

## Deliberate limits

Phase 5 does not:

- approve answers;
- learn global truth from human edits;
- export completed questionnaires;
- autonomously submit to portals;
- generate evidence;
- use model knowledge as customer evidence;
- expose chain-of-thought or hidden prompts;
- permit documents to control tools, authorization, retrieval scope, or validators.

## Phase 6 handoff

Phase 6 should review immutable Phase 5 answer revisions, support human edits with explicit provenance, apply risk-based approval requirements, invalidate approval after material changes, freeze a final answer snapshot, and authorize Phase 4 export plans from that approved snapshot.
