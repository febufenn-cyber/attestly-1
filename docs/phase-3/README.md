# Phase 3 — Evidence Ingestion, Provenance, and Retrieval

## Status

Implemented as a pre-beta evidence-admission vertical slice on top of the Phase 2 secure foundation.

Phase 3 does not generate questionnaire answers. It converts an accepted immutable object into a versioned, scoped, reviewable evidence source with exact provenance and controlled retrieval.

## Implemented flow

1. A knowledge owner selects an accepted immutable object.
2. The owner creates a logical evidence document and immutable version.
3. Evidence class, confidentiality, external disclosure policy, scope, effective date, and review date are recorded before approval.
4. An extraction request creates a tenant-bound job and transactional evidence outbox entry.
5. The ingestion Worker leases the job, verifies the evidence-version/object relationship, and creates a five-minute signed source URL.
6. A dedicated Node extractor downloads only from an allowlisted storage host and validates the source hash.
7. Malware scanning is required unless explicitly disabled for local development. Scanner failure blocks extraction in normal operation.
8. Format-specific adapters process PDF, DOCX, XLSX, CSV, and TXT into one canonical document representation.
9. Extracted content remains untrusted data. Prompt-injection-like text, secrets, hidden content, formulas, tracked deletions, active content, and low-text PDF pages create warnings rather than instructions.
10. The ingestion Worker schema-validates the manifest and constructs deterministic citable spans.
11. A service-only RPC stores extraction runs, exact provenance nodes, warnings, and spans under composite tenant-aware foreign keys.
12. Clean high-quality extraction becomes `ready_for_review`, never automatically approved.
13. A knowledge owner may approve evidence only after clean malware status, sufficient extraction quality, required dates, and resolution of critical warnings.
14. Retrieval considers only authorized, approved, current, index-ready evidence.
15. Scope mismatch produces zero rank even when the text is highly similar.
16. External retrieval operations enforce the evidence disclosure policy before ranking.
17. Explicit contradiction relationships are surfaced with candidates.

## Repository map

```text
apps/
  evidence-api/      authenticated evidence, approval, and search API
  evidence-console/  reviewer-facing admission and retrieval workspace
  ingestion/         extraction queue orchestrator and outbox recovery
  extractor/         isolated Node document parser service
packages/
  evidence/          canonical schemas, spans, scope matching, quality, ranking
supabase/
  migrations/        evidence domain, provenance, RLS, RPCs, retrieval
  tests/              Phase 3 tenant, scope, approval, and disclosure tests
docs/phase-3/ADRs/    architecture decisions
```

## Supported formats

### TXT

- UTF-8 decoding with invalid-sequence replacement
- paragraph and character-range provenance
- control-character cleanup

### CSV

- delimiter and quoted-cell parsing
- header-bound cell text
- row/column provenance
- formula-like values preserved as text and never executed

### PDF

- page boundaries
- native text extraction
- basic reading-order grouping
- page-relative bounding boxes
- critical `ocr_required` warning for low-text pages

OCR is intentionally not fabricated. Pages without reliable native text remain blocked from ordinary approval until an approved OCR or visual-review implementation is added.

### DOCX

- bounded OOXML archive processing
- paragraphs, headings, and table cells
- tracked insertion/deletion flags
- hidden-text warnings
- external relationship warnings
- macro/active-content blocking warnings

### XLSX

- worksheets, cells, addresses, formulas, cached values, formats, comments, and visibility metadata
- hidden sheet/row/column warnings
- formulas preserved as untrusted metadata and never executed
- workbook dimension limits

## Security invariants

1. Extraction starts only from a Phase 2 `accepted` object with a recorded SHA-256.
2. Queue messages carry tenant, object, evidence version, job, and correlation identity.
3. The ingestion Worker revalidates all relationships before signing source access.
4. The extractor receives no database or service-role credentials.
5. The extractor accepts only one-time internal authentication and an allowlisted storage hostname.
6. Production extractor traffic must use HTTPS.
7. Source bytes are hash-verified again inside the extractor.
8. Extracted content cannot widen authorization, call tools, or change system policy.
9. Every citable span maps to source node IDs and page/sheet/cell coordinates where available.
10. Evidence metadata and evidence content have separate RLS decisions; restricted content excludes ordinary administrators and contributors.
11. Search eligibility occurs before ranking.
12. Retrieval never performs global vector search followed by tenant filtering.
13. External quote/summary searches enforce disclosure permission before content is returned.
14. Evidence approval and future answer approval remain separate.
15. Old versions are superseded, not rewritten.

## Local development

Start Phase 2 services first, then:

```bash
cp .env.example .env
npm install
npm run supabase:reset
npm run db:test
npm run dev:extractor
npm run dev:ingestion
npm run dev:evidence-api
npm run dev:evidence-console
```

Worker-only values belong in `.dev.vars` and extractor-only values belong in the extractor process environment. Never expose `SUPABASE_SERVICE_ROLE_KEY` or `EXTRACTOR_INTERNAL_TOKEN` through a `VITE_` variable.

For local development only, `ALLOW_UNSCANNED_EXTRACTION=true` permits extraction to complete with `scanStatus=unavailable`; such evidence still cannot be approved because approval requires `clean` scan status.

## Verification

```bash
npm run format:check
npm run typecheck
npm run test
npm run build
npm run db:test
npm audit --omit=dev --audit-level=high
```

The Phase 3 pgTAP suite verifies:

- contributor admission denial;
- knowledge-owner admission;
- immutable accepted-source requirement;
- typed extraction jobs and privileged outbox isolation;
- manifest hash binding;
- citable span persistence;
- review-before-approval state;
- cross-tenant provenance rejection;
- clean-scan approval gate;
- current-version assignment;
- eligible lexical retrieval;
- hard product-scope mismatch exclusion;
- disclosure-policy exclusion;
- cross-tenant metadata and content isolation.

## Optional embeddings

The schema includes versioned provider-neutral span embeddings using pgvector. No provider is activated by default because model/subprocessor approval remains an external governance decision. Phase 3 retrieval is fully functional with Postgres full-text search and trigram similarity. When an approved embedding provider is configured later, each vector must remain bound to:

- tenant;
- evidence span;
- provider and model;
- dimensions;
- embedding ruleset version;
- source content hash.

A new provider, model, or chunking ruleset creates a new embedding version rather than overwriting historical vectors.

## Deliberate limits

- No AI-generated questionnaire answers.
- No questionnaire import/export.
- No autonomous evidence classification or scope approval.
- No production OCR implementation.
- No browser rendering of original PDF/DOCX/XLSX pages yet; the console displays exact textual provenance metadata.
- No automatic contradiction inference; relations are stored explicitly and must be approved.
- No active embedding provider.
- No production deployment target is chosen for the extractor container.
- No scanner implementation is bundled; an external allowlisted scanner endpoint is required before beta.

## Phase 4 handoff

Phase 4 should normalize XLSX/CSV/DOCX questionnaires into immutable snapshots, preserve source mappings and workbook structure, decompose compound questions into atomic claim requests, and export only from a frozen approved snapshot. It must consume Phase 3 retrieval through its eligibility boundary rather than reading evidence tables directly.
