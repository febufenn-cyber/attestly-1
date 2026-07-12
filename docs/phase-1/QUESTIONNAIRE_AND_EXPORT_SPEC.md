# Questionnaire Import and Export Specification

## 1. Objective

Attestly must transform heterogeneous customer questionnaires into a canonical, reviewable structure and then write approved answers back without damaging the source document.

The importer and exporter are safety-critical components. A correct answer placed in the wrong cell, attached to the wrong conditional branch, or exported into a corrupted workbook is a product failure.

## 2. MVP supported formats

### Fully supported target

- `.xlsx` workbooks without executable macro dependence;
- `.csv` files with a single table and explicit answer columns.

### Supported after compatibility validation

- clean `.docx` questionnaires using tables, headings, and ordinary paragraphs.

### Import-only or manual-review target

- ordinary text-based PDF questionnaires where question and answer regions can be reliably detected.

### Explicitly unsupported in the initial MVP

- image-only or handwriting-heavy questionnaires without a human mapping step;
- password-protected or encrypted workbooks unless the user supplies access through an approved secure flow;
- `.xlsm` workflows that require macro execution;
- browser portal automation;
- questionnaires requiring proprietary desktop plugins;
- files whose output correctness cannot be validated.

Unsupported does not mean silently attempted. The system must display the limitation and block final automatic export when fidelity cannot be guaranteed.

## 3. Immutable source handling

For every import, Attestly stores:

- the immutable original binary;
- SHA-256 hash;
- media type and detected type;
- file size;
- uploader;
- import timestamp;
- malware and quarantine status;
- parser version;
- extraction and compatibility report.

All edits and exports operate on derived copies. The original source is never overwritten.

## 4. Import pipeline

1. Validate tenant, authorization, size, media type, extension, and upload policy.
2. Store the immutable original.
3. Run type detection and malware/quarantine checks.
4. Inspect document structure without executing macros, scripts, formulas, links, or embedded objects.
5. Create a compatibility report.
6. Parse sheets, tables, paragraphs, cells, comments, instructions, and structural metadata.
7. Detect candidate question and answer locations.
8. Normalize questions while preserving original text and exact source coordinates.
9. Detect conditional relationships and compound claims.
10. Present a mapping preview to the user.
11. Require correction or confirmation when confidence is below threshold.
12. Freeze a questionnaire snapshot for answer generation.

## 5. Workbook inspection requirements

The XLSX importer records at least:

- sheet names and order;
- visible, hidden, and very-hidden sheet state;
- used ranges;
- hidden rows and columns;
- merged cells;
- formulas and cached formula values;
- data-validation rules and dropdowns;
- named ranges;
- comments and notes;
- cell styles and number formats;
- conditional formatting presence;
- external links;
- embedded objects and images;
- workbook and worksheet protection;
- macros or macro-enabled format indicators;
- blank-but-formatted ranges likely intended for answers;
- multiple candidate answer columns;
- color or formatting patterns that may encode instructions.

The importer must never assume that visible rows are the entire questionnaire.

## 6. Compatibility report

Every imported artifact receives a report with:

- overall status: `compatible`, `compatible_with_warnings`, `manual_mapping_required`, or `unsupported`;
- parser confidence;
- detected question count;
- detected answer-field count;
- unmapped regions;
- hidden content summary;
- macro/external-link status;
- protected-range status;
- unsupported features;
- export risks;
- user actions required.

Warnings must be actionable. Example:

> Sheet “Infrastructure” contains 17 formulas in the proposed answer column. Attestly will not overwrite those cells. Select a different answer column or use manual export.

## 7. Question detection

A question may occupy:

- one cell;
- merged cells;
- multiple consecutive rows;
- a table row with identifier, requirement, guidance, and answer fields;
- a paragraph followed by a separate response area;
- a parent row controlling child questions;
- a section title plus implicit repeated columns.

Question detection uses structural and semantic signals, but every normalized question retains:

- original text exactly as imported;
- source sheet/table/paragraph;
- cell or range coordinates;
- surrounding labels and instructions;
- display order;
- parent/child relationship;
- answer destination;
- confidence and parser notes.

## 8. Instructions versus questions

The parser distinguishes:

- workbook-level instructions;
- sheet-level instructions;
- section guidance;
- answer-format requirements;
- evidence-attachment requests;
- actual questions;
- examples and explanatory text.

All imported text remains untrusted. Instructions inside the questionnaire control only the outward answer format and workflow when permitted; they do not control system tools, retrieval authorization, model policy, or data access.

## 9. Question types

Canonical question types include:

- `boolean`
- `boolean_with_explanation`
- `single_choice`
- `multi_choice`
- `free_text`
- `numeric`
- `date`
- `percentage`
- `attachment_request`
- `table_row`
- `matrix`
- `compound`
- `conditional_parent`
- `conditional_child`
- `acknowledgement`
- `unknown`

The answer-format requirement is stored separately from the semantic question type.

## 10. Compound-question decomposition

A question is compound when one outward answer depends on multiple independently verifiable claims.

Example:

> Do you encrypt customer data at rest and in transit, rotate keys annually, and restrict key access?

The importer creates one outward Question and four AtomicClaimRequests.

Rules:

- preserve the complete original question;
- do not omit unsupported clauses;
- generate one answer that addresses each material clause;
- assign state based on the weakest material clause unless the UI explicitly presents mixed support;
- allow reviewers to inspect and edit atomic claim handling;
- preserve outward formatting required by the requester.

## 11. Conditional logic

Conditional relationships must be explicit.

Examples:

- answer Q1 only when Q0 is “Yes”;
- if “No,” provide a remediation date;
- complete the cloud subsection only for hosted products;
- select one answer from a list and explain “Other.”

The canonical model stores a machine-readable conditional expression plus original textual instruction.

Generation may draft inactive child answers for reviewer preparation only when configured, but inactive answers must not be exported into fields that should remain blank.

## 12. Mapping review interface requirements

Before generation, a user can:

- view every detected question and answer destination;
- include or exclude rows;
- split or merge detected questions;
- identify section and parent relationships;
- select answer type;
- select the target product and scope;
- correct requested-evidence interpretation;
- resolve multiple candidate answer columns;
- inspect hidden content and warnings;
- save a reusable mapping template when permitted.

A mapping correction creates a new questionnaire snapshot; it does not mutate the immutable source.

## 13. Normalization rules

Normalization is used for matching and retrieval but never replaces the original text.

Allowed normalization:

- whitespace cleanup;
- removal of repeated numbering where clearly structural;
- normalized punctuation and Unicode;
- expansion of unambiguous abbreviations in a separate field;
- extraction of identifiers such as CAIQ or control references;
- separation of guidance from the question;
- decomposition into atomic claim requests.

Prohibited normalization:

- changing the semantic meaning;
- deleting qualifiers such as “all,” “production,” “annually,” or “customer-managed”;
- replacing a customer-specific term with a broader generic term without preserving the mapping;
- converting a negative question into a positive form without recording polarity;
- silently dropping unsupported clauses.

## 14. Duplicate and near-duplicate questions

The system may identify duplicate or near-duplicate questions for answer reuse, but each source question remains a distinct record.

Reuse eligibility requires:

- equivalent meaning and polarity;
- compatible requested scope;
- compatible answer format;
- current supporting evidence;
- no conflicting customer-specific instruction;
- no stronger commitment in the new wording.

Similarity alone is never enough.

## 15. Export preconditions

Automatic final export requires:

- a compatible source artifact;
- confirmed question-to-answer mapping;
- a frozen questionnaire snapshot;
- required answer-level approvals;
- final questionnaire approval;
- no unresolved export-blocking warning;
- no material edits after approval;
- a deterministic export plan.

## 16. XLSX export rules

The exporter:

1. opens a copy of the immutable original;
2. verifies the input hash matches the imported source;
3. writes approved outward answer values only to mapped destinations;
4. preserves formulas, styles, merged cells, validations, comments, ordering, sheet state, and unrelated content where supported;
5. does not execute macros or external links;
6. does not overwrite formula cells unless the mapping was explicitly approved and a safe strategy exists;
7. maintains the answer value type where required;
8. saves to a new artifact;
9. reopens the output and performs structural validation;
10. produces an output hash and compatibility report.

### Internal data excluded by default

- model prompts;
- internal answer-state explanations;
- internal confidence dimensions;
- reviewer comments;
- hidden reasoning;
- internal-only source excerpts;
- storage identifiers;
- user identities not intended for the requester;
- secrets and credentials.

### Optional customer-facing additions

Only when explicitly selected and disclosure-authorized:

- source-document title;
- public citation reference;
- evidence attachment name;
- clarification note;
- approved explanatory comment.

## 17. CSV export rules

CSV has no workbook formatting guarantee. The exporter must:

- preserve row order and column names;
- use the confirmed answer column;
- preserve delimiter, quoting, encoding, and newline style where feasible;
- avoid spreadsheet formula injection by safely handling values beginning with formula-trigger characters when the outward answer format allows;
- produce a diff summary of changed rows and cells.

## 18. DOCX export rules

For supported DOCX questionnaires:

- preserve the original document as immutable;
- write only into mapped tables, content controls, or designated paragraphs;
- preserve styles, headers, footers, numbering, and unrelated text when supported;
- detect tracked changes, comments, protection, and complex fields;
- block automatic export if mapped edits would destabilize document structure;
- reopen and validate the exported document.

## 19. Export validation

Validation compares source and output and confirms:

- expected answer destinations changed;
- no unexpected cells or document regions changed;
- question identifiers and ordering remain intact;
- formulas and validations remain present where expected;
- sheet and section counts remain stable;
- output reopens successfully;
- output contains the approved answer snapshot;
- no prohibited internal content appears;
- output hash is stored.

Any unexpected structural diff blocks a final status and requires review.

## 20. Manual-export fallback

When structure-preserving export cannot be guaranteed, Attestly may provide:

- approved answer table;
- original question identifiers and locations;
- copy-ready answer text;
- evidence and approval status;
- explicit manual completion instructions.

The product must not label this as a completed questionnaire export.

## 21. Test corpus requirements

Before launch, the importer/exporter test corpus must contain representative examples of:

- multiple sheets;
- merged cells;
- hidden rows, columns, and sheets;
- formulas adjacent to answers;
- dropdown answers;
- multi-line and compound questions;
- conditional child questions;
- color-coded guidance;
- comments and notes;
- protected sheets;
- external links;
- macro-enabled files treated as non-executable;
- duplicate questions;
- large questionnaires;
- Unicode and multilingual text;
- malformed and adversarial files.

Round-trip tests must verify both answer placement and absence of unintended changes.
