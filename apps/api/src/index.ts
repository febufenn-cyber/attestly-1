import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';
import {
  AcceptInvitationInputSchema,
  ApiErrorSchema,
  CreateOrganizationInputSchema,
  CreateUploadIntentInputSchema,
  IdentifierSchema,
  InviteMemberInputSchema,
  MembershipRoleSchema,
  makeAuditEvent,
  requirePermission,
  type MembershipRole,
  type Permission,
  ValidateObjectMessageSchema,
} from '../../../packages/foundation/src/index';

interface QueueProducer {
  send(body: unknown): Promise<void>;
}

export interface Bindings {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  EXPECTED_SUPABASE_PROJECT_REF: string;
  WEB_BASE_URL: string;
  ALLOWED_ORIGIN: string;
  STORAGE_BUCKET: string;
  ENVIRONMENT: 'local' | 'development' | 'staging' | 'production';
  OBJECT_QUEUE: QueueProducer;
}

interface AuthContext {
  userId: string;
  accessToken: string;
  email?: string;
}

type Variables = {
  requestId: string;
  auth: AuthContext;
};

type AppEnv = { Bindings: Bindings; Variables: Variables };

class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

function userClient(env: Bindings, accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function serviceClient(env: Bindings): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function assertEnvironment(env: Bindings): void {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'EXPECTED_SUPABASE_PROJECT_REF',
    'STORAGE_BUCKET',
  ] as const;
  for (const key of required) {
    if (!env[key]) throw new AppError(500, 'environment_invalid', `Missing binding: ${key}`);
  }

  const hostname = new URL(env.SUPABASE_URL).hostname;
  if (env.EXPECTED_SUPABASE_PROJECT_REF !== 'local') {
    const actualRef = hostname.split('.')[0];
    if (actualRef !== env.EXPECTED_SUPABASE_PROJECT_REF) {
      throw new AppError(500, 'environment_mismatch', 'Supabase project does not match this deployment.');
    }
  }
}

function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  let binary = '';
  for (const byte of buffer) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function membership(
  client: SupabaseClient,
  tenantId: string,
  userId: string,
): Promise<{ role: MembershipRole }> {
  const { data, error } = await client
    .from('organization_memberships')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw new AppError(500, 'membership_lookup_failed', 'Could not verify workspace access.');
  if (!data) throw new AppError(404, 'not_found', 'Workspace resource was not found.');
  return { role: MembershipRoleSchema.parse(data.role) };
}

async function requireWorkspacePermission(
  client: SupabaseClient,
  tenantId: string,
  userId: string,
  permission: Permission,
): Promise<MembershipRole> {
  const { role } = await membership(client, tenantId, userId);
  try {
    requirePermission(role, permission);
  } catch {
    throw new AppError(403, 'forbidden', 'You do not have permission for this operation.');
  }
  return role;
}

async function appendAudit(
  client: SupabaseClient,
  input: Parameters<typeof makeAuditEvent>[0],
): Promise<void> {
  const { error } = await client.from('audit_events').insert(makeAuditEvent(input));
  if (error) throw new AppError(500, 'audit_write_failed', 'The operation could not be audited.');
}

async function dispatchOutbox(
  env: Bindings,
  tenantId: string,
  outboxId: string,
): Promise<boolean> {
  const client = serviceClient(env);
  const { data, error } = await client
    .from('queue_outbox')
    .select('id, payload')
    .eq('tenant_id', tenantId)
    .eq('id', outboxId)
    .is('dispatched_at', null)
    .maybeSingle();
  if (error) throw new AppError(500, 'outbox_read_failed', 'Could not read queued work.');
  if (!data) return true;

  const payload = ValidateObjectMessageSchema.parse(data.payload);
  try {
    await env.OBJECT_QUEUE.send(payload);
    const { error: updateError } = await client
      .from('queue_outbox')
      .update({ dispatched_at: new Date().toISOString(), last_error: null })
      .eq('tenant_id', tenantId)
      .eq('id', outboxId)
      .is('dispatched_at', null);
    if (updateError) throw updateError;
    return true;
  } catch (error) {
    await client
      .from('queue_outbox')
      .update({ last_error: error instanceof Error ? error.message.slice(0, 500) : 'queue error' })
      .eq('tenant_id', tenantId)
      .eq('id', outboxId);
    return false;
  }
}

export const app = new Hono<AppEnv>();

app.use('*', secureHeaders());
app.use(
  '*',
  cors({
    origin: (origin, c) => (origin === c.env.ALLOWED_ORIGIN ? origin : c.env.ALLOWED_ORIGIN),
    allowHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['X-Request-ID'],
    maxAge: 600,
    credentials: false,
  }),
);
app.use('*', async (c, next) => {
  const requestId = c.req.header('x-request-id') ?? crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('X-Request-ID', requestId);
  assertEnvironment(c.env);
  await next();
});

app.get('/health', (c) =>
  c.json({ status: 'ok', service: 'attestly-api', environment: c.env.ENVIRONMENT }),
);

app.use('/v1/*', async (c, next) => {
  const authorization = c.req.header('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new AppError(401, 'unauthorized', 'A valid access token is required.');
  }

  const accessToken = authorization.slice('Bearer '.length).trim();
  const client = userClient(c.env, accessToken);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) throw new AppError(401, 'unauthorized', 'The access token is invalid.');
  c.set('auth', {
    userId: data.user.id,
    accessToken,
    email: data.user.email,
  });
  await next();
});

app.get('/v1/me/workspaces', async (c) => {
  const auth = c.get('auth');
  const client = userClient(c.env, auth.accessToken);
  const { data, error } = await client
    .from('organization_memberships')
    .select('tenant_id, role, organizations!inner(id, name, slug, created_at)')
    .eq('user_id', auth.userId)
    .eq('status', 'active')
    .order('created_at', { referencedTable: 'organizations', ascending: true });
  if (error) throw new AppError(500, 'workspace_list_failed', 'Could not list workspaces.');
  return c.json({ workspaces: data ?? [] });
});

app.post('/v1/workspaces', async (c) => {
  const input = CreateOrganizationInputSchema.parse(await c.req.json());
  const auth = c.get('auth');
  const client = userClient(c.env, auth.accessToken);
  const { data, error } = await client.rpc('create_organization', {
    p_name: input.name,
    p_slug: input.slug,
  });
  if (error) {
    const duplicate = error.code === '23505';
    throw new AppError(duplicate ? 409 : 400, duplicate ? 'slug_taken' : 'workspace_create_failed', error.message);
  }
  return c.json({ workspace: Array.isArray(data) ? data[0] : data }, 201);
});

app.get('/v1/workspaces/:tenantId/members', async (c) => {
  const tenantId = IdentifierSchema.parse(c.req.param('tenantId'));
  const auth = c.get('auth');
  const client = userClient(c.env, auth.accessToken);
  await requireWorkspacePermission(client, tenantId, auth.userId, 'workspace.read');
  const { data, error } = await client
    .from('organization_memberships')
    .select('user_id, role, status, joined_at')
    .eq('tenant_id', tenantId)
    .order('joined_at');
  if (error) throw new AppError(500, 'member_list_failed', 'Could not list workspace members.');
  return c.json({ members: data ?? [] });
});

app.post('/v1/workspaces/:tenantId/invitations', async (c) => {
  const tenantId = IdentifierSchema.parse(c.req.param('tenantId'));
  const input = InviteMemberInputSchema.parse(await c.req.json());
  const auth = c.get('auth');
  const client = userClient(c.env, auth.accessToken);
  await requireWorkspacePermission(client, tenantId, auth.userId, 'member.invite');

  const token = randomToken();
  const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await client.rpc('create_invitation', {
    p_tenant_id: tenantId,
    p_email: input.email.toLowerCase(),
    p_role: input.role,
    p_token: token,
    p_expires_at: expiresAt,
  });
  if (error) throw new AppError(400, 'invitation_create_failed', error.message);
  const invitation = Array.isArray(data) ? data[0] : data;
  return c.json(
    {
      invitation,
      inviteUrl: `${c.env.WEB_BASE_URL}/?invite=${encodeURIComponent(token)}`,
    },
    201,
  );
});

app.post('/v1/invitations/accept', async (c) => {
  const { token } = AcceptInvitationInputSchema.parse(await c.req.json());
  const auth = c.get('auth');
  const client = userClient(c.env, auth.accessToken);
  const { data, error } = await client.rpc('accept_invitation', { p_token: token });
  if (error) throw new AppError(400, 'invitation_accept_failed', error.message);
  return c.json({ tenantId: data });
});

app.delete('/v1/workspaces/:tenantId/members/:userId', async (c) => {
  const tenantId = IdentifierSchema.parse(c.req.param('tenantId'));
  const targetUserId = IdentifierSchema.parse(c.req.param('userId'));
  const auth = c.get('auth');
  const client = userClient(c.env, auth.accessToken);
  await requireWorkspacePermission(client, tenantId, auth.userId, 'member.remove');
  const { error } = await client.rpc('remove_member', {
    p_tenant_id: tenantId,
    p_user_id: targetUserId,
  });
  if (error) throw new AppError(400, 'member_remove_failed', error.message);
  return c.body(null, 204);
});

app.get('/v1/workspaces/:tenantId/objects', async (c) => {
  const tenantId = IdentifierSchema.parse(c.req.param('tenantId'));
  const auth = c.get('auth');
  const client = userClient(c.env, auth.accessToken);
  await requireWorkspacePermission(client, tenantId, auth.userId, 'object.read');
  const { data, error } = await client
    .from('stored_objects')
    .select('id, file_name, declared_mime_type, detected_mime_type, size_bytes, sha256, status, created_at, validated_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new AppError(500, 'object_list_failed', 'Could not list uploaded objects.');
  return c.json({ objects: data ?? [] });
});

app.post('/v1/workspaces/:tenantId/objects/upload-intents', async (c) => {
  const tenantId = IdentifierSchema.parse(c.req.param('tenantId'));
  const input = CreateUploadIntentInputSchema.parse(await c.req.json());
  const auth = c.get('auth');
  const client = userClient(c.env, auth.accessToken);
  await requireWorkspacePermission(client, tenantId, auth.userId, 'object.upload');

  const objectId = crypto.randomUUID();
  const storagePath = `tenant/${tenantId}/objects/${objectId}/original`;
  const { data: objectData, error: objectError } = await client.rpc('create_upload_intent', {
    p_tenant_id: tenantId,
    p_object_id: objectId,
    p_storage_bucket: c.env.STORAGE_BUCKET,
    p_storage_path: storagePath,
    p_file_name: input.fileName,
    p_declared_mime_type: input.mimeType,
    p_size_bytes: input.sizeBytes,
  });
  if (objectError) throw new AppError(400, 'upload_intent_failed', objectError.message);

  const privileged = serviceClient(c.env);
  const { data: signed, error: signedError } = await privileged.storage
    .from(c.env.STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (signedError || !signed?.token) {
    throw new AppError(500, 'signed_upload_failed', 'Could not authorize the upload.');
  }

  return c.json(
    {
      object: Array.isArray(objectData) ? objectData[0] : objectData,
      upload: { path: storagePath, token: signed.token, expiresInSeconds: 7200 },
    },
    201,
  );
});

app.post('/v1/workspaces/:tenantId/objects/:objectId/complete', async (c) => {
  const tenantId = IdentifierSchema.parse(c.req.param('tenantId'));
  const objectId = IdentifierSchema.parse(c.req.param('objectId'));
  const auth = c.get('auth');
  const client = userClient(c.env, auth.accessToken);
  await requireWorkspacePermission(client, tenantId, auth.userId, 'object.upload');

  const { data, error } = await client.rpc('complete_object_upload', {
    p_tenant_id: tenantId,
    p_object_id: objectId,
    p_correlation_id: c.get('requestId'),
  });
  if (error) throw new AppError(400, 'upload_complete_failed', error.message);
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.job_id || !result?.outbox_id) {
    throw new AppError(500, 'job_creation_failed', 'Upload completion did not create a job.');
  }
  const dispatched = await dispatchOutbox(c.env, tenantId, result.outbox_id);
  return c.json({ jobId: result.job_id, queued: dispatched }, 202);
});

app.get('/v1/workspaces/:tenantId/jobs', async (c) => {
  const tenantId = IdentifierSchema.parse(c.req.param('tenantId'));
  const auth = c.get('auth');
  const client = userClient(c.env, auth.accessToken);
  await requireWorkspacePermission(client, tenantId, auth.userId, 'job.read');
  const { data, error } = await client
    .from('jobs')
    .select('id, type, status, object_id, attempt_count, max_attempts, last_error_code, created_at, started_at, completed_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new AppError(500, 'job_list_failed', 'Could not list jobs.');
  return c.json({ jobs: data ?? [] });
});

app.get('/v1/workspaces/:tenantId/audit-events', async (c) => {
  const tenantId = IdentifierSchema.parse(c.req.param('tenantId'));
  const auth = c.get('auth');
  const client = userClient(c.env, auth.accessToken);
  await requireWorkspacePermission(client, tenantId, auth.userId, 'audit.read');
  const { data, error } = await client
    .from('audit_events')
    .select('id, actor_type, actor_id, action, target_type, target_id, request_id, metadata, occurred_at')
    .eq('tenant_id', tenantId)
    .order('occurred_at', { ascending: false })
    .limit(200);
  if (error) throw new AppError(500, 'audit_list_failed', 'Could not list audit events.');
  return c.json({ events: data ?? [] });
});

app.notFound((c) => {
  throw new AppError(404, 'not_found', 'The requested endpoint does not exist.');
});

app.onError((error, c) => {
  const requestId = c.get('requestId') ?? crypto.randomUUID();
  const known = error instanceof AppError;
  const validation = error instanceof z.ZodError;
  const status = known ? error.status : validation ? 400 : 500;
  const code = known ? error.code : validation ? 'validation_failed' : 'internal_error';
  const message = known
    ? error.message
    : validation
      ? 'The request did not match the expected schema.'
      : 'An unexpected error occurred.';
  const body = {
    error: {
      code,
      message,
      requestId,
      ...(validation ? { details: error.flatten() } : {}),
    },
  };
  ApiErrorSchema.parse(body);
  return c.json(body, status as 400 | 401 | 403 | 404 | 409 | 500);
});

export default app;
