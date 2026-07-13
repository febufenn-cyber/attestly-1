import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  DisclosurePolicySchema,
  EvidenceClassSchema,
  ScopeMatchResultSchema,
  ScopeSchema,
  type EvidenceScope,
  type ScopeMatchResult,
} from '../../evidence/src/index';
import {
  AnswerFormatSchema,
  AtomicClaimRequestSchema,
  QuestionPolaritySchema,
  QuestionTypeSchema,
  SourceLocationSchema,
} from '../../questionnaire/src/index';

export const AnswerStateSchema = z.enum([
  'supported',
  'partially_supported',
  'historically_supported',
  'scope_mismatch',
  'contradicted',
  'no_evidence',
  'requires_sme',
  'requires_legal',
  'not_applicable',
  'ambiguous_question',
  'blocked_from_automation',
]);
export type AnswerState = z.infer<typeof AnswerStateSchema>;

export const ClaimDispositionSchema = z.enum([
  'supported',
  'unsupported',
  'historical_only',
  'scope_mismatch',
  'contradicted',
  'requires_sme',
  'requires_legal',
  'not_applicable',
  'ambiguous',
  'blocked',
]);
export type ClaimDisposition = z.infer<typeof ClaimDispositionSchema>;

export const RiskTierSchema = z.enum(['low', 'medium', 'high', 'critical']);
export type RiskTier = z.infer<typeof RiskTierSchema>;

export const ReviewerRoleSchema = z.enum([
  'knowledge_owner',
  'security_reviewer',
  'legal_reviewer',
  'final_approver',
]);
export type ReviewerRole = z.infer<typeof ReviewerRoleSchema>;

export const GenerationOperationSchema = z.enum([
  'internal_answer_draft',
  'external_summary_draft',
  'external_quote_draft',
]);
export type GenerationOperation = z.infer<typeof GenerationOperationSchema>;

export const EvidenceCandidateSchema = z.object({
  spanId: z.string().uuid(),
  evidenceVersionId: z.string().uuid(),
  documentTitle: z.string().min(1).max(500),
  versionLabel: z.string().min(1).max(120),
  text: z.string().min(1).max(50_000),
  normalizedText: z.string().min(1).max(50_000),
  pageNumber: z.number().int().positive().nullable().default(null),
  sheetName: z.string().max(255).nullable().default(null),
  cellRange: z.string().max(100).nullable().default(null),
  headingPath: z.array(z.string().max(500)).max(30).default([]),
  evidenceClass: EvidenceClassSchema,
  disclosurePolicy: DisclosurePolicySchema,
  scopeMatch: ScopeMatchResultSchema,
  authorityScore: z.number().min(0).max(1),
  freshnessScore: z.number().min(0).max(1),
  extractionQuality: z.number().min(0).max(1),
  retrievalScore: z.number().min(0).max(1),
  historical: z.boolean().default(false),
  contradiction: z.boolean().default(false),
  contradictionSummary: z.string().max(2_000).nullable().default(null),
});
export type EvidenceCandidate = z.infer<typeof EvidenceCandidateSchema>;

export const CitationSchema = z.object({
  spanId: z.string().uuid(),
  evidenceVersionId: z.string().uuid(),
  role: z.enum(['supports', 'limits', 'contradicts', 'context']),
  quote: z.string().min(1).max(5_000),
  claimLocalId: z.string().min(1).max(180),
});
export type Citation = z.infer<typeof CitationSchema>;

export const ClaimDraftSchema = z.object({
  claimLocalId: z.string().min(1).max(180),
  originalClause: z.string().min(1).max(10_000),
  normalizedClaim: z.string().min(1).max(10_000),
  qualifiers: z.array(z.string().max(120)).max(50).default([]),
  materiality: z.enum(['material', 'supporting']).default('material'),
  disposition: ClaimDispositionSchema,
  proposedStatement: z.string().max(10_000).default(''),
  citations: z.array(CitationSchema).max(50).default([]),
  reasons: z.array(z.string().min(1).max(1_000)).max(50).default([]),
  missingInformation: z.array(z.string().min(1).max(1_000)).max(50).default([]),
});
export type ClaimDraft = z.infer<typeof ClaimDraftSchema>;

export const ConfidenceDimensionsSchema = z.object({
  evidenceStrength: z.number().min(0).max(1),
  semanticRelevance: z.number().min(0).max(1),
  scopeMatch: z.number().min(0).max(1),
  freshness: z.number().min(0).max(1),
  sourceAuthority: z.number().min(0).max(1),
  contradictionSafety: z.number().min(0).max(1),
  extractionQuality: z.number().min(0).max(1),
  answerCompleteness: z.number().min(0).max(1),
  claimCitationAlignment: z.number().min(0).max(1),
  overall: z.number().min(0).max(1),
});
export type ConfidenceDimensions = z.infer<typeof ConfidenceDimensionsSchema>;

export const ModelIdentitySchema = z.object({
  provider: z.string().min(1).max(120),
  model: z.string().min(1).max(200),
  modelVersion: z.string().max(200).nullable().default(null),
  promptVersion: z.string().min(1).max(120),
  schemaVersion: z.literal(1),
});

export const DraftAnswerSchema = z.object({
  schemaVersion: z.literal(1),
  tenantId: z.string().uuid(),
  questionnaireSnapshotId: z.string().uuid(),
  questionId: z.string().uuid(),
  generationRunId: z.string().uuid(),
  state: AnswerStateSchema,
  outwardValue: z.string().max(20_000).nullable(),
  outwardText: z.string().max(20_000).default(''),
  claims: z.array(ClaimDraftSchema).min(1).max(100),
  confidence: ConfidenceDimensionsSchema,
  riskTier: RiskTierSchema,
  requiredReviewers: z.array(ReviewerRoleSchema).max(10).default([]),
  limitations: z.array(z.string().min(1).max(2_000)).max(100).default([]),
  contradictions: z.array(z.string().min(1).max(2_000)).max(100).default([]),
  missingInformation: z.array(z.string().min(1).max(2_000)).max(100).default([]),
  model: ModelIdentitySchema,
  generatedAt: z.string().datetime(),
  deterministicValidation: z.object({
    passed: z.boolean(),
    errors: z.array(z.string().max(2_000)).max(200),
    warnings: z.array(z.string().max(2_000)).max(200),
  }),
});
export type DraftAnswer = z.infer<typeof DraftAnswerSchema>;

export const GenerationQuestionSchema = z.object({
  questionId: z.string().uuid(),
  originalText: z.string().min(1).max(50_000),
  normalizedText: z.string().min(1).max(50_000),
  questionType: QuestionTypeSchema,
  polarity: QuestionPolaritySchema,
  answerFormat: AnswerFormatSchema,
  sourceLocation: SourceLocationSchema,
  atomicRequests: z.array(AtomicClaimRequestSchema).min(1).max(100),
});

export const GenerationInputSchema = z.object({
  schemaVersion: z.literal(1),
  tenantId: z.string().uuid(),
  questionnaireSnapshotId: z.string().uuid(),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  generationRunId: z.string().uuid(),
  operation: GenerationOperationSchema,
  requestedScope: ScopeSchema,
  question: GenerationQuestionSchema,
  candidates: z.array(EvidenceCandidateSchema).max(100),
  model: ModelIdentitySchema,
});
export type GenerationInput = z.infer<typeof GenerationInputSchema>;

export const ModelClaimOutputSchema = z.object({
  claimLocalId: z.string().min(1).max(180),
  disposition: ClaimDispositionSchema,
  proposedStatement: z.string().max(10_000).default(''),
  citationSpanIds: z.array(z.string().uuid()).max(50).default([]),
  citationQuotes: z.record(z.string().uuid(), z.string().min(1).max(5_000)).default({}),
  reasons: z.array(z.string().min(1).max(1_000)).max(50).default([]),
  missingInformation: z.array(z.string().min(1).max(1_000)).max(50).default([]),
});

export const ModelDraftOutputSchema = z.object({
  outwardValue: z.string().max(20_000).nullable().default(null),
  outwardText: z.string().max(20_000).default(''),
  claims: z.array(ModelClaimOutputSchema).min(1).max(100),
  suggestedRiskTier: RiskTierSchema.default('medium'),
  suggestedReviewers: z.array(ReviewerRoleSchema).max(10).default([]),
  limitations: z.array(z.string().min(1).max(2_000)).max(100).default([]),
});
export type ModelDraftOutput = z.infer<typeof ModelDraftOutputSchema>;

export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

const scopeConfidence: Record<ScopeMatchResult, number> = {
  exact: 1,
  compatible: 0.9,
  partial: 0.5,
  mismatch: 0,
  unknown: 0.2,
};

function normalizeComparable(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function quantifierSet(value: string): Set<string> {
  const matches = value
    .toLowerCase()
    .match(
      /\b(all|always|every|any|some|generally|where applicable|at least|without exception)\b/g,
    );
  return new Set(matches ?? []);
}

export function citationQuoteMatches(candidate: EvidenceCandidate, quote: string): boolean {
  const source = normalizeComparable(candidate.text);
  const expected = normalizeComparable(quote);
  return expected.length >= 8 && source.includes(expected);
}

export function operationAllowsCandidate(
  operation: GenerationOperation,
  policy: z.infer<typeof DisclosurePolicySchema>,
): boolean {
  if (operation === 'internal_answer_draft') return policy !== 'prohibited';
  if (operation === 'external_summary_draft') {
    return policy === 'external_quote_allowed' || policy === 'external_summary_only';
  }
  return policy === 'external_quote_allowed';
}

export function deriveAnswerState(claims: ClaimDraft[]): AnswerState {
  const material = claims.filter((claim) => claim.materiality === 'material');
  const active = material.length > 0 ? material : claims;
  const dispositions = new Set(active.map((claim) => claim.disposition));

  if (dispositions.has('blocked')) return 'blocked_from_automation';
  if (dispositions.has('ambiguous')) return 'ambiguous_question';
  if (dispositions.has('requires_legal')) return 'requires_legal';
  if (dispositions.has('contradicted')) return 'contradicted';
  if (dispositions.has('scope_mismatch')) return 'scope_mismatch';
  if (dispositions.has('requires_sme')) return 'requires_sme';
  if ([...dispositions].every((value) => value === 'not_applicable')) return 'not_applicable';
  if ([...dispositions].every((value) => value === 'historical_only')) {
    return 'historically_supported';
  }
  if ([...dispositions].every((value) => value === 'unsupported')) return 'no_evidence';
  if ([...dispositions].every((value) => value === 'supported')) return 'supported';
  return 'partially_supported';
}

export function answerStateConfidenceCap(state: AnswerState): number {
  return {
    supported: 1,
    partially_supported: 0.62,
    historically_supported: 0.42,
    scope_mismatch: 0.2,
    contradicted: 0.28,
    no_evidence: 0.12,
    requires_sme: 0.35,
    requires_legal: 0.35,
    not_applicable: 0.8,
    ambiguous_question: 0.25,
    blocked_from_automation: 0.1,
  }[state];
}

export function calculateConfidence(
  claims: ClaimDraft[],
  candidates: EvidenceCandidate[],
  state: AnswerState,
): ConfidenceDimensions {
  const citedIds = new Set(
    claims.flatMap((claim) => claim.citations.map((citation) => citation.spanId)),
  );
  const cited = candidates.filter((candidate) => citedIds.has(candidate.spanId));
  const material = claims.filter((claim) => claim.materiality === 'material');
  const claimSet = material.length > 0 ? material : claims;
  const supported = claimSet.filter((claim) => claim.disposition === 'supported').length;
  const citedClaims = claimSet.filter(
    (claim) =>
      claim.disposition !== 'supported' ||
      claim.citations.some((citation) => citation.role === 'supports'),
  ).length;

  const average = (values: number[], fallback: number) =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
  const evidenceStrength = average(
    cited.map((item) => item.retrievalScore),
    0,
  );
  const semanticRelevance = average(
    cited.map((item) => item.retrievalScore),
    0,
  );
  const scopeMatch = average(
    cited.map((item) => scopeConfidence[item.scopeMatch]),
    0,
  );
  const freshness = average(
    cited.map((item) => item.freshnessScore),
    0,
  );
  const sourceAuthority = average(
    cited.map((item) => item.authorityScore),
    0,
  );
  const extractionQuality = average(
    cited.map((item) => item.extractionQuality),
    0,
  );
  const contradictionSafety = candidates.some((item) => item.contradiction) ? 0 : 1;
  const answerCompleteness = claimSet.length > 0 ? supported / claimSet.length : 0;
  const claimCitationAlignment = claimSet.length > 0 ? citedClaims / claimSet.length : 0;
  const raw =
    evidenceStrength * 0.16 +
    semanticRelevance * 0.1 +
    scopeMatch * 0.16 +
    freshness * 0.1 +
    sourceAuthority * 0.12 +
    contradictionSafety * 0.12 +
    extractionQuality * 0.08 +
    answerCompleteness * 0.08 +
    claimCitationAlignment * 0.08;
  const overall = Math.min(raw, answerStateConfidenceCap(state));

  return ConfidenceDimensionsSchema.parse({
    evidenceStrength,
    semanticRelevance,
    scopeMatch,
    freshness,
    sourceAuthority,
    contradictionSafety,
    extractionQuality,
    answerCompleteness,
    claimCitationAlignment,
    overall,
  });
}

function validateAnswerFormat(
  value: string | null,
  format: z.infer<typeof AnswerFormatSchema>,
): string[] {
  const errors: string[] = [];
  if (value === null || value.length === 0) {
    if (!format.blankAllowed) errors.push('answer_value_required');
    return errors;
  }
  if (format.characterLimit && value.length > format.characterLimit) {
    errors.push('answer_character_limit_exceeded');
  }
  if (format.wordLimit && value.trim().split(/\s+/).length > format.wordLimit) {
    errors.push('answer_word_limit_exceeded');
  }
  if (format.allowedValues.length > 0 && !format.allowedValues.includes(value)) {
    errors.push('answer_value_not_allowed');
  }
  return errors;
}

export function validateDraft(
  input: GenerationInput,
  modelOutput: ModelDraftOutput,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const candidateById = new Map(input.candidates.map((candidate) => [candidate.spanId, candidate]));
  const requestById = new Map(
    input.question.atomicRequests.map((request) => [request.localId, request]),
  );
  const outputByClaim = new Map(modelOutput.claims.map((claim) => [claim.claimLocalId, claim]));

  if (outputByClaim.size !== modelOutput.claims.length) errors.push('duplicate_claim_outputs');
  for (const request of input.question.atomicRequests) {
    if (!outputByClaim.has(request.localId)) errors.push(`missing_claim_output:${request.localId}`);
  }
  for (const output of modelOutput.claims) {
    const request = requestById.get(output.claimLocalId);
    if (!request) {
      errors.push(`unknown_claim_output:${output.claimLocalId}`);
      continue;
    }
    const supportingCandidates: EvidenceCandidate[] = [];
    for (const spanId of output.citationSpanIds) {
      const candidate = candidateById.get(spanId);
      if (!candidate) {
        errors.push(`fabricated_citation:${output.claimLocalId}:${spanId}`);
        continue;
      }
      if (!operationAllowsCandidate(input.operation, candidate.disclosurePolicy)) {
        errors.push(`disclosure_policy_violation:${output.claimLocalId}:${spanId}`);
      }
      if (candidate.scopeMatch === 'mismatch') {
        errors.push(`scope_mismatched_citation:${output.claimLocalId}:${spanId}`);
      }
      const quote = output.citationQuotes[spanId];
      if (!quote || !citationQuoteMatches(candidate, quote)) {
        errors.push(`citation_quote_mismatch:${output.claimLocalId}:${spanId}`);
      }
      supportingCandidates.push(candidate);
    }
    if (output.disposition === 'supported') {
      if (supportingCandidates.length === 0) {
        errors.push(`supported_claim_without_citation:${output.claimLocalId}`);
      }
      if (supportingCandidates.some((candidate) => candidate.historical)) {
        errors.push(`supported_claim_uses_historical_evidence:${output.claimLocalId}`);
      }
      if (supportingCandidates.some((candidate) => candidate.contradiction)) {
        errors.push(`supported_claim_has_contradiction:${output.claimLocalId}`);
      }
      const requestedQuantifiers = quantifierSet(request.normalizedClaim);
      const proposedQuantifiers = quantifierSet(output.proposedStatement);
      for (const quantifier of proposedQuantifiers) {
        if (
          ['all', 'always', 'every', 'without exception'].includes(quantifier) &&
          !requestedQuantifiers.has(quantifier)
        ) {
          errors.push(`broadened_quantifier:${output.claimLocalId}:${quantifier}`);
        }
      }
    }
    if (output.disposition !== 'supported' && output.proposedStatement.trim().length > 0) {
      warnings.push(`non_supported_claim_has_statement:${output.claimLocalId}`);
    }
  }

  errors.push(...validateAnswerFormat(modelOutput.outwardValue, input.question.answerFormat));
  const hasUnsupportedMaterial = input.question.atomicRequests.some((request) => {
    const output = outputByClaim.get(request.localId);
    return request.materiality === 'material' && output?.disposition !== 'supported';
  });
  const normalizedValue = normalizeComparable(modelOutput.outwardValue ?? modelOutput.outwardText);
  if (
    hasUnsupportedMaterial &&
    /^(yes|y|true|compliant|implemented|fully implemented)$/.test(normalizedValue)
  ) {
    errors.push('unsupported_affirmative_answer');
  }

  return { passed: errors.length === 0, errors, warnings };
}

export function materializeDraft(input: GenerationInput, rawOutput: unknown): DraftAnswer {
  const modelOutput = ModelDraftOutputSchema.parse(rawOutput);
  const validation = validateDraft(input, modelOutput);
  const candidateById = new Map(input.candidates.map((candidate) => [candidate.spanId, candidate]));
  const outputByClaim = new Map(modelOutput.claims.map((claim) => [claim.claimLocalId, claim]));
  const claims: ClaimDraft[] = input.question.atomicRequests.map((request) => {
    const output = outputByClaim.get(request.localId);
    if (!output) {
      return {
        ...request,
        claimLocalId: request.localId,
        disposition: 'unsupported',
        proposedStatement: '',
        citations: [],
        reasons: ['The model did not return this atomic claim.'],
        missingInformation: ['A complete claim-level draft is required.'],
      };
    }
    const citations: Citation[] = [];
    for (const spanId of output.citationSpanIds) {
      const candidate = candidateById.get(spanId);
      const quote = output.citationQuotes[spanId];
      if (!candidate || !quote) continue;
      citations.push(
        CitationSchema.parse({
          spanId,
          evidenceVersionId: candidate.evidenceVersionId,
          role: candidate.contradiction ? 'contradicts' : 'supports',
          quote,
          claimLocalId: request.localId,
        }),
      );
    }
    return ClaimDraftSchema.parse({
      claimLocalId: request.localId,
      originalClause: request.originalClause,
      normalizedClaim: request.normalizedClaim,
      qualifiers: request.qualifiers,
      materiality: request.materiality,
      disposition: output.disposition,
      proposedStatement: output.proposedStatement,
      citations,
      reasons: output.reasons,
      missingInformation: output.missingInformation,
    });
  });
  const state = validation.passed ? deriveAnswerState(claims) : 'blocked_from_automation';
  const confidence = calculateConfidence(claims, input.candidates, state);
  const contradictions = input.candidates
    .filter((candidate) => candidate.contradiction)
    .map(
      (candidate) =>
        candidate.contradictionSummary ??
        `${candidate.documentTitle} contains conflicting evidence.`,
    );
  const missingInformation = claims.flatMap((claim) => claim.missingInformation);
  const requiredReviewers = new Set<ReviewerRole>(modelOutput.suggestedReviewers);
  if (state === 'contradicted' || state === 'scope_mismatch' || state === 'requires_sme') {
    requiredReviewers.add('knowledge_owner');
    requiredReviewers.add('security_reviewer');
  }
  if (state === 'requires_legal') requiredReviewers.add('legal_reviewer');
  if (modelOutput.suggestedRiskTier === 'critical') requiredReviewers.add('final_approver');

  return DraftAnswerSchema.parse({
    schemaVersion: 1,
    tenantId: input.tenantId,
    questionnaireSnapshotId: input.questionnaireSnapshotId,
    questionId: input.question.questionId,
    generationRunId: input.generationRunId,
    state,
    outwardValue: validation.passed ? modelOutput.outwardValue : null,
    outwardText: validation.passed ? modelOutput.outwardText : '',
    claims,
    confidence,
    riskTier: modelOutput.suggestedRiskTier,
    requiredReviewers: [...requiredReviewers],
    limitations: modelOutput.limitations,
    contradictions,
    missingInformation,
    model: input.model,
    generatedAt: new Date().toISOString(),
    deterministicValidation: validation,
  });
}

export function generationInputHash(input: GenerationInput): string {
  const canonical = JSON.stringify({
    schemaVersion: input.schemaVersion,
    tenantId: input.tenantId,
    questionnaireSnapshotId: input.questionnaireSnapshotId,
    snapshotHash: input.snapshotHash,
    operation: input.operation,
    requestedScope: input.requestedScope,
    question: input.question,
    candidates: input.candidates.map((candidate) => ({
      spanId: candidate.spanId,
      evidenceVersionId: candidate.evidenceVersionId,
      text: candidate.text,
      disclosurePolicy: candidate.disclosurePolicy,
      scopeMatch: candidate.scopeMatch,
      historical: candidate.historical,
      contradiction: candidate.contradiction,
    })),
    model: input.model,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function emptyScope(mode: EvidenceScope['mode'] = 'unknown'): EvidenceScope {
  return ScopeSchema.parse({ mode });
}
