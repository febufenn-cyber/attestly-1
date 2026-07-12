import { describe, expect, it } from 'vitest';
import {
  classifyPackageDiff,
  compileExportPlan,
  decomposeCompoundQuestion,
  detectPolarity,
  determineCompatibility,
  escapeCsvFormula,
  evaluateCondition,
  normalizeQuestion,
  structuralFingerprint,
  validateConditionGraph,
  type AnswerDestination,
  type QuestionnaireQuestion,
  type StructuralInventory,
} from './index';

const confidence = {
  questionBoundary: 1,
  questionType: 1,
  instructionSeparation: 1,
  answerDestination: 1,
  answerFormat: 1,
  conditionalRelationship: 1,
  compoundDecomposition: 1,
  sectionAssignment: 1,
  scopeInference: 1,
  exportSafety: 1,
};

const baseQuestion: QuestionnaireQuestion = {
  localId: 'q1',
  originalText: 'Is MFA required?',
  normalizedText: 'Is MFA required?',
  type: 'boolean',
  polarity: 'positive',
  displayOrder: 1,
  sectionPath: ['Access control'],
  sourceLocation: { format: 'xlsx', sheetName: 'Questions', cellRange: 'B2', sectionPath: [], neighbouringLabels: [] },
  answerFormat: {
    valueType: 'boolean',
    allowedValues: [],
    storedValues: { true: 'Y', false: 'N' },
    requiresExplanation: false,
    requiresAttachment: false,
    multilineAllowed: false,
    blankAllowed: false,
    notApplicableAllowed: false,
  },
  answerDestinationLocalIds: ['d1'],
  atomicRequests: [],
  inclusionStatus: 'included',
  confidence,
  parserNotes: [],
};

const destination: AnswerDestination = {
  localId: 'd1',
  type: 'xlsx_cell',
  location: { format: 'xlsx', sheetName: 'Questions', cellRange: 'C2', sectionPath: [], neighbouringLabels: [] },
  expectedValueType: 'boolean',
  allowedValues: ['Y', 'N'],
  storedValues: { true: 'Y', false: 'N' },
  formulaPresent: false,
  protected: false,
  writeStrategy: 'replace_value',
};

describe('question normalization and decomposition', () => {
  it('preserves semantic qualifiers while cleaning whitespace', () => {
    expect(normalizeQuestion('  Is   all production data encrypted? ')).toBe('Is all production data encrypted?');
  });

  it('detects negative-polarity security questions', () => {
    expect(detectPolarity('Do you permit shared administrator accounts?')).toBe('negative');
  });

  it('decomposes independently verifiable clauses', () => {
    const claims = decomposeCompoundQuestion(
      'Do you encrypt customer data at rest and in transit, rotate keys annually, and restrict key access?',
    );
    expect(claims.length).toBeGreaterThanOrEqual(3);
    expect(claims.some((claim) => claim.qualifiers.includes('annually'))).toBe(true);
  });
});

describe('conditional graph', () => {
  it('uses active, inactive, and unknown states', () => {
    const expression = { operator: 'equals' as const, questionLocalId: 'q0', value: 'Yes' };
    expect(evaluateCondition(expression, {})).toBe('unknown');
    expect(evaluateCondition(expression, { q0: 'Yes' })).toBe('active');
    expect(evaluateCondition(expression, { q0: 'No' })).toBe('inactive');
  });

  it('detects cycles and missing references', () => {
    const errors = validateConditionGraph(['q1', 'q2'], [
      {
        localId: 'c1',
        childQuestionLocalId: 'q2',
        originalInstruction: 'if q1 yes',
        expression: { operator: 'equals', questionLocalId: 'q1', value: 'Yes' },
        parserConfidence: 1,
        humanConfirmed: true,
      },
      {
        localId: 'c2',
        childQuestionLocalId: 'q1',
        originalInstruction: 'if q2 yes',
        expression: { operator: 'equals', questionLocalId: 'q2', value: 'Yes' },
        parserConfidence: 1,
        humanConfirmed: true,
      },
    ]);
    expect(errors.some((error) => error.includes('cycle'))).toBe(true);
  });
});

describe('compatibility and fingerprints', () => {
  const inventory: StructuralInventory = {
    format: 'xlsx',
    sourceSha256: 'a'.repeat(64),
    sheetNames: ['Questions'],
    sheetVisibility: { Questions: 'visible' },
    usedRanges: { Questions: 'A1:C2' },
    hiddenRows: {},
    hiddenColumns: {},
    mergedRanges: {},
    formulaCells: {},
    validationCells: {},
    namedRanges: [],
    externalLinks: [],
    embeddedObjects: [],
    macroPresent: false,
    protectedWorkbook: false,
    protectedSheets: [],
    unsupportedParts: [],
    packagePartHashes: {},
  };

  it('returns a stable structural fingerprint', () => {
    expect(structuralFingerprint(inventory)).toMatch(/^[a-f0-9]{64}$/);
    expect(structuralFingerprint(inventory)).toBe(structuralFingerprint({ ...inventory }));
  });

  it('blocks automatic compatibility for macro-dependent workbooks', () => {
    expect(determineCompatibility({ ...inventory, macroPresent: true }, [])).toBe('manual_mapping_required');
  });
});

describe('export compiler', () => {
  it('maps boolean labels to stored dropdown values', () => {
    const result = compileExportPlan({
      questions: [baseQuestion],
      destinations: [destination],
      conditions: [],
      answers: { q1: true },
    });
    expect(result.blockingErrors).toEqual([]);
    expect(result.operations[0]?.outwardValue).toBe('Y');
  });

  it('never writes an inactive child answer', () => {
    const result = compileExportPlan({
      questions: [baseQuestion],
      destinations: [destination],
      conditions: [
        {
          localId: 'condition-1',
          childQuestionLocalId: 'q1',
          originalInstruction: 'Answer only when q0 is Yes',
          expression: { operator: 'equals', questionLocalId: 'q0', value: 'Yes' },
          parserConfidence: 1,
          humanConfirmed: true,
        },
      ],
      answers: { q0: 'No', q1: true },
    });
    expect(result.operations[0]?.operationType).toBe('leave_blank');
  });

  it('blocks writes to formula destinations', () => {
    const result = compileExportPlan({
      questions: [baseQuestion],
      destinations: [{ ...destination, formulaPresent: true }],
      conditions: [],
      answers: { q1: true },
    });
    expect(result.operations).toHaveLength(0);
    expect(result.blockingErrors[0]).toContain('formula');
  });

  it('escapes spreadsheet formula injection in CSV values', () => {
    expect(escapeCsvFormula('=HYPERLINK("bad")')).toEqual({ value: "'=HYPERLINK(\"bad\")", changed: true });
    expect(escapeCsvFormula('normal')).toEqual({ value: 'normal', changed: false });
  });

  it('classifies unrelated package changes as blocking', () => {
    const diffs = classifyPackageDiff(
      { 'xl/workbook.xml': 'a', 'xl/worksheets/sheet1.xml': 'b' },
      { 'xl/workbook.xml': 'changed', 'xl/worksheets/sheet1.xml': 'changed' },
      new Set(['xl/worksheets/sheet1.xml']),
    );
    expect(diffs.find((diff) => diff.path === 'xl/workbook.xml')?.classification).toBe('blocking');
    expect(diffs.find((diff) => diff.path === 'xl/worksheets/sheet1.xml')?.classification).toBe('expected');
  });
});
