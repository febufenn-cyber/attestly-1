import { z } from 'zod';
import {
  ExportOperationSchema,
  QuestionnaireConditionSchema,
  QuestionnaireFormatSchema,
  QuestionnaireQuestionSchema,
  AnswerDestinationSchema,
} from './index';

export const IdSchema = z.string().uuid();

export const InspectQuestionnaireMessageSchema = z.object({
  version: z.literal(1),
  type: z.literal('inspect_questionnaire'),
  tenantId: IdSchema,
  questionnaireArtifactId: IdSchema,
  objectId: IdSchema,
  jobId: IdSchema,
  correlationId: IdSchema,
});
export type InspectQuestionnaireMessage = z.infer<typeof InspectQuestionnaireMessageSchema>;

export const ExportQuestionnaireMessageSchema = z.object({
  version: z.literal(1),
  type: z.literal('export_questionnaire'),
  tenantId: IdSchema,
  exportPlanId: IdSchema,
  exportRunId: IdSchema,
  sourceObjectId: IdSchema,
  outputObjectId: IdSchema,
  jobId: IdSchema,
  correlationId: IdSchema,
});
export type ExportQuestionnaireMessage = z.infer<typeof ExportQuestionnaireMessageSchema>;

export const QuestionnaireQueueMessageSchema = z.discriminatedUnion('type', [
  InspectQuestionnaireMessageSchema,
  ExportQuestionnaireMessageSchema,
]);
export type QuestionnaireQueueMessage = z.infer<typeof QuestionnaireQueueMessageSchema>;

export const CreateQuestionnaireArtifactInputSchema = z.object({
  storedObjectId: IdSchema,
  format: QuestionnaireFormatSchema,
});

const MappingDestinationSchema = AnswerDestinationSchema.extend({
  questionLocalId: z.string().min(1),
});

export const MappingRevisionInputSchema = z.object({
  targetScope: z.object({
    mode: z.enum(['all', 'selected', 'unknown']),
    products: z.array(z.string()).default([]),
    environments: z.array(z.string()).default([]),
    regions: z.array(z.string()).default([]),
    deploymentModels: z.array(z.string()).default([]),
    customDimensions: z.record(z.string(), z.unknown()).default({}),
  }),
  notes: z.string().max(4000).default(''),
  mapping: z.object({
    questions: z.array(QuestionnaireQuestionSchema).max(20_000),
    destinations: z.array(MappingDestinationSchema).max(30_000),
    conditions: z.array(QuestionnaireConditionSchema).max(20_000),
    instructions: z
      .array(
        z.object({
          localId: z.string(),
          scope: z.enum(['workbook', 'sheet', 'section', 'question', 'answer_field']),
          category: z.string(),
          text: z.string(),
          sourceLocation: z.record(z.string(), z.unknown()),
        }),
      )
      .max(20_000),
  }),
});

export const FreezeSnapshotInputSchema = z.object({
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  targetScope: z.object({
    mode: z.enum(['all', 'selected']),
    products: z.array(z.string()).default([]),
    environments: z.array(z.string()).default([]),
    regions: z.array(z.string()).default([]),
    deploymentModels: z.array(z.string()).default([]),
    customDimensions: z.record(z.string(), z.unknown()).default({}),
  }),
});

export const CreateExportPlanInputSchema = z.object({
  answerSnapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  answers: z.record(z.string(), z.unknown()),
});

export const PersistExportPlanInputSchema = z.object({
  answerSnapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  operations: z.array(ExportOperationSchema).max(30_000),
  blockingErrors: z.array(z.string()).max(10_000),
});
