import { TRPCError } from "@trpc/server";
import type { User } from "../drizzle/schema";
import {
  checkPermifyPermission,
  type PermifyAction,
  type PermifyResourceType,
} from "./permifyService";

export type AuthorizationResourceType = PermifyResourceType;
export type AuthorizationAction = PermifyAction;

/**
 * Enforce authorization through the versioned Permify policy model.
 *
 * This is deliberately fail-closed: an unavailable or misconfigured Permify
 * service is an authorization-system outage, not a reason to use a local role
 * matrix that can drift from the deployed policy.
 */
export async function ensureAuthorized(params: {
  user: User | null;
  resource: AuthorizationResourceType;
  action: AuthorizationAction;
  resourceId?: string;
}) {
  const { user, resource, action, resourceId = "global" } = params;
  if (!user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }

  let allowed: boolean;
  try {
    allowed = await checkPermifyPermission({ user, resource, resourceId, action });
  } catch (error) {
    console.error("[Authorization] Permify enforcement failed", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Authorization service is unavailable. Please retry after it has recovered.",
    });
  }

  if (!allowed) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Not authorized to ${action} ${resource}` });
  }

  return true;
}
