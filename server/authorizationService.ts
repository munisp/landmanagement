import { TRPCError } from '@trpc/server';
import type { User } from '../drizzle/schema';
import { externalClients } from './_core/externalClients';

export type AuthorizationResourceType =
  | 'parcel'
  | 'transaction'
  | 'title'
  | 'document'
  | 'workflow'
  | 'report'
  | 'marketplace_listing'
  | 'admin_surface'
  | 'system';

export type AuthorizationAction = 'view' | 'create' | 'update' | 'delete' | 'approve' | 'manage';

const roleMatrix: Record<string, Partial<Record<AuthorizationResourceType, AuthorizationAction[]>>> = {
  admin: {
    system: ['view', 'manage'],
    admin_surface: ['view', 'manage'],
    parcel: ['view', 'create', 'update', 'delete', 'approve'],
    transaction: ['view', 'create', 'update', 'delete', 'approve'],
    title: ['view', 'create', 'update', 'delete', 'approve'],
    document: ['view', 'create', 'update', 'delete', 'approve'],
    workflow: ['view', 'create', 'update', 'delete', 'approve', 'manage'],
    report: ['view', 'create', 'update', 'delete', 'approve', 'manage'],
    marketplace_listing: ['view', 'create', 'update', 'delete', 'approve'],
  },
  registrar: {
    admin_surface: ['view'],
    parcel: ['view', 'create', 'update', 'approve'],
    transaction: ['view', 'create', 'update', 'approve'],
    title: ['view', 'create', 'update', 'approve'],
    document: ['view', 'create', 'update', 'approve'],
    workflow: ['view', 'update', 'approve'],
    report: ['view', 'create'],
    marketplace_listing: ['view'],
  },
  surveyor: {
    parcel: ['view', 'create', 'update'],
    document: ['view', 'create', 'update'],
    workflow: ['view', 'update'],
    report: ['view'],
  },
  broker: {
    parcel: ['view'],
    marketplace_listing: ['view', 'create', 'update'],
    report: ['view'],
    transaction: ['view'],
  },
  investor: {
    marketplace_listing: ['view'],
    report: ['view'],
    transaction: ['view'],
    parcel: ['view'],
  },
  user: {
    parcel: ['view'],
    title: ['view'],
    transaction: ['view', 'create'],
    document: ['view', 'create'],
    marketplace_listing: ['view'],
  },
};

function fallbackAllows(user: User, resource: AuthorizationResourceType, action: AuthorizationAction): boolean {
  const allowed = roleMatrix[user.role || 'user']?.[resource] || [];
  return allowed.includes(action);
}

async function checkPermify(user: User, resource: AuthorizationResourceType, resourceId: string, action: AuthorizationAction) {
  const baseUrl = process.env.PERMIFY_URL;
  if (!baseUrl || !externalClients.permify) {
    return null;
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/permissions/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenantId: process.env.PERMIFY_TENANT_ID || 'idlr',
        metadata: { schemaVersion: '', snapToken: '', depth: 20 },
        entity: {
          type: resource,
          id: resourceId,
        },
        permission: action,
        subject: {
          type: 'user',
          id: String(user.id),
        },
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json() as { can?: string | boolean; allowed?: boolean };
    if (typeof payload.allowed === 'boolean') {
      return payload.allowed;
    }
    if (typeof payload.can === 'boolean') {
      return payload.can;
    }
    if (typeof payload.can === 'string') {
      return payload.can.toUpperCase() === 'RESULT_ALLOWED' || payload.can.toLowerCase() === 'allow';
    }
    return null;
  } catch {
    return null;
  }
}

export async function ensureAuthorized(params: {
  user: User | null;
  resource: AuthorizationResourceType;
  action: AuthorizationAction;
  resourceId?: string;
}) {
  const { user, resource, action, resourceId = 'global' } = params;
  if (!user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  const permifyDecision = await checkPermify(user, resource, resourceId, action);
  const allowed = permifyDecision ?? fallbackAllows(user, resource, action);

  if (!allowed) {
    throw new TRPCError({ code: 'FORBIDDEN', message: `Not authorized to ${action} ${resource}` });
  }

  return true;
}
