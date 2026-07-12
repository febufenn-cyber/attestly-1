import { z } from 'zod';

export const IdentifierSchema = z.string().uuid();

export const MembershipRoleSchema = z.enum([
  'admin',
  'knowledge_owner',
  'contributor',
  'security_reviewer',
  'legal_reviewer',
  'final_approver',
  'auditor',
]);
export type MembershipRole = z.infer<typeof MembershipRoleSchema>;

export const PermissionSchema = z.enum([
  'workspace.read',
  'workspace.manage',
  'member.invite',
  'member.remove',
  'object.read',
  'object.upload',
  'object.retire',
  'job.read',
  'job.retry',
  'audit.read',
]);
export type Permission = z.infer<typeof PermissionSchema>;

const rolePermissions: Record<MembershipRole, ReadonlySet<Permission>> = {
  admin: new Set(PermissionSchema.options),
  knowledge_owner: new Set([
    'workspace.read',
    'object.read',
    'object.upload',
    'object.retire',
    'job.read',
    'job.retry',
  ]),
  contributor: new Set(['workspace.read', 'object.read', 'object.upload', 'job.read']),
  security_reviewer: new Set(['workspace.read', 'object.read', 'job.read']),
  legal_reviewer: new Set(['workspace.read', 'object.read', 'job.read']),
  final_approver: new Set(['workspace.read', 'object.read', 'job.read']),
  auditor: new Set(['workspace.read', 'object.read', 'job.read', 'audit.read']),
};

export function can(role: MembershipRole, permission: Permission): boolean {
  return rolePermissions[role].has(permission);
}

export class AuthorizationError extends Error {
  readonly code = 'forbidden';
  readonly status = 403;

  constructor(permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = 'AuthorizationError';
  }
}

export function requirePermission(role: MembershipRole, permission: Permission): void {
  if (!can(role, permission)) throw new AuthorizationError(permission);
}

export const ObjectStatusSchema = z.enum([
  'upload_requested',
  'uploaded',
  'validating',
  'accepted',
  'validation_failed',
  'retired',
  'deletion_requested',
  'deleted',
]);
export type ObjectStatus = z.infer<typeof ObjectStatusSchema>;

export const JobStatusSchema = z.enum([
  'pending',
  'leased',
  'running',
  'succeeded',
  'failed_retryable',
  'failed_terminal',
  'cancelled',
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

const allowedJobTransitions: Record<JobStatus, ReadonlySet<JobStatus>> = {
  pending: new Set(['leased', 'cancelled']),
  leased: new Set(['running', 'failed_retryable', 'failed_terminal']),
  running: new Set(['succeeded', 'failed_retryable', 'failed_terminal']),
  succeeded: new Set(),
  failed_retryable: new Set(['leased', 'cancelled']),
  failed_terminal: new Set(),
  cancelled: new Set(),
};

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return allowedJobTransitions[from].has(to);
}

export function assertJobTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransitionJob(from, to)) {
    throw new Error(`Invalid job transition: ${from} -> ${to}`);
  }
}

export function retryDelaySeconds(attempt: number): number {
  const boundedAttempt = Math.max(1, Math.min(attempt, 8));
  return Math.min(3600, 2 ** boundedAttempt * 5);
}

export const CreateOrganizationInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export const InviteMemberInputSchema = z.object({
  email: z.string().trim().email().max(320),
  role: MembershipRoleSchema.exclude(['admin']),
  expiresInHours: z.number().int().min(1).max(168).default(72),
});

export const AcceptInvitationInputSchema = z.object({
  token: z.string().min(32).max(512),
});

export const CreateUploadIntentInputSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(150),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024),
});

export const CompleteUploadInputSchema = z.object({
  objectId: IdentifierSchema,
});

export const ValidateObjectMessageSchema = z.object({
  version: z.literal(1),
  type: z.literal('validate_object'),
  tenantId: IdentifierSchema,
  objectId: IdentifierSchema,
  jobId: IdentifierSchema,
  correlationId: z.string().uuid(),
});
export type ValidateObjectMessage = z.infer<typeof ValidateObjectMessageSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.unknown().optional(),
  }),
});

const sensitiveKey = /authorization|token|secret|password|signed.?url|prompt|content/i;

export function redactMetadata(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth-limited]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.length > 512 ? `${value.slice(0, 512)}…` : value;
  if (Array.isArray(value))
    return value.slice(0, 50).map((item) => redactMetadata(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sensitiveKey.test(key) ? '[redacted]' : redactMetadata(item, depth + 1),
      ]),
    );
  }
  return String(value);
}

export interface AuditEventInput {
  tenantId: string;
  actorType: 'user' | 'service' | 'system';
  actorId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  requestId: string;
  metadata?: Record<string, unknown>;
}

export function makeAuditEvent(input: AuditEventInput) {
  return {
    tenant_id: IdentifierSchema.parse(input.tenantId),
    actor_type: input.actorType,
    actor_id: input.actorId ?? null,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    request_id: input.requestId,
    metadata: redactMetadata(input.metadata ?? {}),
  };
}
