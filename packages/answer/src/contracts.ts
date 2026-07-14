import { z } from 'zod';
import { GenerationOperationSchema } from './index';

export const GenerateAnswerMessageSchema = z.object({
  version: z.literal(1),
  type: z.literal('generate_answer'),
  tenantId: z.string().uuid(),
  generationRunId: z.string().uuid(),
  questionnaireSnapshotId: z.string().uuid(),
  questionId: z.string().uuid(),
  jobId: z.string().uuid(),
  correlationId: z.string().uuid(),
});
export type GenerateAnswerMessage = z.infer<typeof GenerateAnswerMessageSchema>;

export const RequestAnswerGenerationSchema = z.object({
  operation: GenerationOperationSchema.default('internal_answer_draft'),
});

export const GenerationProviderNameSchema = z.enum(['fake', 'anthropic']);
export type GenerationProviderName = z.infer<typeof GenerationProviderNameSchema>;

export const GenerationUsageSchema = z.object({
  provider: z.string().min(1).max(120),
  model: z.string().min(1).max(200),
  providerRequestId: z.string().max(300).nullable().default(null),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  latencyMs: z.number().int().nonnegative(),
  costMicroUsd: z.number().int().nonnegative().default(0),
  attempt: z.number().int().positive(),
});
export type GenerationUsage = z.infer<typeof GenerationUsageSchema>;
