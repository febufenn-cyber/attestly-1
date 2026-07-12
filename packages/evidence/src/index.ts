import { z } from 'zod';

export const EvidenceClassSchema = z.enum([
  'independent_attestation',
  'operational_proof',
  'implementation_documentation',
  'governance_evidence',
  'historical_representation',
  'unverified_statement',
]);
export type EvidenceClass = z.infer<typeof EvidenceClassSchema>;

export const ConfidentialitySchema = z.enum([
  'public',
  'internal',
  'confidential',
  'restricted',
]);
export type Confidentiality = z.infer<typeof ConfidentialitySchema>;

export const DisclosurePolicySchema = z.enum([
  'external_quote_allowed',
  'external_summary_only',
  'internal_citation_only',
  'prohibited',
]);
export type DisclosurePolicy = z.infer<typeof DisclosurePolicySchema>;

export const ScopeModeSchema = z.enum(['all', 'selected', 'unknown']);
export type ScopeMode = z.infer<typeof ScopeModeSchema>;

export const ScopeSchema = z.object({
  legalEntities: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  businessUnits: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  products: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  environments: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  regions: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  dataClasses: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  deploymentModels: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  customerSegments: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  productVersionExpression: z.string().trim().max(250).nullable().default(null),
  effectiveFrom: z.string().date().nullable().default(null),
  effectiveUntil: z.string().date().nullable().default(null),
  mode: ScopeModeSchema,
  customDimensions: z.record(z.string(), z.array(z.string().max(120)).max(50)).default({}),
});
export type EvidenceScope = z.infer<typeof ScopeSchema>;

export const ExtractionMethodSchema = z.enum([
  'native_text',
  'structured_ooxml',
  'spreadsheet_cell',
  'ocr',
  'machine_description',
  'human_annotation',
]);
export type ExtractionMethod = z.infer<typeof ExtractionMethodSchema>;

export const NodeTypeSchema = z.enum([
  'document',
  'page',
  'section',
  'heading',
  'paragraph',
  'list_item',
  'table',
  'table_row',
  'table_cell',
  'figure',
  'sheet',
  'cell',
  'comment',
  'footnote',
]);
export type NodeType = z.infer<typeof NodeTypeSchema>;

export const BoundingBoxSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
  pageWidth: z.number().finite().positive().optional(),
  pageHeight: z.number().finite().positive().optional(),
});

export const DocumentNodeSchema = z.object({
  id: z.string().min(1).max(180),
  parentId: z.string().min(1).max(180).nullable().default(null),
  type: NodeTypeSchema,
  displayOrder: z.number().int().nonnegative(),
  text: z.string().max(2_000_000).default(''),
  normalizedText: z.string().max(2_000_000).default(''),
  pageNumber: z.number().int().positive().nullable().default(null),
  sheetName: z.string().max(255).nullable().default(null),
  cellRange: z.string().max(100).nullable().default(null),
  headingPath: z.array(z.string().max(500)).max(30).default([]),
  paragraphIndex: z.number().int().nonnegative().nullable().default(null),
  characterStart: z.number().int().nonnegative().nullable().default(null),
  characterEnd: z.number().int().nonnegative().nullable().default(null),
  boundingBox: BoundingBoxSchema.nullable().default(null),
  extractionMethod: ExtractionMethodSchema,
  extractionConfidence: z.number().min(0).max(1),
  flags: z.array(z.string().max(120)).max(100).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type DocumentNode = z.infer<typeof DocumentNodeSchema>;

export const ExtractionWarningSchema = z.object({
  code: z.string().regex(/^[a-z0-9_]{3,120}$/),
  severity: z.enum(['info', 'warning', 'critical']),
  message: z.string().min(1).max(1000),
  nodeId: z.string().max(180).nullable().default(null),
  pageNumber: z.number().int().positive().nullable().default(null),
  sheetName: z.string().max(255).nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type ExtractionWarning = z.infer<typeof ExtractionWarningSchema>;

export const ExtractionManifestSchema = z.object({
  schemaVersion: z.literal(1),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceMimeType: z.string().min(1).max(200),
  sourceFileName: z.string().min(1).max(255),
  extractorName: z.string().min(1).max(120),
  extractorVersion: z.string().min(1).max(120),
  normalizationRulesetVersion: z.string().min(1).max(120),
  scanStatus: z.enum(['clean', 'unavailable', 'suspicious', 'malware_detected']),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  documentTitle: z.string().max(500).nullable().default(null),
  pageCount: z.number().int().nonnegative().nullable().default(null),
  sheetCount: z.number().int().nonnegative().nullable().default(null),
  nodes: z.array(DocumentNodeSchema).max(250_000),
  warnings: z.array(ExtractionWarningSchema).max(20_000),
  quality: z.object({
    coverage: z.number().min(0).max(1),
    readingOrder: z.number().min(0).max(1),
    structuralFidelity: z.number().min(0).max(1),
    provenanceCompleteness: z.number().min(0).max(1),
    overall: z.number().min(0).max(1),
    requiresHumanReview: z.boolean(),
  }),
  statistics: z.object({
    textCharacters: z.number().int().nonnegative(),
    nonEmptyNodes: z.number().int().nonnegative(),
    tableCount: z.number().int().nonnegative(),
    figureCount: z.number().int().nonnegative(),
    ocrNodeCount: z.number().int().nonnegative(),
  }),
});
export type ExtractionManifest = z.infer<typeof ExtractionManifestSchema>;

export const EvidenceSpanSchema = z.object({
  localId: z.string().min(1).max(180),
  sourceNodeIds: z.array(z.string().min(1).max(180)).min(1).max(100),
  text: z.string().min(1).max(50_000),
  normalizedText: z.string().min(1).max(50_000),
  pageNumber: z.number().int().positive().nullable(),
  sheetName: z.string().max(255).nullable(),
  cellRange: z.string().max(100).nullable(),
  headingPath: z.array(z.string().max(500)).max(30),
  extractionMethod: ExtractionMethodSchema,
  extractionConfidence: z.number().min(0).max(1),
  sourceLocation: z.record(z.string(), z.unknown()),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type EvidenceSpan = z.infer<typeof EvidenceSpanSchema>;

export function normalizeEvidenceText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function stableNodeId(prefix: string, ...parts: Array<string | number | null>): string {
  const canonical = parts.map((part) => String(part ?? '')).join('|');
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digestBytes = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest('SHA-256', digestBytes.buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function nodeCanJoin(previous: DocumentNode | undefined, current: DocumentNode): boolean {
  if (!previous) return false;
  if (previous.type === 'heading' || current.type === 'heading') return false;
  if (previous.type === 'table_cell' || current.type === 'table_cell') return false;
  if (previous.type === 'cell' || current.type === 'cell') return false;
  if (previous.pageNumber !== current.pageNumber) return false;
  if (previous.sheetName !== current.sheetName) return false;
  if (previous.headingPath.join(' / ') !== current.headingPath.join(' / ')) return false;
  if (previous.extractionMethod !== current.extractionMethod) return false;
  return true;
}

export interface ChunkOptions {
  maxCharacters?: number;
  targetCharacters?: number;
}

export async function buildEvidenceSpans(
  nodes: DocumentNode[],
  options: ChunkOptions = {},
): Promise<EvidenceSpan[]> {
  const maxCharacters = options.maxCharacters ?? 4500;
  const targetCharacters = Math.min(options.targetCharacters ?? 2200, maxCharacters);
  const eligible = nodes
    .filter((node) => normalizeEvidenceText(node.text).length > 0)
    .sort((left, right) => left.displayOrder - right.displayOrder);
  const groups: DocumentNode[][] = [];
  let current: DocumentNode[] = [];
  let currentCharacters = 0;

  for (const node of eligible) {
    const normalized = normalizeEvidenceText(node.text);
    const previous = current.at(-1);
    const wouldExceed = currentCharacters + normalized.length + 2 > maxCharacters;
    const shouldBreak =
      current.length > 0 &&
      (wouldExceed || !nodeCanJoin(previous, node) || currentCharacters >= targetCharacters);
    if (shouldBreak) {
      groups.push(current);
      current = [];
      currentCharacters = 0;
    }
    current.push({ ...node, normalizedText: normalized });
    currentCharacters += normalized.length + 2;
  }
  if (current.length > 0) groups.push(current);

  const spans: EvidenceSpan[] = [];
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    const text = group.map((node) => node.text.trim()).filter(Boolean).join('\n\n');
    const normalizedText = normalizeEvidenceText(
      [group[0]?.headingPath.join(' > '), text].filter(Boolean).join('\n'),
    );
    const contentHash = await sha256Hex(normalizedText);
    const first = group[0];
    const last = group[group.length - 1];
    spans.push({
      localId: `span-${String(index + 1).padStart(6, '0')}-${contentHash.slice(0, 12)}`,
      sourceNodeIds: group.map((node) => node.id),
      text,
      normalizedText,
      pageNumber: first.pageNumber,
      sheetName: first.sheetName,
      cellRange:
        first.cellRange && last.cellRange && first.cellRange !== last.cellRange
          ? `${first.cellRange}:${last.cellRange}`
          : first.cellRange,
      headingPath: first.headingPath,
      extractionMethod: first.extractionMethod,
      extractionConfidence: Math.min(...group.map((node) => node.extractionConfidence)),
      sourceLocation: {
        firstNodeId: first.id,
        lastNodeId: last.id,
        pageNumber: first.pageNumber,
        sheetName: first.sheetName,
        cellRange: first.cellRange,
        headingPath: first.headingPath,
      },
      contentHash,
    });
  }
  return spans.map((span) => EvidenceSpanSchema.parse(span));
}

const injectionPatterns: Array<{ code: string; pattern: RegExp }> = [
  {
    code: 'prompt_injection_ignore_instructions',
    pattern: /ignore (all|any|the)?\s*(previous|prior|system|developer) instructions?/i,
  },
  {
    code: 'prompt_injection_reveal_prompt',
    pattern: /(reveal|print|show|return).{0,40}(system prompt|developer message|hidden instructions?)/i,
  },
  {
    code: 'prompt_injection_tool_request',
    pattern: /(call|invoke|use).{0,30}(tool|function|api).{0,30}(secret|credential|other tenant|all files)/i,
  },
  {
    code: 'prompt_injection_scope_widening',
    pattern: /(search|retrieve|access).{0,40}(all tenants?|other companies|unrelated documents?)/i,
  },
];

const secretPatterns: Array<{ code: string; pattern: RegExp }> = [
  { code: 'possible_private_key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { code: 'possible_aws_access_key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { code: 'possible_bearer_token', pattern: /\bBearer\s+[A-Za-z0-9._~+\/-]{20,}/i },
];

export function detectContentWarnings(nodes: DocumentNode[]): ExtractionWarning[] {
  const warnings: ExtractionWarning[] = [];
  for (const node of nodes) {
    const text = node.text;
    if (!text) continue;
    for (const rule of injectionPatterns) {
      if (rule.pattern.test(text)) {
        warnings.push({
          code: rule.code,
          severity: 'warning',
          message:
            'Untrusted source content resembles an instruction to an AI system. It remains data and must never control tools or authorization.',
          nodeId: node.id,
          pageNumber: node.pageNumber,
          sheetName: node.sheetName,
          metadata: {},
        });
      }
    }
    for (const rule of secretPatterns) {
      if (rule.pattern.test(text)) {
        warnings.push({
          code: rule.code,
          severity: 'critical',
          message: 'Extracted content may contain a secret and requires restricted review before indexing.',
          nodeId: node.id,
          pageNumber: node.pageNumber,
          sheetName: node.sheetName,
          metadata: {},
        });
      }
    }
  }
  return warnings;
}

export const ScopeMatchResultSchema = z.enum([
  'exact',
  'compatible',
  'partial',
  'mismatch',
  'unknown',
]);
export type ScopeMatchResult = z.infer<typeof ScopeMatchResultSchema>;

export interface ScopeMatch {
  result: ScopeMatchResult;
  dimensions: Record<string, ScopeMatchResult>;
  explanation: string[];
}

function matchDimension(
  requested: string[],
  candidate: string[],
  candidateMode: ScopeMode,
): ScopeMatchResult {
  if (candidateMode === 'unknown') return 'unknown';
  if (candidateMode === 'all') return 'compatible';
  if (requested.length === 0) return 'compatible';
  const requestedSet = new Set(requested.map((value) => value.toLowerCase()));
  const candidateSet = new Set(candidate.map((value) => value.toLowerCase()));
  const overlap = [...requestedSet].filter((value) => candidateSet.has(value));
  if (overlap.length === requestedSet.size && overlap.length === candidateSet.size) return 'exact';
  if (overlap.length === requestedSet.size) return 'compatible';
  if (overlap.length > 0) return 'partial';
  return 'mismatch';
}

export function matchScope(requested: EvidenceScope, candidate: EvidenceScope): ScopeMatch {
  const dimensions: Record<string, ScopeMatchResult> = {};
  const explanation: string[] = [];
  const keys = [
    ['legalEntities', requested.legalEntities, candidate.legalEntities],
    ['businessUnits', requested.businessUnits, candidate.businessUnits],
    ['products', requested.products, candidate.products],
    ['environments', requested.environments, candidate.environments],
    ['regions', requested.regions, candidate.regions],
    ['dataClasses', requested.dataClasses, candidate.dataClasses],
    ['deploymentModels', requested.deploymentModels, candidate.deploymentModels],
    ['customerSegments', requested.customerSegments, candidate.customerSegments],
  ] as const;

  for (const [key, requestedValues, candidateValues] of keys) {
    const result = matchDimension(requestedValues, candidateValues, candidate.mode);
    dimensions[key] = result;
    if (result === 'mismatch') explanation.push(`${key} does not overlap`);
    if (result === 'unknown') explanation.push(`${key} is not established`);
  }

  const values = Object.values(dimensions);
  let result: ScopeMatchResult;
  if (values.includes('mismatch')) result = 'mismatch';
  else if (values.includes('unknown')) result = 'unknown';
  else if (values.includes('partial')) result = 'partial';
  else if (values.every((value) => value === 'exact')) result = 'exact';
  else result = 'compatible';

  return { result, dimensions, explanation };
}

export interface RetrievalScoreInput {
  keywordScore: number;
  semanticScore?: number | null;
  authorityScore: number;
  freshnessScore: number;
  extractionQuality: number;
  scopeMatch: ScopeMatchResult;
  contradiction: boolean;
}

const scopeWeights: Record<ScopeMatchResult, number> = {
  exact: 1,
  compatible: 0.9,
  partial: 0.55,
  mismatch: 0,
  unknown: 0.25,
};

export function rankRetrievalCandidate(input: RetrievalScoreInput): number {
  const keyword = Math.max(0, Math.min(1, input.keywordScore));
  const semantic = Math.max(0, Math.min(1, input.semanticScore ?? 0));
  const authority = Math.max(0, Math.min(1, input.authorityScore));
  const freshness = Math.max(0, Math.min(1, input.freshnessScore));
  const extraction = Math.max(0, Math.min(1, input.extractionQuality));
  const base =
    keyword * 0.38 +
    semantic * 0.22 +
    authority * 0.15 +
    freshness * 0.1 +
    extraction * 0.15;
  const contradictionBonus = input.contradiction ? 0.04 : 0;
  return Number(
    Math.min(1, (base + contradictionBonus) * scopeWeights[input.scopeMatch]).toFixed(6),
  );
}

export function authorityScore(evidenceClass: EvidenceClass): number {
  return {
    independent_attestation: 1,
    operational_proof: 0.95,
    implementation_documentation: 0.82,
    governance_evidence: 0.7,
    historical_representation: 0.42,
    unverified_statement: 0.15,
  }[evidenceClass];
}

export function calculateManifestQuality(
  nodes: DocumentNode[],
  warnings: ExtractionWarning[],
  expectedUnits?: number | null,
): ExtractionManifest['quality'] {
  const nonEmpty = nodes.filter((node) => normalizeEvidenceText(node.text).length > 0);
  const provenanceComplete = nonEmpty.filter(
    (node) => node.pageNumber !== null || node.sheetName !== null || node.cellRange !== null,
  ).length;
  const coverage =
    expectedUnits && expectedUnits > 0
      ? Math.min(
          1,
          new Set(nonEmpty.map((node) => node.pageNumber ?? node.sheetName)).size / expectedUnits,
        )
      : nonEmpty.length > 0
        ? 1
        : 0;
  const provenanceCompleteness = nonEmpty.length > 0 ? provenanceComplete / nonEmpty.length : 0;
  const critical = warnings.some((warning) => warning.severity === 'critical');
  const structuralFidelity = nodes.some((node) =>
    ['table', 'table_cell', 'heading', 'sheet'].includes(node.type),
  )
    ? 0.92
    : 0.78;
  const readingOrder = warnings.some((warning) => warning.code.includes('reading_order'))
    ? 0.55
    : 0.9;
  const overall = Math.max(
    0,
    Math.min(
      1,
      coverage * 0.32 +
        provenanceCompleteness * 0.28 +
        structuralFidelity * 0.2 +
        readingOrder * 0.2 -
        (critical ? 0.35 : 0),
    ),
  );
  return {
    coverage: Number(coverage.toFixed(4)),
    readingOrder: Number(readingOrder.toFixed(4)),
    structuralFidelity: Number(structuralFidelity.toFixed(4)),
    provenanceCompleteness: Number(provenanceCompleteness.toFixed(4)),
    overall: Number(overall.toFixed(4)),
    requiresHumanReview:
      critical ||
      overall < 0.82 ||
      warnings.some((warning) => warning.severity === 'warning'),
  };
}

export const ExtractEvidenceMessageSchema = z.object({
  version: z.literal(1),
  type: z.literal('extract_evidence'),
  tenantId: z.string().uuid(),
  evidenceVersionId: z.string().uuid(),
  objectId: z.string().uuid(),
  jobId: z.string().uuid(),
  correlationId: z.string().uuid(),
});
export type ExtractEvidenceMessage = z.infer<typeof ExtractEvidenceMessageSchema>;

export const CreateEvidenceDocumentInputSchema = z.object({
  storedObjectId: z.string().uuid(),
  title: z.string().trim().min(1).max(500),
  sourceType: z.string().trim().min(2).max(120),
  evidenceClass: EvidenceClassSchema,
  confidentiality: ConfidentialitySchema,
  disclosurePolicy: DisclosurePolicySchema,
  versionLabel: z.string().trim().min(1).max(120),
  scope: ScopeSchema,
  effectiveFrom: z.string().date().nullable(),
  effectiveUntil: z.string().date().nullable(),
  reviewDueAt: z.string().date().nullable(),
});

export const EvidenceSearchInputSchema = z.object({
  query: z.string().trim().min(2).max(4000),
  requestedScope: ScopeSchema,
  operation: z
    .enum(['internal_answer_support', 'external_summary', 'external_quote'])
    .default('internal_answer_support'),
  includeHistorical: z.boolean().default(false),
  limit: z.number().int().min(1).max(50).default(10),
});

export const ApproveEvidenceInputSchema = z.object({
  rationale: z.string().trim().min(3).max(4000),
  restricted: z.boolean().default(false),
});
