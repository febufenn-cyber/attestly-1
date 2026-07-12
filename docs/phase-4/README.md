# Phase 4 — Questionnaire Intelligence and Structure-Preserving Export

## Status

Implemented as a pre-answering vertical slice on top of Phase 3 evidence admission.

Phase 4 determines exactly what a buyer is asking, where a response belongs, which conditions activate it, and whether the original artifact can be changed without structural damage. It does not generate substantive questionnaire answers.

## Implemented flow

1. A workspace member selects a Phase 2 accepted immutable XLSX, CSV, DOCX, or PDF object.
2. Attestly creates a questionnaire artifact bound to the original source hash.
3. A typed queue job and transactional outbox record start questionnaire inspection.
4. The questionnaire Worker revalidates tenant, object, hash, format, and artifact identity.
5. A credential-free Node processor receives a five-minute signed source URL.
6. The processor inventories package structure before interpreting questions.
7. XLSX inspection records sheets, visibility, used ranges, hidden rows and columns, merged ranges, formulas, validations, named ranges, protection, macros, external links, embedded parts, and OOXML part hashes.
8. CSV inspection preserves delimiter, quoting, row order, and answer-column mappings.
9. DOCX inspection preserves paragraph provenance and blocks automatic export until safe content controls or table cells are explicitly mapped.
10. Questions, instructions, destinations, conditions, polarity, answer formats, atomic claims, warnings, and confidence dimensions are stored in an immutable mapping version.
11. Human corrections create a new mapping version instead of modifying history.
12. Final approvers freeze a deterministic questionnaire snapshot after scope and blockers are resolved.
13. Export plans are compiled from a frozen snapshot and a separate answer snapshot.
14. Inactive conditional fields become `leave_blank`; unresolved conditions block the plan.
15. Formula or protected destinations block automatic writes.
16. The processor writes only planned XLSX or CSV destinations into a derived artifact.
17. XLSX output is reopened and compared at the OOXML package-part level.
18. Unexpected structural changes block validation.
19. Safe outputs receive a new immutable stored-object identity and SHA-256 hash.

## Repository map

```text
apps/
  questionnaire-api/        authenticated artifact, mapping, snapshot, and export API
  questionnaire-worker/     queue orchestration, signed access, outbox recovery
  questionnaire-processor/  credential-free inspection and export service
  questionnaire-console/    mapping, scope, warnings, freezing, and test-plan UI
packages/
  questionnaire/            schemas, conditions, decomposition, hashing, export planning
supabase/
  migrations/               questionnaire domain, lifecycle, RLS, and export functions
  tests/                     Phase 4 isolation and round-trip state tests
docs/phase-4/ADRs/           architecture decisions
```

## Supported formats

### XLSX

Automatic import and export are enabled only when compatibility checks permit them.

The processor detects:

- visible, hidden, and very-hidden sheets;
- question, identifier, guidance, and answer columns;
- formulas and data-validation lists;
- protected sheets and locked destinations;
- merged cells;
- hidden rows and columns;
- macros and active content;
- external links and unsupported OOXML parts;
- package-part hashes for structural diffing.

Automatic export is blocked when a mapped destination contains a formula, is protected, or belongs to a workbook whose unsupported features cannot be preserved safely.

### CSV

CSV import and export preserve:

- delimiter;
- quoted fields;
- row and column order;
- answer-column coordinates;
- newline style;
- formula-injection protection.

### DOCX

DOCX question text and paragraph provenance are imported. Automatic DOCX export remains blocked until a safe destination is explicitly mapped to a supported content control or table cell.

### PDF

PDF questionnaires remain import-only/manual-mapping artifacts in Phase 4. The system does not claim structure-preserving PDF export.

## Questionnaire model

The system separates:

- source artifact;
- import run;
- mapping version;
- question;
- instruction;
- answer destination;
- atomic claim request;
- conditional expression;
- frozen questionnaire snapshot;
- export plan;
- export operation;
- export run;
- structural diff;
- output artifact.

The original question text and exact source coordinates are always retained. Normalization never replaces the source wording.

## Compound questions

A question such as:

> Do you encrypt customer data at rest and in transit, rotate keys annually, and restrict key access?

remains one outward question while creating independently reviewable atomic claim requests. Qualifiers such as `all`, `production`, `annually`, and `customer-managed` are preserved.

## Conditional logic

Conditions use a deterministic expression model and tri-state evaluation:

- `active`;
- `inactive`;
- `unknown`.

Inactive destinations remain blank. Unknown activation blocks export. Condition graphs are checked for missing references, self-dependencies, and cycles.

## Snapshot boundary

A frozen snapshot binds:

- immutable source hash;
- processor version;
- mapping version;
- ordered questions;
- answer destinations;
- condition graph;
- target scope;
- deterministic snapshot hash.

Phase 5 must consume the snapshot API. It must not inspect mutable workbook state or raw importer tables.

## Export safety

The exporter follows this sequence:

```text
immutable source
→ exact derived copy
→ deterministic operations
→ output artifact
→ reopen
→ structural diff
→ validated or blocked
```

A file opening successfully is not enough. Unexpected package-part changes block a validated export.

Internal prompts, confidence values, reviewer notes, evidence excerpts, storage IDs, and other internal metadata are never part of Phase 4 export operations.

## Local development

Start the Phase 2 and Phase 3 services, then:

```bash
npm install
npm run supabase:reset
npm run db:test
npm run dev:questionnaire-processor
npm run dev:questionnaire-worker
npm run dev:questionnaire-api
npm run dev:questionnaire-console
```

Required local secrets:

- `SUPABASE_SERVICE_ROLE_KEY` only in API/Worker `.dev.vars`;
- `PROCESSOR_INTERNAL_TOKEN` only in Worker and processor environments;
- `VITE_SUPABASE_ANON_KEY` and public URLs only in the browser.

## Verification

```bash
npm run format:check
npm run typecheck
npm run test
npm run build
npm run db:test
npm audit --omit=dev --audit-level=high
```

The Phase 4 suite verifies:

- accepted-source admission;
- typed import/export jobs;
- privileged outbox isolation;
- source-hash immutability;
- canonical question and atomic-request persistence;
- final-approver snapshot gates;
- snapshot immutability;
- deterministic expected-change counts;
- new output object identity;
- successful round-trip completion;
- cross-tenant artifact, question, snapshot, and export isolation.

## Deliberate limits

- No substantive AI-generated answers.
- No browser portal automation.
- No macro execution.
- No automatic PDF export.
- DOCX export is blocked until a safe destination mapping exists.
- The first XLSX exporter supports compatible workbooks and blocks unsupported OOXML packages rather than pretending to preserve them.
- Mapping-template reuse tables are present, but automatic reuse is not enabled until a representative customer corpus establishes safe drift thresholds.
- The console compiles synthetic test plans only; real customer export requires Phase 5 answers and Phase 6 approvals.

## Phase 5 handoff

Phase 5 should consume frozen questionnaire snapshots and Phase 3 retrieval candidates to generate structured answer drafts at question and atomic-claim level. It must preserve polarity, conditions, answer constraints, customer scope, citations, contradictions, and abstention. It must never write directly into source artifacts or export tables.
