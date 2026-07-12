import { createHash } from 'node:crypto';
import { z } from 'zod';

export const QuestionnaireFormatSchema = z.enum(['xlsx', 'csv', 'docx', 'pdf']);
export type QuestionnaireFormat = z.infer<typeof QuestionnaireFormatSchema>;

export const CompatibilityStatusSchema = z.enum([
  'compatible',
  'compatible_with_warnings',
  'manual_mapping_required',
  'import_only',
  'unsupported',
]);
export type CompatibilityStatus = z.infer<typeof CompatibilityStatusSchema>;

export const QuestionTypeSchema = z.enum([
  'boolean',
  'boolean_with_explanation',
  'single_choice',
  'multi_choice',
  'free_text',
  'numeric',
  'date',
  'percentage',
  'attachment_request',
  'table_row',
  'matrix',
  'compound',
  'conditional_parent',
  'conditional_child',
  'acknowledgement',
  'unknown',
]);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

export const QuestionPolaritySchema = z.enum(['positive', 'negative', 'neutral', 'unknown']);
export type QuestionPolarity = z.infer<typeof QuestionPolaritySchema>;

export const AnswerValueTypeSchema = z.enum([
  'text',
  'boolean',
  'single_choice',
  'multi_choice',
  'number',
  'percentage',
  'date',
  'attachment',
]);

export const SourceLocationSchema = z.object({
  format: QuestionnaireFormatSchema,
  sheetName: z.string().optional(),
  cellRange: z.string().optional(),
  rowIndex: z.number().int().positive().optional(),
  columnIndex: z.number().int().positive().optional(),
  headerName: z.string().optional(),
  paragraphId: z.string().optional(),
  tableId: z.string().optional(),
  tableRow: z.number().int().nonnegative().optional(),
  tableCell: z.number().int().nonnegative().optional(),
  contentControlId: z.string().optional(),
  byteStart: z.number().int().nonnegative().optional(),
  byteEnd: z.number().int().nonnegative().optional(),
  sectionPath: z.array(z.string()).default([]),
  neighbouringLabels: z.array(z.string()).default([]),
});
export type SourceLocation = z.infer<typeof SourceLocationSchema>;

export const AnswerFormatSchema = z.object({
  valueType: AnswerValueTypeSchema,
  allowedValues: z.array(z.string()).default([]),
  storedValues: z.record(z.string(), z.string()).default({}),
  requiresExplanation: z.boolean().default(false),
  requiresAttachment: z.boolean().default(false),
  characterLimit: z.number().int().positive().optional(),
  wordLimit: z.number().int().positive().optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  decimalPlaces: z.number().int().min(0).max(12).optional(),
  dateFormat: z.string().optional(),
  multilineAllowed: z.boolean().default(true),
  blankAllowed: z.boolean().default(true),
  notApplicableAllowed: z.boolean().default(true),
});
export type AnswerFormat = z.infer<typeof AnswerFormatSchema>;

export const MappingConfidenceSchema = z.object({
  questionBoundary: z.number().min(0).max(1),
  questionType: z.number().min(0).max(1),
  instructionSeparation: z.number().min(0).max(1),
  answerDestination: z.number().min(0).max(1),
  answerFormat: z.number().min(0).max(1),
  conditionalRelationship: z.number().min(0).max(1),
  compoundDecomposition: z.number().min(0).max(1),
  sectionAssignment: z.number().min(0).max(1),
  scopeInference: z.number().min(0).max(1),
  exportSafety: z.number().min(0).max(1),
});
export type MappingConfidence = z.infer<typeof MappingConfidenceSchema>;

export const AtomicClaimRequestSchema = z.object({
  localId: z.string().min(1),
  sequence: z.number().int().positive(),
  originalClause: z.string().min(1),
  normalizedClaim: z.string().min(1),
  qualifiers: z.array(z.string()).default([]),
  materiality: z.enum(['material', 'supporting']).default('material'),
});
export type AtomicClaimRequest = z.infer<typeof AtomicClaimRequestSchema>;

export const AnswerDestinationSchema = z.object({
  localId: z.string().min(1),
  type: z.enum([
    'xlsx_cell',
    'csv_field',
    'docx_content_control',
    'docx_table_cell',
    'manual',
  ]),
  location: SourceLocationSchema,
  expectedValueType: AnswerValueTypeSchema,
  allowedValues: z.array(z.string()).default([]),
  storedValues: z.record(z.string(), z.string()).default({}),
  formulaPresent: z.boolean().default(false),
  protected: z.boolean().default(false),
  styleHash: z.string().optional(),
  validationHash: z.string().optional(),
  writeStrategy: z.enum(['replace_value', 'append_text', 'manual']).default('replace_value'),
});
export type AnswerDestination = z.infer<typeof AnswerDestinationSchema>;

export const QuestionnaireQuestionSchema = z.object({
  localId: z.string().min(1),
  externalIdentifier: z.string().optional(),
  originalText: z.string().min(1),
  normalizedText: z.string().min(1),
  type: QuestionTypeSchema,
  polarity: QuestionPolaritySchema,
  displayOrder: z.number().int().nonnegative(),
  sectionPath: z.array(z.string()).default([]),
  sourceLocation: SourceLocationSchema,
  answerFormat: AnswerFormatSchema,
  answerDestinationLocalIds: z.array(z.string()).default([]),
  atomicRequests: z.array(AtomicClaimRequestSchema).default([]),
  parentLocalId: z.string().optional(),
  inclusionStatus: z.enum(['included', 'excluded', 'needs_review']).default('included'),
  confidence: MappingConfidenceSchema,
  parserNotes: z.array(z.string()).default([]),
});
export type QuestionnaireQuestion = z.infer<typeof QuestionnaireQuestionSchema>;

export const ConditionExpressionSchema: z.ZodType<ConditionExpression> = z.lazy(() =>
  z.union([
    z.object({
      operator: z.enum(['equals', 'not_equals', 'contains', 'is_blank', 'is_not_blank']),
      questionLocalId: z.string().min(1),
      value: z.string().optional(),
    }),
    z.object({
      operator: z.enum(['and', 'or']),
      conditions: z.array(ConditionExpressionSchema).min(1),
    }),
    z.object({ operator: z.literal('not'), condition: ConditionExpressionSchema }),
  ]),
);
export type ConditionExpression =
  | {
      operator: 'equals' | 'not_equals' | 'contains' | 'is_blank' | 'is_not_blank';
      questionLocalId: string;
      value?: string;
    }
  | { operator: 'and' | 'or'; conditions: ConditionExpression[] }
  | { operator: 'not'; condition: ConditionExpression };

export const QuestionnaireConditionSchema = z.object({
  localId: z.string().min(1),
  childQuestionLocalId: z.string().min(1),
  originalInstruction: z.string().min(1),
  expression: ConditionExpressionSchema,
  parserConfidence: z.number().min(0).max(1),
  humanConfirmed: z.boolean().default(false),
});
export type QuestionnaireCondition = z.infer<typeof QuestionnaireConditionSchema>;

export const CompatibilityWarningSchema = z.object({
  code: z.string().min(2),
  severity: z.enum(['info', 'warning', 'critical']),
  message: z.string().min(1),
  sourceLocation: SourceLocationSchema.optional(),
  affectedQuestionLocalIds: z.array(z.string()).default([]),
  affectedDestinationLocalIds: z.array(z.string()).default([]),
  recommendedAction: z.string().min(1),
  exportBlocking: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type CompatibilityWarning = z.infer<typeof CompatibilityWarningSchema>;

export const StructuralInventorySchema = z.object({
  format: QuestionnaireFormatSchema,
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sheetNames: z.array(z.string()).default([]),
  sheetVisibility: z.record(z.string(), z.enum(['visible', 'hidden', 'very_hidden'])).default({}),
  usedRanges: z.record(z.string(), z.string()).default({}),
  hiddenRows: z.record(z.string(), z.array(z.number().int().positive())).default({}),
  hiddenColumns: z.record(z.string(), z.array(z.string())).default({}),
  mergedRanges: z.record(z.string(), z.array(z.string())).default({}),
  formulaCells: z.record(z.string(), z.array(z.string())).default({}),
  validationCells: z.record(z.string(), z.array(z.string())).default({}),
  namedRanges: z.array(z.string()).default([]),
  externalLinks: z.array(z.string()).default([]),
  embeddedObjects: z.array(z.string()).default([]),
  macroPresent: z.boolean().default(false),
  protectedWorkbook: z.boolean().default(false),
  protectedSheets: z.array(z.string()).default([]),
  unsupportedParts: z.array(z.string()).default([]),
  packagePartHashes: z.record(z.string(), z.string()).default({}),
});
export type StructuralInventory = z.infer<typeof StructuralInventorySchema>;

export const QuestionnaireManifestSchema = z.object({
  manifestVersion: z.literal(1),
  processorName: z.string().min(1),
  processorVersion: z.string().min(1),
  rulesetVersion: z.string().min(1),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  format: QuestionnaireFormatSchema,
  compatibilityStatus: CompatibilityStatusSchema,
  compatibilityDimensions: z.object({
    import: CompatibilityStatusSchema,
    questionDetection: CompatibilityStatusSchema,
    answerMapping: CompatibilityStatusSchema,
    conditionalLogic: CompatibilityStatusSchema,
    export: CompatibilityStatusSchema,
  }),
  structuralFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  inventory: StructuralInventorySchema,
  questions: z.array(QuestionnaireQuestionSchema),
  destinations: z.array(AnswerDestinationSchema),
  conditions: z.array(QuestionnaireConditionSchema),
  instructions: z.array(
    z.object({
      localId: z.string(),
      scope: z.enum(['workbook', 'sheet', 'section', 'question', 'answer_field']),
      category: z.enum([
        'allowed_values',
        'character_limit',
        'required_explanation',
        'required_evidence',
        'conditional',
        'formatting',
        'submission',
        'untrusted_operational',
        'ambiguous',
      ]),
      text: z.string(),
      sourceLocation: SourceLocationSchema,
    }),
  ),
  warnings: z.array(CompatibilityWarningSchema),
  statistics: z.object({
    detectedQuestions: z.number().int().nonnegative(),
    detectedDestinations: z.number().int().nonnegative(),
    unresolvedMappings: z.number().int().nonnegative(),
  }),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
});
export type QuestionnaireManifest = z.infer<typeof QuestionnaireManifestSchema>;

export type ConditionActivation = 'active' | 'inactive' | 'unknown';

export function normalizeQuestion(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectPolarity(text: string): QuestionPolarity {
  const normalized = normalizeQuestion(text).toLowerCase();
  const negativePatterns = [
    /\bdo you (?:allow|permit|use|share)\b/,
    /\bare (?:shared|default|generic) .+ (?:allowed|permitted)\b/,
    /\bwithout\b/,
    /\bnot prohibited\b/,
  ];
  if (negativePatterns.some((pattern) => pattern.test(normalized))) return 'negative';
  if (/\bdo you\b|\bis .+ (?:enabled|required|implemented)\b|\bdoes your\b/.test(normalized)) {
    return 'positive';
  }
  if (/\bdescribe\b|\bprovide\b|\bspecify\b/.test(normalized)) return 'neutral';
  return 'unknown';
}

const qualifierPatterns = [
  /\ball\b/gi,
  /\bany\b/gi,
  /\bproduction\b/gi,
  /\bcustomer(?:-managed)?\b/gi,
  /\bannually\b/gi,
  /\bquarterly\b/gi,
  /\bmonthly\b/gi,
  /\bwithin\s+\d+\s+(?:hours?|days?)\b/gi,
  /\bat least\b/gi,
  /\bwithout exception\b/gi,
];

export function extractQualifiers(text: string): string[] {
  const matches = new Set<string>();
  for (const pattern of qualifierPatterns) {
    for (const match of text.matchAll(pattern)) matches.add(match[0].toLowerCase());
  }
  return [...matches].sort();
}

export function decomposeCompoundQuestion(text: string): AtomicClaimRequest[] {
  const normalized = normalizeQuestion(text).replace(/[?]+$/, '');
  const prefixMatch = normalized.match(/^(do you|does your organization|are you|is your organization)\s+/i);
  const body = prefixMatch ? normalized.slice(prefixMatch[0].length) : normalized;
  const clauses = body
    .split(/\s*(?:,\s*(?:and|or)\s+|;\s*|\band\b(?=\s+(?:restrict|rotate|encrypt|review|monitor|retain|require|perform|provide|maintain|use|store|process))|\bor\b(?=\s+(?:restrict|rotate|encrypt|review|monitor|retain|require|perform|provide|maintain|use|store|process)))\s*/i)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 3);

  if (clauses.length < 2) {
    return [
      {
        localId: 'claim-1',
        sequence: 1,
        originalClause: normalized,
        normalizedClaim: normalized,
        qualifiers: extractQualifiers(normalized),
        materiality: 'material',
      },
    ];
  }

  return clauses.map((clause, index) => ({
    localId: `claim-${index + 1}`,
    sequence: index + 1,
    originalClause: clause,
    normalizedClaim: normalizeQuestion(clause),
    qualifiers: extractQualifiers(clause),
    materiality: 'material',
  }));
}

export function evaluateCondition(
  expression: ConditionExpression,
  answers: Readonly<Record<string, unknown>>,
): ConditionActivation {
  if (expression.operator === 'and') {
    const values = expression.conditions.map((condition) => evaluateCondition(condition, answers));
    if (values.includes('inactive')) return 'inactive';
    return values.every((value) => value === 'active') ? 'active' : 'unknown';
  }
  if (expression.operator === 'or') {
    const values = expression.conditions.map((condition) => evaluateCondition(condition, answers));
    if (values.includes('active')) return 'active';
    return values.every((value) => value === 'inactive') ? 'inactive' : 'unknown';
  }
  if (expression.operator === 'not') {
    const value = evaluateCondition(expression.condition, answers);
    return value === 'active' ? 'inactive' : value === 'inactive' ? 'active' : 'unknown';
  }
  if (!('questionLocalId' in expression)) return 'unknown';

  const raw = answers[expression.questionLocalId];
  if (raw === undefined || raw === null) return 'unknown';
  const value = String(raw).trim();
  if (expression.operator === 'is_blank') return value === '' ? 'active' : 'inactive';
  if (expression.operator === 'is_not_blank') return value !== '' ? 'active' : 'inactive';
  if (expression.operator === 'equals') return value === String(expression.value ?? '') ? 'active' : 'inactive';
  if (expression.operator === 'not_equals') return value !== String(expression.value ?? '') ? 'active' : 'inactive';
  return value.toLowerCase().includes(String(expression.value ?? '').toLowerCase()) ? 'active' : 'inactive';
}

function referencedQuestions(expression: ConditionExpression): string[] {
  if ('questionLocalId' in expression) return [expression.questionLocalId];
  if (expression.operator === 'not') return referencedQuestions(expression.condition);
  return expression.conditions.flatMap(referencedQuestions);
}

export function validateConditionGraph(
  questionIds: readonly string[],
  conditions: readonly QuestionnaireCondition[],
): string[] {
  const errors: string[] = [];
  const known = new Set(questionIds);
  const graph = new Map<string, Set<string>>();

  for (const condition of conditions) {
    if (!known.has(condition.childQuestionLocalId)) {
      errors.push(`Condition ${condition.localId} references missing child ${condition.childQuestionLocalId}.`);
    }
    for (const parent of referencedQuestions(condition.expression)) {
      if (!known.has(parent)) errors.push(`Condition ${condition.localId} references missing parent ${parent}.`);
      if (parent === condition.childQuestionLocalId) {
        errors.push(`Condition ${condition.localId} creates a self-dependency.`);
      }
      const edges = graph.get(parent) ?? new Set<string>();
      edges.add(condition.childQuestionLocalId);
      graph.set(parent, edges);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): void => {
    if (visiting.has(node)) {
      errors.push(`Conditional cycle detected at ${node}.`);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    for (const child of graph.get(node) ?? []) visit(child);
    visiting.delete(node);
    visited.add(node);
  };
  for (const id of questionIds) visit(id);
  return [...new Set(errors)];
}

export function determineCompatibility(
  inventory: StructuralInventory,
  warnings: readonly CompatibilityWarning[],
): CompatibilityStatus {
  if (inventory.format === 'pdf') return 'import_only';
  if (inventory.macroPresent || inventory.unsupportedParts.some((part) => /vba|activex/i.test(part))) {
    return 'manual_mapping_required';
  }
  if (warnings.some((warning) => warning.severity === 'critical' && warning.exportBlocking)) {
    return 'manual_mapping_required';
  }
  if (warnings.some((warning) => warning.severity !== 'info')) return 'compatible_with_warnings';
  return 'compatible';
}

export function structuralFingerprint(inventory: StructuralInventory): string {
  const stable = {
    format: inventory.format,
    sheetNames: inventory.sheetNames,
    sheetVisibility: inventory.sheetVisibility,
    usedRanges: inventory.usedRanges,
    mergedRanges: inventory.mergedRanges,
    formulaCells: inventory.formulaCells,
    validationCells: inventory.validationCells,
    namedRanges: [...inventory.namedRanges].sort(),
    macroPresent: inventory.macroPresent,
    protectedSheets: [...inventory.protectedSheets].sort(),
    unsupportedParts: [...inventory.unsupportedParts].sort(),
  };
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

export function snapshotHash(input: {
  sourceSha256: string;
  processorVersion: string;
  mappingVersion: number;
  scope: unknown;
  questions: readonly QuestionnaireQuestion[];
  destinations: readonly AnswerDestination[];
  conditions: readonly QuestionnaireCondition[];
}): string {
  const canonical = JSON.stringify({
    sourceSha256: input.sourceSha256,
    processorVersion: input.processorVersion,
    mappingVersion: input.mappingVersion,
    scope: input.scope,
    questions: [...input.questions].sort((a, b) => a.displayOrder - b.displayOrder),
    destinations: [...input.destinations].sort((a, b) => a.localId.localeCompare(b.localId)),
    conditions: [...input.conditions].sort((a, b) => a.localId.localeCompare(b.localId)),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export const ExportOperationSchema = z.object({
  localId: z.string().min(1),
  questionLocalId: z.string().min(1),
  destinationLocalId: z.string().min(1),
  operationType: z.enum([
    'write_cell_value',
    'write_docx_content_control',
    'write_docx_table_cell',
    'write_csv_field',
    'leave_blank',
    'write_not_applicable',
    'manual_action_required',
  ]),
  outwardValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  expectedOriginalValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  expectedFormulaState: z.boolean().default(false),
  expectedStyleHash: z.string().optional(),
  expectedValidationHash: z.string().optional(),
  conditionActivation: z.enum(['active', 'inactive', 'unknown']).default('active'),
});
export type ExportOperation = z.infer<typeof ExportOperationSchema>;

export function mapOutwardValue(value: unknown, format: AnswerFormat, destination: AnswerDestination): string | number | boolean | null {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value);
  const stored = destination.storedValues[normalized] ?? format.storedValues[normalized];
  if (stored !== undefined) return stored;
  if (format.valueType === 'number' || format.valueType === 'percentage') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new Error(`Value ${normalized} is not numeric.`);
    if (format.minimum !== undefined && numeric < format.minimum) throw new Error('Value is below the permitted minimum.');
    if (format.maximum !== undefined && numeric > format.maximum) throw new Error('Value is above the permitted maximum.');
    return numeric;
  }
  if (format.valueType === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (/^(yes|true|1)$/i.test(normalized)) return true;
    if (/^(no|false|0)$/i.test(normalized)) return false;
  }
  if (format.allowedValues.length && !format.allowedValues.includes(normalized)) {
    throw new Error(`Value ${normalized} is not in the allowed answer set.`);
  }
  if (format.characterLimit !== undefined && [...normalized].length > format.characterLimit) {
    throw new Error(`Value exceeds the ${format.characterLimit}-character limit.`);
  }
  return normalized;
}

export function compileExportPlan(input: {
  questions: readonly QuestionnaireQuestion[];
  destinations: readonly AnswerDestination[];
  conditions: readonly QuestionnaireCondition[];
  answers: Readonly<Record<string, unknown>>;
}): { operations: ExportOperation[]; blockingErrors: string[] } {
  const destinations = new Map(input.destinations.map((destination) => [destination.localId, destination]));
  const conditions = new Map(input.conditions.map((condition) => [condition.childQuestionLocalId, condition]));
  const operations: ExportOperation[] = [];
  const blockingErrors: string[] = [];

  for (const question of [...input.questions].sort((a, b) => a.displayOrder - b.displayOrder)) {
    if (question.inclusionStatus !== 'included') continue;
    const condition = conditions.get(question.localId);
    const activation = condition ? evaluateCondition(condition.expression, input.answers) : 'active';
    const answer = input.answers[question.localId];

    for (const destinationId of question.answerDestinationLocalIds) {
      const destination = destinations.get(destinationId);
      if (!destination) {
        blockingErrors.push(`Question ${question.localId} has missing destination ${destinationId}.`);
        continue;
      }
      if (destination.formulaPresent) {
        blockingErrors.push(`Destination ${destinationId} contains a formula.`);
        continue;
      }
      if (destination.protected) {
        blockingErrors.push(`Destination ${destinationId} is protected.`);
        continue;
      }
      if (activation === 'inactive') {
        operations.push({
          localId: `op-${operations.length + 1}`,
          questionLocalId: question.localId,
          destinationLocalId: destinationId,
          operationType: 'leave_blank',
          outwardValue: null,
          expectedFormulaState: false,
          conditionActivation: activation,
        });
        continue;
      }
      if (activation === 'unknown') {
        blockingErrors.push(`Question ${question.localId} has unresolved conditional activation.`);
        continue;
      }
      if (answer === undefined) {
        blockingErrors.push(`Question ${question.localId} has no answer value.`);
        continue;
      }
      try {
        const outwardValue = mapOutwardValue(answer, question.answerFormat, destination);
        const operationType =
          destination.type === 'xlsx_cell'
            ? 'write_cell_value'
            : destination.type === 'csv_field'
              ? 'write_csv_field'
              : destination.type === 'docx_content_control'
                ? 'write_docx_content_control'
                : destination.type === 'docx_table_cell'
                  ? 'write_docx_table_cell'
                  : 'manual_action_required';
        operations.push({
          localId: `op-${operations.length + 1}`,
          questionLocalId: question.localId,
          destinationLocalId: destinationId,
          operationType,
          outwardValue,
          expectedFormulaState: false,
          expectedStyleHash: destination.styleHash,
          expectedValidationHash: destination.validationHash,
          conditionActivation: activation,
        });
      } catch (error) {
        blockingErrors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  return { operations, blockingErrors: [...new Set(blockingErrors)] };
}

export function escapeCsvFormula(value: string): { value: string; changed: boolean } {
  if (/^[=+\-@]/.test(value)) return { value: `'${value}`, changed: true };
  return { value, changed: false };
}

export type StructuralDiff = {
  path: string;
  beforeHash?: string;
  afterHash?: string;
  classification: 'expected' | 'benign_metadata' | 'requires_review' | 'blocking';
  reason: string;
};

export function classifyPackageDiff(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
  permittedParts: ReadonlySet<string>,
): StructuralDiff[] {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...paths]
    .sort()
    .filter((path) => before[path] !== after[path])
    .map((path) => {
      const expected = permittedParts.has(path);
      const benign = /docProps\/(?:core|app)\.xml$/i.test(path);
      return {
        path,
        beforeHash: before[path],
        afterHash: after[path],
        classification: expected ? 'expected' : benign ? 'benign_metadata' : 'blocking',
        reason: expected
          ? 'The export plan explicitly permits this package part to change.'
          : benign
            ? 'Document metadata may change during a safe save.'
            : 'An unrelated package part changed.',
      };
    });
}
