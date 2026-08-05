import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";

import { extractContextCapability, verifyContextCapability } from "../../server/contextGlobeCapability";

const SECRET = "0123456789abcdef0123456789abcdef";

type Payload = {
  v: 1;
  aud: "context_stream" | "context_tiles" | "context_mobile";
  sub: number;
  layers: string[];
  purpose: string;
  iat: number;
  exp: number;
  jti: string;
};

function capability(payload: Payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

describe("Context Globe capability contract", () => {
  beforeEach(() => {
    process.env.CONTEXT_CAPABILITY_SECRET = SECRET;
  });

  it("verifies signed scoped capabilities and canonicalizes layer order", () => {
    const now = 1_750_000_000;
    const verified = verifyContextCapability(capability({
      v: 1,
      aud: "context_tiles",
      sub: 42,
      layers: ["weather-alerts", "seismic", "seismic"],
      purpose: "pwa.context-globe.read-only-view",
      iat: now - 1,
      exp: now + 60,
      jti: "test-context-capability",
    }), "context_tiles", now);
    expect(verified.sub).toBe(42);
    expect(verified.layers).toEqual(["seismic", "weather-alerts"]);
  });

  it("rejects audience confusion, invalid signatures, expired values, and noncanonical payloads", () => {
    const now = 1_750_000_000;
    const valid = capability({ v: 1, aud: "context_tiles", sub: 42, layers: ["seismic"], purpose: "test", iat: now - 1, exp: now + 60, jti: "test-context-capability" });
    expect(() => verifyContextCapability(valid, "context_mobile", now)).toThrow(/audience/i);
    expect(() => verifyContextCapability(`${valid}A`, "context_tiles", now)).toThrow();
    expect(() => verifyContextCapability(capability({ v: 1, aud: "context_tiles", sub: 42, layers: ["seismic"], purpose: "test", iat: now - 61, exp: now, jti: "expired-context-capability" }), "context_tiles", now)).toThrow(/expired/i);
    const noncanonicalPayload = `${Buffer.from(JSON.stringify({ v: 1, aud: "context_tiles", sub: 42, layers: ["seismic"], purpose: "test", iat: now - 1, exp: now + 60, jti: "canonical" }), "utf8").toString("base64url")}=`;
    const noncanonicalSignature = createHmac("sha256", SECRET).update(noncanonicalPayload).digest("base64url");
    expect(() => verifyContextCapability(`${noncanonicalPayload}.${noncanonicalSignature}`, "context_tiles", now)).toThrow(/base64url|noncanonical/i);
  });

  it("accepts only one bearer capability value in the dedicated header", () => {
    expect(extractContextCapability("Bearer abc.def")).toBe("abc.def");
    expect(() => extractContextCapability("Basic abc.def")).toThrow(/Bearer/i);
    expect(() => extractContextCapability(undefined)).toThrow(/required/i);
  });
});
