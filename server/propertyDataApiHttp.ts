import { Router } from "express";
import { rateLimiters } from "./_core/security";
import { getParcelByNumber } from "./parcelRepository";
import { recordApiUsage } from "./portfolioProductsService";

export const propertyDataApiRouter = Router();
propertyDataApiRouter.use(rateLimiters.api);

function clientSecret(req: { header(name: string): string | undefined }): string | null {
  const value = req.header("X-Property-Client-Key")?.trim();
  return value && /^pda_[A-Za-z0-9_-]{32,96}$/.test(value) ? value : null;
}

function purposeReference(req: { header(name: string): string | undefined }): string | null {
  const value = req.header("X-Purpose-Reference")?.trim();
  return value && value.length >= 2 && value.length <= 160 ? value : null;
}

propertyDataApiRouter.get("/v1/parcels/:parcelNumber", async (req, res) => {
  const secret = clientSecret(req);
  const purpose = purposeReference(req);
  if (!secret || !purpose) {
    return res.status(401).json({ error: "A valid client key and purpose reference are required" });
  }
  const parcelNumber = req.params.parcelNumber?.trim();
  if (!parcelNumber || parcelNumber.length > 128) {
    return res.status(400).json({ error: "Invalid parcel number" });
  }
  try {
    // Usage is authorized and recorded before data delivery. A disabled client,
    // out-of-scope request, or unavailable database fails closed.
    await recordApiUsage({
      clientSecret: secret,
      endpoint: "/v1/parcels/:parcelNumber",
      scope: "parcel.read",
      responseCount: 1,
      purposeReference: purpose,
    });
    const parcel = await getParcelByNumber(parcelNumber);
    if (!parcel) return res.status(404).json({ error: "Parcel not found" });
    return res.json({
      data: {
        parcelNumber: parcel.parcelNumber,
        surveyPlanNumber: parcel.surveyPlanNumber,
        state: parcel.state,
        lga: parcel.lga,
        ward: parcel.ward ?? null,
        areaSquareMeters: parcel.areaSquareMeters,
        landUseType: parcel.landUseType,
        status: parcel.status,
        verifiedAt: parcel.verifiedAt ?? null,
        updatedAt: parcel.updatedAt,
      },
      purposeReference: purpose,
      decisionBoundary: "Factual registry projection only; no ownership conclusion, valuation, credit, legal, or transaction decision.",
    });
  } catch (error) {
    // Deliberately avoid revealing whether a commercial client key exists or the
    // specific authorization/entitlement failure to an external caller.
    console.warn("[PropertyDataAPI] denied or unavailable request", error instanceof Error ? error.name : "unknown");
    return res.status(401).json({ error: "Property data request is not authorized" });
  }
});
