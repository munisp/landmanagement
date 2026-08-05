import { Router, type Request, type Response } from "express";
import { processVerificationWebhook } from "./onboardingVerificationService";

export const verificationWebhookHttpRouter = Router();

type RawVerificationRequest = Request & { rawVerificationBody?: Buffer };

verificationWebhookHttpRouter.post("/", async (req: RawVerificationRequest, res: Response) => {
  const rawBody = req.rawVerificationBody;
  if (!rawBody?.length) {
    res.status(400).json({ error: "Verification callback body is required" });
    return;
  }
  try {
    const result = await processVerificationWebhook(rawBody, req.header("x-verification-signature") ?? undefined);
    res.status(202).json({ accepted: result.accepted, duplicate: result.duplicate });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification callback failed";
    if (message.includes("signature")) {
      res.status(401).json({ error: "Verification callback authentication failed" });
      return;
    }
    if (message.includes("must") || message.includes("invalid") || message.includes("not allowed") || message.includes("No onboarding")) {
      res.status(400).json({ error: message });
      return;
    }
    console.error("[VerificationWebhook] callback processing failed", { message });
    res.status(503).json({ error: "Verification processing is temporarily unavailable" });
  }
});
