jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock("@react-native-community/netinfo", () => ({
  fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
}));

jest.mock("../lib/runtimeConfig", () => ({
  getApiBaseUrl: () => "https://platform.example.test",
}));

import { MobileApiError, trpcMutation, trpcQuery } from "./api";

describe("native tRPC client", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
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

  it("fails closed before a protected request when no mobile identity token is available", async () => {
    await expect(trpcQuery("geoai.listRuns", { limit: 25 }, null)).rejects.toMatchObject<Partial<MobileApiError>>({
      name: "MobileApiError",
      code: "UNAUTHORIZED",
      status: 401,
    });
  });
});
