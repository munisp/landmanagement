import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ensureAuthorized, type AuthorizationAction, type AuthorizationResourceType } from "../authorizationService";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const authorizedProcedure = (resource: AuthorizationResourceType, action: AuthorizationAction) =>
  protectedProcedure.use(
    t.middleware(async opts => {
      const { ctx, next } = opts;
      await ensureAuthorized({
        user: ctx.user,
        resource,
        action,
      });

      return next({
        ctx: {
          ...ctx,
          user: ctx.user,
        },
      });
    }),
  );

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    await ensureAuthorized({
      user: ctx.user,
      resource: 'admin_surface',
      action: 'manage',
    }).catch(() => {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    });

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
