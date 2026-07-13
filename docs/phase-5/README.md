# Phase 5 — Evidence-Grounded Answer Engine

## Objective

Phase 5 converts one frozen Phase 4 questionnaire question and an authorized Phase 3 evidence candidate set into a structured, reviewable draft. It does not approve answers, modify questionnaire artifacts, or export customer representations.

The model is a replaceable drafting component. Canonical answer state, citation validity, scope eligibility, confidence caps, disclosure rules, reviewer routing, persistence, and export eligibility remain deterministic platform responsibilities.

## Core pipeline

```text
frozen questionnaire snapshot
→ question + atomic claim requests
→ tenant/scope/disclosure-filtered evidence retrieval
→ immutable generation input snapshot
→ provider-neutral model draft
→ schema validation
→ deterministic claim/citation validation
→ canonical answer state
→ confidence and risk calculation
→ immutable draft revision
→ Phase 6 human review
```

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

## Principal answer states

- `supported`
- `partially_supported`
- `historically_supported`
- `scope_mismatch`
- `contradicted`
- `no_evidence`
- `requires_sme`
- `requires_legal`
- `not_applicable`
- `ambiguous_question`
- `blocked_from_automation`

## Confidence

Confidence is not model probability. It is calculated from:

- evidence strength;
- semantic relevance;
- scope match;
- freshness;
- source authority;
- contradiction safety;
- extraction quality;
- material-claim completeness;
- claim-to-citation alignment.

Canonical states impose hard confidence caps. Fluency, urgency, and answer length never increase confidence.

## Phase 5 implementation slices

1. **Answer kernel** — schemas, state doctrine, deterministic validators and adversarial unit tests.
2. **Generation domain** — tenant-safe database tables, immutable input snapshots, runs, revisions, citations, RLS and pgTAP tests.
3. **Generation runtime** — provider-neutral model gateway, retrieval orchestration, queue worker, API and fail-closed persistence.
4. **Review console and evaluation** — reviewer-facing drafts, claim/citation inspection, batch generation, adversarial corpus and release gates.

Each slice is merged into `main` only after its independent CI gates pass.

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
