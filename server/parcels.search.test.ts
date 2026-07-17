import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createMockContext(): TrpcContext {
  const ctx: TrpcContext = {
    user: undefined,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return ctx;
}

describe("parcels.search", () => {
  it("returns mock data when microservices are unavailable", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.parcels.search({
      query: "",
      page: 1,
      limit: 20,
    });

    expect(result).toBeDefined();
    expect(result.parcels).toBeInstanceOf(Array);
    expect(result.parcels.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("returns parcels with correct structure", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.parcels.search({
      query: "",
      page: 1,
      limit: 20,
    });

    const parcel = result.parcels[0];
    expect(parcel).toHaveProperty("id");
    expect(parcel).toHaveProperty("parcelNumber");
    expect(parcel).toHaveProperty("surveyPlanNumber");
    expect(parcel).toHaveProperty("state");
    expect(parcel).toHaveProperty("lga");
    expect(parcel).toHaveProperty("areaSquareMeters");
    expect(parcel).toHaveProperty("landUseType");
    expect(parcel).toHaveProperty("status");
  });

  it("filters by state when provided", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.parcels.search({
      state: "Lagos",
      page: 1,
      limit: 20,
    });

    expect(result).toBeDefined();
    expect(result.parcels).toBeInstanceOf(Array);
  });

  it("filters by status when provided", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.parcels.search({
      status: "verified",
      page: 1,
      limit: 20,
    });

    expect(result).toBeDefined();
    expect(result.parcels).toBeInstanceOf(Array);
  });
});
