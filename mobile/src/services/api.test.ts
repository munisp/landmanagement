const mockSecureValues = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureValues.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => { mockSecureValues.set(key, value); }),
  deleteItemAsync: jest.fn(async (key: string) => { mockSecureValues.delete(key); }),
}));

jest.mock("@react-native-community/netinfo", () => ({
  fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
}));

jest.mock("../lib/runtimeConfig", () => ({
  getApiBaseUrl: () => "https://platform.example.test",
}));

import { MobileApiError, getMobileParcelEvidence, trpcMutation, trpcQuery } from "./api";

describe("native tRPC client", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    mockSecureValues.clear();
    jest.restoreAllMocks();
  });

  it("sends an authenticated GeoAI query and unwraps its tRPC response", async () => {
    const fetchSpy = jest.fn(async () => new Response(JSON.stringify({
      result: { data: { json: [{ id: 41, title: "Verified field observation" }] } },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await trpcQuery<Array<{ id: number; title: string }>>(
      "geoai.listRuns",
      { limit: 25 },
      "native-access-token",
    );

    expect(result).toEqual([{ id: 41, title: "Verified field observation" }]);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/trpc/geoai.listRuns?input="),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer native-access-token" }),
      }),
    );
  });

  it("sends a guarded ArcGIS mutation in the platform JSON envelope", async () => {
    const fetchSpy = jest.fn(async () => new Response(JSON.stringify({
      result: { data: { json: { id: 88, status: "requested" } } },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await trpcMutation<{ id: number; status: string }>(
      "geoai.requestArcgisOperation",
      { operationType: "publish_feature_layer", targetWorkspaceUri: "https://arcgis.example.test/workspaces/land" },
      "native-access-token",
    );

    expect(result).toEqual({ id: 88, status: "requested" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://platform.example.test/trpc/geoai.requestArcgisOperation",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer native-access-token" }),
        body: expect.stringContaining("publish_feature_layer"),
      }),
    );
  });

  it("uses a separate scoped capability header for governed mobile evidence and persists no delivery token", async () => {
    const generatedAt = new Date().toISOString();
    const fetchSpy = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        result: { data: { json: { capability: "delivery-capability-token", endpoint: "/api/geospatial-delivery/mobile-evidence", expiresAt: new Date(Date.now() + 300_000).toISOString() } } },
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        generatedAt,
        parcelIds: [7],
        evidence: [{ assetId: "survey-asset-001", parcelId: 7, assetType: "survey_plan", checksumSha256: "a".repeat(64), sourceCrs: "EPSG:4326", verticalCrs: null, evidenceStatus: "verified", acquiredAt: null, updatedAt: generatedAt }],
        limitations: ["Provenance view only."],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await getMobileParcelEvidence(7, "native-access-token");

    expect(result.source).toBe("network");
    expect(result.manifest.evidence).toHaveLength(1);
    expect(fetchSpy).toHaveBeenNthCalledWith(1,
      "https://platform.example.test/trpc/geospatialDelivery.issueMobileEvidenceCapability",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer native-access-token" }) }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(2,
      "https://platform.example.test/api/geospatial-delivery/mobile-evidence",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer native-access-token",
          "X-Geospatial-Capability": "Bearer delivery-capability-token",
        }),
      }),
    );
    expect([...mockSecureValues.values()].join(" ")).not.toContain("delivery-capability-token");
  });

  it("fails closed before a protected request when no mobile identity token is available", async () => {
    await expect(trpcQuery("geoai.listRuns", { limit: 25 }, null)).rejects.toMatchObject<Partial<MobileApiError>>({
      name: "MobileApiError",
      code: "UNAUTHORIZED",
      status: 401,
    });
  });
});
