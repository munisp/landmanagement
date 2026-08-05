import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { documentVerifications, verificationAuditLog } from "../drizzle/schema";
import { requireDb } from "./db";

export type OCRResult = {
  text: string;
  confidence: number;
  engine: string;
  blocks: Array<{ text: string; confidence: number; bbox: [number, number, number, number] }>;
};

export type ExtractedData = Record<string, unknown>;
export type FraudDetectionResult = {
  fraudScore: number;
  authenticityScore: number;
  flags: Array<{ type: string; severity: "low" | "medium" | "high" | "critical"; description: string; confidence: number }>;
};

type ExternalAnalysis = {
  provider: string;
  verificationReference: string;
  status: "requires_review" | "rejected" | "verified";
  ocr: OCRResult;
  extraction: ExtractedData;
  risk: FraudDetectionResult;
};

function verifierConfig(): { baseUrl: string; apiKey: string; timeoutMs: number } {
  const baseUrl = process.env.DOCUMENT_VERIFICATION_SERVICE_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.DOCUMENT_VERIFICATION_SERVICE_API_KEY?.trim();
  const timeoutMs = Number(process.env.VERIFICATION_SERVICE_TIMEOUT_MS || 10_000);
  if (!baseUrl || !apiKey) throw new Error("DOCUMENT_VERIFICATION_SERVICE_URL and DOCUMENT_VERIFICATION_SERVICE_API_KEY are required for document verification");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) throw new Error("VERIFICATION_SERVICE_TIMEOUT_MS must be between 1000 and 120000");
  return { baseUrl, apiKey, timeoutMs };
}

function asBoundedString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error(`Verifier response has an invalid ${field}`);
  return value;
}

function normalizeAnalysis(value: unknown): ExternalAnalysis {
  if (!value || typeof value !== "object") throw new Error("Verifier returned no analysis payload");
  const result = value as Record<string, unknown>;
  const provider = asBoundedString(result.provider, "provider", 120);
  const verificationReference = asBoundedString(result.verificationReference, "verificationReference", 255);
  const status = result.status;
  if (status !== "requires_review" && status !== "rejected" && status !== "verified") throw new Error("Verifier returned an unsupported status");
  const ocr = result.ocr as Record<string, unknown> | undefined;
  const risk = result.risk as Record<string, unknown> | undefined;
  if (!ocr || !risk || !Array.isArray(ocr.blocks) || !Array.isArray(risk.flags)) throw new Error("Verifier response is missing OCR or risk evidence");
  const confidence = Number(ocr.confidence);
  const fraudScore = Number(risk.fraudScore);
  const authenticityScore = Number(risk.authenticityScore);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) throw new Error("Verifier returned an invalid OCR confidence");
  if (!Number.isFinite(fraudScore) || fraudScore < 0 || fraudScore > 100 || !Number.isFinite(authenticityScore) || authenticityScore < 0 || authenticityScore > 100) {
    throw new Error("Verifier returned invalid risk scores");
  }
  const blocks = ocr.blocks.map((block, index) => {
    if (!block || typeof block !== "object") throw new Error(`Verifier OCR block ${index} is invalid`);
    const candidate = block as Record<string, unknown>;
    const bbox = candidate.bbox;
    if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((coordinate) => !Number.isFinite(Number(coordinate)))) throw new Error(`Verifier OCR block ${index} has invalid coordinates`);
    return { text: asBoundedString(candidate.text, `ocr.blocks[${index}].text`, 10_000), confidence: Number(candidate.confidence), bbox: bbox.map(Number) as [number, number, number, number] };
  });
  const flags = risk.flags.map((flag, index) => {
    if (!flag || typeof flag !== "object") throw new Error(`Verifier risk flag ${index} is invalid`);
    const candidate = flag as Record<string, unknown>;
    const severity = candidate.severity;
    if (severity !== "low" && severity !== "medium" && severity !== "high" && severity !== "critical") throw new Error(`Verifier risk flag ${index} has invalid severity`);
    const normalizedSeverity = severity as FraudDetectionResult["flags"][number]["severity"];
    return { type: asBoundedString(candidate.type, `risk.flags[${index}].type`, 120), severity: normalizedSeverity, description: asBoundedString(candidate.description, `risk.flags[${index}].description`, 1_000), confidence: Number(candidate.confidence) };
  });
  return {
    provider,
    verificationReference,
    status,
    ocr: { text: asBoundedString(ocr.text, "ocr.text", 250_000), confidence, engine: asBoundedString(ocr.engine, "ocr.engine", 120), blocks },
    extraction: result.extraction && typeof result.extraction === "object" ? result.extraction as ExtractedData : {},
    risk: { fraudScore, authenticityScore, flags },
  };
}

async function analyzeDocument(params: { applicationId: number; documentType: string; documentUrl: string; fileName: string; fileSize: number; mimeType: string; userId?: number }): Promise<ExternalAnalysis> {
  const config = verifierConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/v1/documents/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}`, "Idempotency-Key": `${params.applicationId}:${params.documentUrl}` },
      body: JSON.stringify({ applicationId: params.applicationId, documentType: params.documentType, documentUrl: params.documentUrl, fileName: params.fileName, fileSize: params.fileSize, mimeType: params.mimeType, submittedBy: params.userId ?? null }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Document verifier returned HTTP ${response.status}`);
    return normalizeAnalysis(payload);
  } finally {
    clearTimeout(timer);
  }
}

export async function processDocumentVerification(params: { applicationId: number; documentType: string; documentUrl: string; fileName: string; fileSize: number; mimeType: string; userId?: number }) {
  const db = await requireDb();
  const analysis = await analyzeDocument(params);
  const verificationId = `DOC-VER-${randomUUID()}`;
  // Provider output can reject, but it can never auto-approve. An authorized reviewer must attest the final verified state.
  const status = analysis.status === "rejected" ? "rejected" : "requires_review";
  const [verification] = await db.insert(documentVerifications).values({
    verificationId,
    applicationId: params.applicationId,
    documentType: params.documentType as never,
    documentUrl: params.documentUrl,
    fileName: params.fileName,
    fileSize: params.fileSize,
    mimeType: params.mimeType,
    status: status as never,
    verifiedAt: null,
    verifiedBy: null,
    ocrText: analysis.ocr.text,
    ocrConfidence: analysis.ocr.confidence,
    ocrEngine: analysis.ocr.engine,
    extractedData: JSON.stringify({ provider: analysis.provider, verificationReference: analysis.verificationReference, extraction: analysis.extraction }),
    fraudScore: analysis.risk.fraudScore,
    fraudFlags: JSON.stringify(analysis.risk.flags),
    authenticityScore: analysis.risk.authenticityScore,
  }).returning();
  await db.insert(verificationAuditLog).values({
    verificationId: verification.id,
    action: "provider_analysis_received",
    performedBy: params.userId ?? null,
    previousStatus: null,
    newStatus: status as never,
    details: `Private verifier ${analysis.provider} reference ${analysis.verificationReference}; provider outcome ${analysis.status} normalized to ${status}`,
  });
  return { verificationId, status, ocrResult: analysis.ocr, extractedData: analysis.extraction, fraudDetection: analysis.risk };
}

export async function getVerificationDetails(verificationId: string) {
  const db = await requireDb();
  const [verification] = await db.select().from(documentVerifications).where(eq(documentVerifications.verificationId, verificationId));
  if (!verification) throw new Error("Verification not found");
  return { ...verification, extractedData: verification.extractedData ? JSON.parse(verification.extractedData as string) : null, fraudFlags: verification.fraudFlags ? JSON.parse(verification.fraudFlags as string) : [] };
}

export async function updateVerificationStatus(params: { verificationId: string; newStatus: "verified" | "rejected" | "requires_review"; reviewNotes?: string; rejectionReason?: string; reviewerId: number }) {
  const db = await requireDb();
  const [verification] = await db.select().from(documentVerifications).where(eq(documentVerifications.verificationId, params.verificationId));
  if (!verification) throw new Error("Verification not found");
  if (params.newStatus === "verified" && !params.reviewNotes?.trim()) throw new Error("A reviewer note is required before verifying a document");
  if (params.newStatus === "rejected" && !params.rejectionReason?.trim()) throw new Error("A rejection reason is required before rejecting a document");
  await db.update(documentVerifications).set({ status: params.newStatus as never, verifiedAt: params.newStatus === "verified" ? new Date() : null, verifiedBy: params.reviewerId, reviewNotes: params.reviewNotes?.trim() || null, rejectionReason: params.rejectionReason?.trim() || null, updatedAt: new Date() }).where(eq(documentVerifications.verificationId, params.verificationId));
  await db.insert(verificationAuditLog).values({ verificationId: verification.id, action: "reviewer_status_updated", performedBy: params.reviewerId, previousStatus: verification.status as never, newStatus: params.newStatus as never, details: params.reviewNotes?.trim() || params.rejectionReason?.trim() || `Status changed to ${params.newStatus}` });
  return { success: true };
}

export async function getApplicationVerifications(applicationId: number) {
  const db = await requireDb();
  const records = await db.select().from(documentVerifications).where(eq(documentVerifications.applicationId, applicationId)).orderBy(desc(documentVerifications.createdAt));
  return records.map((record) => ({ ...record, extractedData: record.extractedData ? JSON.parse(record.extractedData as string) : null, fraudFlags: record.fraudFlags ? JSON.parse(record.fraudFlags as string) : [] }));
}

export async function getVerificationsRequiringReview() {
  const db = await requireDb();
  const records = await db.select().from(documentVerifications).where(and(eq(documentVerifications.status, "requires_review" as never))).orderBy(desc(documentVerifications.createdAt));
  return records.map((record) => ({ ...record, extractedData: record.extractedData ? JSON.parse(record.extractedData as string) : null, fraudFlags: record.fraudFlags ? JSON.parse(record.fraudFlags as string) : [] }));
}
