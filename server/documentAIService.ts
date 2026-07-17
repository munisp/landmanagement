/**
 * Document AI Processing Service
 * OCR, classification, field extraction, and fraud detection
 */

import { getDb } from './db';
import { invokeLLM } from './_core/llm';
import { sql } from 'drizzle-orm';

export type DocumentType =
  | 'id_card'
  | 'land_title'
  | 'survey_report'
  | 'property_deed'
  | 'tax_assessment'
  | 'utility_bill'
  | 'other';

export type ValidationStatus = 'pending' | 'approved' | 'rejected' | 'needs_review';

export interface DocumentProcessingResult {
  id: number;
  documentId: number;
  documentType: DocumentType | null;
  ocrText: string | null;
  extractedFields: Record<string, any> | null;
  confidenceScore: number;
  fraudIndicators: Record<string, any> | null;
  validationStatus: ValidationStatus;
  processedAt: Date;
  processedBy: number | null;
}

export interface ExtractedFields {
  // Common fields
  documentNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  
  // Person fields
  fullName?: string;
  dateOfBirth?: string;
  address?: string;
  
  // Property fields
  propertyId?: string;
  parcelNumber?: string;
  coordinates?: { lat: number; lng: number };
  area?: string;
  location?: string;
  
  // Additional fields
  [key: string]: any;
}

/**
 * Process document with OCR and AI analysis
 */
export async function processDocument(
  documentId: number,
  documentUrl: string,
  options?: {
    userId?: number;
  }
): Promise<{ success: boolean; result?: DocumentProcessingResult; error?: string }> {
  try {
    console.log(`[DocumentAI] Processing document ${documentId} from ${documentUrl}`);

    // Step 1: Perform OCR and document analysis using LLM vision
    const analysisResult = await analyzeDocumentWithVision(documentUrl);
    
    if (!analysisResult.success) {
      return { success: false, error: analysisResult.error };
    }

    // Step 2: Extract structured fields
    const extractedFields = await extractFieldsFromText(
      analysisResult.ocrText!,
      analysisResult.documentType!
    );

    // Step 3: Detect fraud indicators
    const fraudIndicators = detectFraudIndicators(
      analysisResult.ocrText!,
      extractedFields,
      analysisResult.documentType!
    );

    // Step 4: Calculate confidence score
    const confidenceScore = calculateConfidenceScore(
      analysisResult.ocrText!,
      extractedFields,
      fraudIndicators
    );

    // Step 5: Save results to database
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const result = await db.execute(sql`
      INSERT INTO document_processing_results (
        document_id, document_type, ocr_text, extracted_fields,
        confidence_score, fraud_indicators, validation_status, processed_by
      )
      VALUES (
        ${documentId},
        ${analysisResult.documentType},
        ${analysisResult.ocrText},
        ${JSON.stringify(extractedFields)},
        ${confidenceScore},
        ${JSON.stringify(fraudIndicators)},
        ${confidenceScore >= 80 ? 'approved' : confidenceScore >= 60 ? 'needs_review' : 'rejected'},
        ${options?.userId || null}
      )
      RETURNING *
    `);

    const savedResult = Array.from(result)[0] as any;

    console.log(`[DocumentAI] Document ${documentId} processed with confidence ${confidenceScore}%`);

    return {
      success: true,
      result: {
        id: savedResult.id,
        documentId: savedResult.document_id,
        documentType: savedResult.document_type,
        ocrText: savedResult.ocr_text,
        extractedFields: savedResult.extracted_fields,
        confidenceScore: Number(savedResult.confidence_score),
        fraudIndicators: savedResult.fraud_indicators,
        validationStatus: savedResult.validation_status,
        processedAt: new Date(savedResult.processed_at),
        processedBy: savedResult.processed_by,
      },
    };
  } catch (error) {
    console.error('[DocumentAI] Failed to process document:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Analyze document using LLM vision API
 */
async function analyzeDocumentWithVision(
  documentUrl: string
): Promise<{ success: boolean; documentType?: DocumentType; ocrText?: string; error?: string }> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: 'system',
          content: 'You are a document analysis expert. Analyze the provided document image and extract all text content. Also identify the document type.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Please analyze this document and provide: 1) The document type (id_card, land_title, survey_report, property_deed, tax_assessment, utility_bill, or other), 2) All text content extracted from the document. Format your response as JSON with keys "documentType" and "ocrText".',
            },
            {
              type: 'image_url',
              image_url: {
                url: documentUrl,
                detail: 'high',
              },
            },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'document_analysis',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              documentType: {
                type: 'string',
                enum: ['id_card', 'land_title', 'survey_report', 'property_deed', 'tax_assessment', 'utility_bill', 'other'],
                description: 'The type of document',
              },
              ocrText: {
                type: 'string',
                description: 'All text content extracted from the document',
              },
            },
            required: ['documentType', 'ocrText'],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      return { success: false, error: 'No response from vision API' };
    }

    const parsed = JSON.parse(typeof content === 'string' ? content : JSON.stringify(content));
    
    return {
      success: true,
      documentType: parsed.documentType as DocumentType,
      ocrText: parsed.ocrText,
    };
  } catch (error) {
    console.error('[DocumentAI] Vision analysis failed:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Extract structured fields from OCR text
 */
async function extractFieldsFromText(
  ocrText: string,
  documentType: DocumentType
): Promise<ExtractedFields> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: 'system',
          content: `You are a document field extraction expert. Extract structured information from ${documentType} documents.`,
        },
        {
          role: 'user',
          content: `Extract all relevant fields from this ${documentType} document text:\n\n${ocrText}\n\nProvide the extracted fields as a JSON object.`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'field_extraction',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              documentNumber: { type: 'string' },
              issueDate: { type: 'string' },
              expiryDate: { type: 'string' },
              fullName: { type: 'string' },
              dateOfBirth: { type: 'string' },
              address: { type: 'string' },
              propertyId: { type: 'string' },
              parcelNumber: { type: 'string' },
              area: { type: 'string' },
              location: { type: 'string' },
            },
            required: [],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0].message.content;
    if (!content) return {};

    return JSON.parse(typeof content === 'string' ? content : JSON.stringify(content));
  } catch (error) {
    console.error('[DocumentAI] Field extraction failed:', error);
    return {};
  }
}

/**
 * Detect fraud indicators
 */
function detectFraudIndicators(
  ocrText: string,
  extractedFields: ExtractedFields,
  documentType: DocumentType
): Record<string, any> {
  const indicators: Record<string, any> = {
    hasIssues: false,
    issues: [],
  };

  // Check for missing critical fields
  const criticalFields = getCriticalFieldsForType(documentType);
  const missingFields = criticalFields.filter(field => !extractedFields[field]);
  
  if (missingFields.length > 0) {
    indicators.hasIssues = true;
    indicators.issues.push({
      type: 'missing_fields',
      severity: 'high',
      details: `Missing critical fields: ${missingFields.join(', ')}`,
    });
  }

  // Check for date inconsistencies
  if (extractedFields.issueDate && extractedFields.expiryDate) {
    const issueDate = new Date(extractedFields.issueDate);
    const expiryDate = new Date(extractedFields.expiryDate);
    
    if (expiryDate < issueDate) {
      indicators.hasIssues = true;
      indicators.issues.push({
        type: 'date_inconsistency',
        severity: 'critical',
        details: 'Expiry date is before issue date',
      });
    }
  }

  // Check for suspicious patterns in text
  const suspiciousPatterns = [
    /photoshop/i,
    /edited/i,
    /modified/i,
    /fake/i,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(ocrText)) {
      indicators.hasIssues = true;
      indicators.issues.push({
        type: 'suspicious_text',
        severity: 'critical',
        details: `Suspicious text pattern detected: ${pattern.source}`,
      });
    }
  }

  // Check text quality (low quality might indicate tampering)
  const textQuality = calculateTextQuality(ocrText);
  if (textQuality < 0.5) {
    indicators.hasIssues = true;
    indicators.issues.push({
      type: 'low_quality',
      severity: 'medium',
      details: `Low text quality score: ${textQuality.toFixed(2)}`,
    });
  }

  return indicators;
}

/**
 * Calculate confidence score (0-100)
 */
function calculateConfidenceScore(
  ocrText: string,
  extractedFields: ExtractedFields,
  fraudIndicators: Record<string, any>
): number {
  let score = 100;

  // Deduct for fraud indicators
  if (fraudIndicators.hasIssues) {
    for (const issue of fraudIndicators.issues) {
      switch (issue.severity) {
        case 'critical':
          score -= 30;
          break;
        case 'high':
          score -= 20;
          break;
        case 'medium':
          score -= 10;
          break;
        case 'low':
          score -= 5;
          break;
      }
    }
  }

  // Deduct for missing fields
  const fieldCount = Object.keys(extractedFields).length;
  if (fieldCount < 3) {
    score -= 20;
  } else if (fieldCount < 5) {
    score -= 10;
  }

  // Deduct for low text quality
  const textQuality = calculateTextQuality(ocrText);
  if (textQuality < 0.7) {
    score -= 15;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate text quality score (0-1)
 */
function calculateTextQuality(text: string): number {
  if (!text || text.length < 10) return 0;

  // Calculate ratio of alphanumeric characters
  const alphanumeric = text.match(/[a-zA-Z0-9]/g)?.length || 0;
  const total = text.length;
  const alphanumericRatio = alphanumeric / total;

  // Calculate average word length
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;

  // Combine metrics
  const qualityScore = (alphanumericRatio * 0.6) + (Math.min(avgWordLength / 10, 1) * 0.4);

  return qualityScore;
}

/**
 * Get critical fields for document type
 */
function getCriticalFieldsForType(documentType: DocumentType): string[] {
  switch (documentType) {
    case 'id_card':
      return ['fullName', 'dateOfBirth', 'documentNumber'];
    case 'land_title':
    case 'property_deed':
      return ['propertyId', 'parcelNumber', 'location'];
    case 'survey_report':
      return ['parcelNumber', 'area', 'coordinates'];
    case 'tax_assessment':
      return ['propertyId', 'issueDate'];
    case 'utility_bill':
      return ['address', 'issueDate'];
    default:
      return [];
  }
}

/**
 * Get processing results for a document
 */
export async function getDocumentProcessingResults(
  documentId: number
): Promise<DocumentProcessingResult[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    const result = await db.execute(sql`
      SELECT *
      FROM document_processing_results
      WHERE document_id = ${documentId}
      ORDER BY processed_at DESC
    `);

    return Array.from(result).map((row: any) => ({
      id: row.id,
      documentId: row.document_id,
      documentType: row.document_type,
      ocrText: row.ocr_text,
      extractedFields: row.extracted_fields,
      confidenceScore: Number(row.confidence_score),
      fraudIndicators: row.fraud_indicators,
      validationStatus: row.validation_status,
      processedAt: new Date(row.processed_at),
      processedBy: row.processed_by,
    }));
  } catch (error) {
    console.error('[DocumentAI] Failed to get processing results:', error);
    return [];
  }
}

/**
 * Update validation status
 */
export async function updateValidationStatus(
  resultId: number,
  status: ValidationStatus,
  userId?: number
): Promise<{ success: boolean }> {
  try {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    await db.execute(sql`
      UPDATE document_processing_results
      SET validation_status = ${status},
          processed_by = ${userId || null}
      WHERE id = ${resultId}
    `);

    console.log(`[DocumentAI] Updated validation status for result ${resultId} to ${status}`);

    return { success: true };
  } catch (error) {
    console.error('[DocumentAI] Failed to update validation status:', error);
    return { success: false };
  }
}

export interface DocumentComparisonResult {
  leftDocumentId: number;
  rightDocumentId: number;
  comparedAt: string;
  textSimilarity: number;
  overallMatchScore: number;
  matchingFields: string[];
  differingFields: Array<{
    field: string;
    leftValue: string | null;
    rightValue: string | null;
  }>;
  summary: string;
}

export interface DocumentSummaryResult {
  documentId: number;
  summary: string;
  bulletPoints: string[];
  recommendedAction: string;
}

export interface DocumentSignatureVerificationResult {
  documentId: number;
  hasSignature: boolean;
  signerName: string | null;
  confidence: number;
  verificationNotes: string[];
}

function normalizeComparableValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).trim().toLowerCase();
}

function calculateTextSimilarity(leftText: string, rightText: string): number {
  const leftTokens = new Set(leftText.toLowerCase().split(/\W+/).filter(Boolean));
  const rightTokens = new Set(rightText.toLowerCase().split(/\W+/).filter(Boolean));
  const union = new Set(Array.from(leftTokens).concat(Array.from(rightTokens)));
  if (union.size === 0) return 100;

  let intersectionCount = 0;
  for (const token of Array.from(leftTokens)) {
    if (rightTokens.has(token)) intersectionCount += 1;
  }

  return Math.round((intersectionCount / union.size) * 100);
}

export async function summarizeDocumentResults(
  documentId: number
): Promise<DocumentSummaryResult> {
  const results = await getDocumentProcessingResults(documentId);
  const latest = results[0];

  if (!latest) {
    throw new Error('Document must be processed before it can be summarized');
  }

  const promptPayload = {
    documentType: latest.documentType,
    validationStatus: latest.validationStatus,
    confidenceScore: latest.confidenceScore,
    extractedFields: latest.extractedFields || {},
    fraudIndicators: latest.fraudIndicators || {},
    ocrText: latest.ocrText || '',
  };

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: 'system',
          content: 'You are a land-registry document review assistant. Summarize processed documents clearly for operators using short, factual language.',
        },
        {
          role: 'user',
          content: `Summarize this processed document result and provide a concise summary, three to five bullet points, and a recommended operator action.\n\n${JSON.stringify(promptPayload)}`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'document_summary',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              bulletPoints: {
                type: 'array',
                items: { type: 'string' },
                minItems: 1,
                maxItems: 5,
              },
              recommendedAction: { type: 'string' },
            },
            required: ['summary', 'bulletPoints', 'recommendedAction'],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0].message.content;
    const parsed = JSON.parse(typeof content === 'string' ? content : JSON.stringify(content));

    return {
      documentId,
      summary: parsed.summary,
      bulletPoints: parsed.bulletPoints,
      recommendedAction: parsed.recommendedAction,
    };
  } catch (error) {
    const extractedFieldNames = Object.keys((latest.extractedFields || {}) as Record<string, unknown>);
    return {
      documentId,
      summary: `Processed ${latest.documentType || 'document'} with ${latest.confidenceScore}% confidence and ${latest.validationStatus.replace('_', ' ')} status.`,
      bulletPoints: [
        `Detected type: ${latest.documentType || 'unknown'}`,
        `Extracted fields: ${extractedFieldNames.length ? extractedFieldNames.join(', ') : 'none detected'}`,
        `Fraud indicators present: ${latest.fraudIndicators?.hasIssues ? 'yes' : 'no'}`,
      ],
      recommendedAction: latest.validationStatus === 'approved' ? 'Proceed with the verified document workflow.' : latest.validationStatus === 'rejected' ? 'Reject or request a corrected document package.' : 'Review extracted fields and fraud indicators before final decision.',
    };
  }
}

export async function verifyDocumentSignature(
  documentId: number
): Promise<DocumentSignatureVerificationResult> {
  const results = await getDocumentProcessingResults(documentId);
  const latest = results[0];

  if (!latest) {
    throw new Error('Document must be processed before signature verification');
  }

  const payload = {
    documentType: latest.documentType,
    extractedFields: latest.extractedFields || {},
    ocrText: latest.ocrText || '',
  };

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: 'system',
          content: 'You are a document-signature verification assistant. Decide whether OCR text suggests a signed or executed document and identify the likely signatory if available.',
        },
        {
          role: 'user',
          content: `Assess whether this processed document appears signed or executed based on OCR text and extracted fields. Return a JSON object with hasSignature, signerName, confidence, and verificationNotes.\n\n${JSON.stringify(payload)}`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'document_signature_verification',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              hasSignature: { type: 'boolean' },
              signerName: { type: ['string', 'null'] },
              confidence: { type: 'number' },
              verificationNotes: {
                type: 'array',
                items: { type: 'string' },
                minItems: 1,
                maxItems: 5,
              },
            },
            required: ['hasSignature', 'signerName', 'confidence', 'verificationNotes'],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0].message.content;
    const parsed = JSON.parse(typeof content === 'string' ? content : JSON.stringify(content));

    return {
      documentId,
      hasSignature: Boolean(parsed.hasSignature),
      signerName: parsed.signerName ?? null,
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence ?? 0))),
      verificationNotes: Array.isArray(parsed.verificationNotes) ? parsed.verificationNotes : ['Signature verification completed.'],
    };
  } catch (error) {
    const text = (latest.ocrText || '').toLowerCase();
    const signatureDetected = /(signed|signature|signatory|authorised signatory|authorized signatory|executed by)/i.test(text);
    const possibleSigner = typeof (latest.extractedFields as Record<string, unknown> | null)?.fullName === 'string'
      ? String((latest.extractedFields as Record<string, unknown>).fullName)
      : null;

    return {
      documentId,
      hasSignature: signatureDetected,
      signerName: possibleSigner,
      confidence: signatureDetected ? 68 : 42,
      verificationNotes: signatureDetected
        ? ['Signature-related language was detected in the OCR text.', possibleSigner ? `Possible signatory: ${possibleSigner}` : 'No signer name could be extracted reliably.']
        : ['No strong signature-related language was detected in the OCR text.', 'Manual document-image review is still recommended for handwritten or visual signatures.'],
    };
  }
}

export async function compareDocumentResults(
  leftDocumentId: number,
  rightDocumentId: number
): Promise<DocumentComparisonResult> {
  const [leftResults, rightResults] = await Promise.all([
    getDocumentProcessingResults(leftDocumentId),
    getDocumentProcessingResults(rightDocumentId),
  ]);

  const left = leftResults[0];
  const right = rightResults[0];

  if (!left || !right) {
    throw new Error('Both documents must be processed before they can be compared');
  }

  const leftFields = (left.extractedFields || {}) as Record<string, unknown>;
  const rightFields = (right.extractedFields || {}) as Record<string, unknown>;
  const fieldNames = Array.from(new Set([...Object.keys(leftFields), ...Object.keys(rightFields)])).sort();

  const matchingFields: string[] = [];
  const differingFields: Array<{ field: string; leftValue: string | null; rightValue: string | null }> = [];

  for (const field of fieldNames) {
    const leftValue = normalizeComparableValue(leftFields[field]);
    const rightValue = normalizeComparableValue(rightFields[field]);

    if (leftValue && rightValue && leftValue === rightValue) {
      matchingFields.push(field);
    } else if (leftValue || rightValue) {
      differingFields.push({
        field,
        leftValue: leftValue || null,
        rightValue: rightValue || null,
      });
    }
  }

  const textSimilarity = calculateTextSimilarity(left.ocrText || '', right.ocrText || '');
  const fieldScoreBase = matchingFields.length + differingFields.length;
  const fieldMatchScore = fieldScoreBase === 0 ? 100 : Math.round((matchingFields.length / fieldScoreBase) * 100);
  const overallMatchScore = Math.round((textSimilarity * 0.4) + (fieldMatchScore * 0.6));

  const summary = differingFields.length === 0
    ? 'Documents are closely aligned across extracted fields and OCR content.'
    : `${matchingFields.length} extracted field(s) matched and ${differingFields.length} differed between the two processed documents.`;

  return {
    leftDocumentId,
    rightDocumentId,
    comparedAt: new Date().toISOString(),
    textSimilarity,
    overallMatchScore,
    matchingFields,
    differingFields,
    summary,
  };
}
