import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return ctx;
}

describe("transactions.initiate", () => {
  it("creates a new transaction with required fields", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.transactions.initiate({
      type: "registration",
      parcelId: 1,
    });

    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
    expect(result.type).toBe("registration");
    expect(result.parcelId).toBe(1);
    expect(result.initiatorId).toBe(ctx.user!.id);
    expect(result.status).toBe("pending_approval");
  });

  it("creates a transfer transaction with recipient and amount", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.transactions.initiate({
      type: "transfer",
      parcelId: 1,
      toOwnerId: 2,
      transactionAmount: 5000000,
      description: "Property transfer to new owner",
    });

    expect(result).toBeDefined();
    expect(result.type).toBe("transfer");
    expect(result.toOwnerId).toBe(2);
    expect(result.transactionAmount).toBe(5000000);
    expect(result.description).toBe("Property transfer to new owner");
  });

  it("creates a subdivision transaction", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.transactions.initiate({
      type: "subdivision",
      parcelId: 1,
      description: "Subdivide parcel into 4 plots",
    });

    expect(result).toBeDefined();
    expect(result.type).toBe("subdivision");
    expect(result.parcelId).toBe(1);
  });

  it("creates a mortgage transaction with amount", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.transactions.initiate({
      type: "mortgage",
      parcelId: 1,
      transactionAmount: 10000000,
      description: "Mortgage registration",
    });

    expect(result).toBeDefined();
    expect(result.type).toBe("mortgage");
    expect(result.transactionAmount).toBe(10000000);
  });
});

describe("transactions.getById", () => {
  it("returns transaction details", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.transactions.getById({ id: 1 });

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
    expect(result).toHaveProperty("type");
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("parcelId");
    expect(result).toHaveProperty("initiatorId");
  });
});
