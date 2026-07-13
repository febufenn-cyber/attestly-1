import { describe, expect, it } from 'vitest';
import {
  answerStateConfidenceCap,
  calculateConfidence,
  citationQuoteMatches,
  deriveAnswerState,
  emptyScope,
  generationInputHash,
  materializeDraft,
  validateDraft,
  type EvidenceCandidate,
  type GenerationInput,
  type ModelDraftOutput,
} from './index';

const tenantId = '10000000-0000-4000-8000-000000000001';
const snapshotId = '20000000-0000-4000-8000-000000000001';
const questionId = '30000000-0000-4000-8000-000000000001';
const runId = '40000000-0000-4000-8000-000000000001';
const spanId = '50000000-0000-4000-8000-000000000001';
const versionId = '60000000-0000-4000-8000-000000000001';

function candidate(overrides: Partial<EvidenceCandidate> = {}): EvidenceCandidate {
  return {
    spanId,
    evidenceVersionId: versionId,
    documentTitle: 'Access Control Standard',
    versionLabel: '2026.1',
    text: 'Privileged user access is reviewed quarterly by the security team.',
    normalizedText: 'privileged user access is reviewed quarterly by the security team.',
    pageNumber: 4,
    sheetName: null,
    cellRange: null,
    headingPath: ['Access Review'],
    evidenceClass: 'operational_proof',
    disclosurePolicy: 'external_quote_allowed',
    scopeMatch: 'exact',
    authorityScore: 0.95,
    freshnessScore: 0.95,
    extractionQuality: 0.95,
    retrievalScore: 0.94,
    historical: false,
    contradiction: false,
    contradictionSummary: null,
    ...overrides,
  };
}

function input(overrides: Partial<GenerationInput> = {}): GenerationInput {
  return {
    schemaVersion: 1,
    tenantId,
    questionnaireSnapshotId: snapshotId,
    snapshotHash: 'a'.repeat(64),
    generationRunId: runId,
    operation: 'internal_answer_draft',
    requestedScope: emptyScope('all'),
    question: {
      questionId,
      originalText: 'Do you review privileged access quarterly?',
      normalizedText: 'Do you review privileged access quarterly?',
      questionType: 'boolean_with_explanation',
      polarity: 'positive',
      answerFormat: {
        valueType: 'boolean',
        allowedValues: ['Yes', 'No'],
        storedValues: {},
        requiresExplanation: true,
        requiresAttachment: false,
        multilineAllowed: true,
        blankAllowed: false,
        notApplicableAllowed: true,
      },
      sourceLocation: { format: 'xlsx', sheetName: 'Security', cellRange: 'B12' },
      atomicRequests: [
        {
          localId: 'claim-1',
          sequence: 1,
          originalClause: 'review privileged access quarterly',
          normalizedClaim: 'Privileged access is reviewed quarterly.',
          qualifiers: ['quarterly'],
          materiality: 'material',
        },
      ],
    },
    candidates: [candidate()],
    model: {
      provider: 'test-provider',
      model: 'test-model',
      modelVersion: '1',
      promptVersion: 'phase5-v1',
      schemaVersion: 1,
    },
    ...overrides,
  };
}

function output(overrides: Partial<ModelDraftOutput> = {}): ModelDraftOutput {
  return {
    outwardValue: 'Yes',
    outwardText: 'Yes. Privileged access is reviewed quarterly.',
    claims: [
      {
        claimLocalId: 'claim-1',
        disposition: 'supported',
        proposedStatement: 'Privileged access is reviewed quarterly.',
        citationSpanIds: [spanId],
        citationQuotes: {
          [spanId]: 'Privileged user access is reviewed quarterly by the security team.',
        },
        reasons: [],
        missingInformation: [],
      },
    ],
    suggestedRiskTier: 'medium',
    suggestedReviewers: ['security_reviewer'],
    limitations: [],
    ...overrides,
  };
}

describe('answer state doctrine', () => {
  it('derives supported only when every material claim is supported', () => {
    expect(
      deriveAnswerState([
        {
          claimLocalId: 'a',
          originalClause: 'a',
          normalizedClaim: 'a',
          qualifiers: [],
          materiality: 'material',
          disposition: 'supported',
          proposedStatement: 'a',
          citations: [],
          reasons: [],
          missingInformation: [],
        },
      ]),
    ).toBe('supported');
    expect(
      deriveAnswerState([
        {
          claimLocalId: 'a',
          originalClause: 'a',
          normalizedClaim: 'a',
          qualifiers: [],
          materiality: 'material',
          disposition: 'supported',
          proposedStatement: 'a',
          citations: [],
          reasons: [],
          missingInformation: [],
        },
        {
          claimLocalId: 'b',
          originalClause: 'b',
          normalizedClaim: 'b',
          qualifiers: [],
          materiality: 'material',
          disposition: 'unsupported',
          proposedStatement: '',
          citations: [],
          reasons: [],
          missingInformation: [],
        },
      ]),
    ).toBe('partially_supported');
  });

  it('gives contradiction and scope mismatch precedence over partial support', () => {
    const base = {
      originalClause: 'x',
      normalizedClaim: 'x',
      qualifiers: [],
      materiality: 'material' as const,
      proposedStatement: '',
      citations: [],
      reasons: [],
      missingInformation: [],
    };
    expect(
      deriveAnswerState([
        { ...base, claimLocalId: 'a', disposition: 'supported' },
        { ...base, claimLocalId: 'b', disposition: 'contradicted' },
      ]),
    ).toBe('contradicted');
    expect(
      deriveAnswerState([
        { ...base, claimLocalId: 'a', disposition: 'supported' },
        { ...base, claimLocalId: 'b', disposition: 'scope_mismatch' },
      ]),
    ).toBe('scope_mismatch');
  });
});

describe('deterministic validation', () => {
  it('accepts an exact citation and supported claim', () => {
    expect(validateDraft(input(), output())).toEqual({ passed: true, errors: [], warnings: [] });
    expect(citationQuoteMatches(candidate(), 'access is reviewed quarterly')).toBe(true);
  });

  it('rejects fabricated citations', () => {
    const result = validateDraft(
      input(),
      output({
        claims: [
          {
            ...output().claims[0],
            citationSpanIds: ['70000000-0000-4000-8000-000000000001'],
            citationQuotes: {
              '70000000-0000-4000-8000-000000000001': 'made up quote',
            },
          },
        ],
      }),
    );
    expect(result.errors.some((error) => error.startsWith('fabricated_citation'))).toBe(true);
  });

  it('rejects a quote not present in the source span', () => {
    const result = validateDraft(
      input(),
      output({
        claims: [
          {
            ...output().claims[0],
            citationQuotes: { [spanId]: 'All access is always reviewed immediately.' },
          },
        ],
      }),
    );
    expect(result.errors.some((error) => error.startsWith('citation_quote_mismatch'))).toBe(true);
  });

  it('rejects scope-mismatched evidence even when text is relevant', () => {
    const result = validateDraft(input({ candidates: [candidate({ scopeMatch: 'mismatch' })] }), output());
    expect(result.errors.some((error) => error.startsWith('scope_mismatched_citation'))).toBe(true);
  });

  it('rejects internal-only evidence for external summaries', () => {
    const result = validateDraft(
      input({
        operation: 'external_summary_draft',
        candidates: [candidate({ disclosurePolicy: 'internal_citation_only' })],
      }),
      output(),
    );
    expect(result.errors.some((error) => error.startsWith('disclosure_policy_violation'))).toBe(true);
  });

  it('rejects an affirmative answer when any material claim lacks support', () => {
    const compound = input({
      question: {
        ...input().question,
        atomicRequests: [
          ...input().question.atomicRequests,
          {
            localId: 'claim-2',
            sequence: 2,
            originalClause: 'rotate keys annually',
            normalizedClaim: 'Keys are rotated annually.',
            qualifiers: ['annually'],
            materiality: 'material',
          },
        ],
      },
    });
    const result = validateDraft(
      compound,
      output({
        claims: [
          ...output().claims,
          {
            claimLocalId: 'claim-2',
            disposition: 'unsupported',
            proposedStatement: '',
            citationSpanIds: [],
            citationQuotes: {},
            reasons: ['No evidence'],
            missingInformation: ['Key rotation record'],
          },
        ],
      }),
    );
    expect(result.errors).toContain('unsupported_affirmative_answer');
  });

  it('rejects broadened universal language', () => {
    const result = validateDraft(
      input(),
      output({
        claims: [
          {
            ...output().claims[0],
            proposedStatement: 'All privileged access is always reviewed quarterly.',
          },
        ],
      }),
    );
    expect(result.errors.some((error) => error.startsWith('broadened_quantifier'))).toBe(true);
  });

  it('enforces outward answer constraints', () => {
    const result = validateDraft(input(), output({ outwardValue: 'Maybe' }));
    expect(result.errors).toContain('answer_value_not_allowed');
  });
});

describe('materialization and confidence', () => {
  it('materializes a supported answer with exact citations and reviewer requirements', () => {
    const draft = materializeDraft(input(), output());
    expect(draft.state).toBe('supported');
    expect(draft.deterministicValidation.passed).toBe(true);
    expect(draft.claims[0].citations[0].spanId).toBe(spanId);
    expect(draft.requiredReviewers).toContain('security_reviewer');
    expect(draft.confidence.overall).toBeGreaterThan(0.8);
  });

  it('fails closed when deterministic validation fails', () => {
    const draft = materializeDraft(input(), output({ outwardValue: 'Maybe' }));
    expect(draft.state).toBe('blocked_from_automation');
    expect(draft.outwardValue).toBeNull();
    expect(draft.outwardText).toBe('');
    expect(draft.deterministicValidation.passed).toBe(false);
  });

  it('caps confidence for non-supported states', () => {
    expect(answerStateConfidenceCap('no_evidence')).toBe(0.12);
    const claims = materializeDraft(input(), output()).claims.map((claim) => ({
      ...claim,
      disposition: 'scope_mismatch' as const,
    }));
    const confidence = calculateConfidence(claims, [candidate()], 'scope_mismatch');
    expect(confidence.overall).toBeLessThanOrEqual(0.2);
  });

  it('hashes generation inputs deterministically', () => {
    expect(generationInputHash(input())).toBe(generationInputHash(input()));
    expect(generationInputHash(input())).not.toBe(
      generationInputHash(input({ operation: 'external_quote_draft' })),
    );
  });
});
