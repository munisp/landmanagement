/**
 * OCR Service Integration
 * Connects to Python OCR microservice (PaddleOCR + VLM + Docling)
 */

import axios from 'axios';

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://localhost:8003';

export interface OCRResult {
  text: string;
  confidence: number;
  language: string;
  blocks: Array<{
    text: string;
    bbox: [number, number, number, number];
    confidence: number;
  }>;
}

export interface DocumentClassification {
  documentType: string;
  confidence: number;
  suggestedCategory: string;
}

export interface ExtractedEntities {
  propertyId?: string;
  ownerName?: string;
  address?: string;
  area?: number;
  coordinates?: { lat: number; lon: number };
  date?: string;
  amount?: number;
}

export interface DocumentQualityScore {
  overall: number;
  readability: number;
  completeness: number;
  authenticity: number;
  issues: string[];
}

/**
 * Extract text from document using PaddleOCR
 */
export async function extractTextFromDocument(
  fileUrl: string,
  language: string = 'en'
): Promise<OCRResult> {
  try {
    const response = await axios.post(`${OCR_SERVICE_URL}/ocr/extract`, {
      file_url: fileUrl,
      language,
    }, {
      timeout: 60000, // 60 seconds
    });

    return response.data;
  } catch (error: any) {
    console.error('[OCR] Text extraction failed:', error.message);
    throw new Error(`OCR extraction failed: ${error.message}`);
  }
}

/**
 * Classify document type using VLM
 */
export async function classifyDocument(fileUrl: string): Promise<DocumentClassification> {
  try {
    const response = await axios.post(`${OCR_SERVICE_URL}/ocr/classify`, {
      file_url: fileUrl,
    }, {
      timeout: 30000,
    });

    return response.data;
  } catch (error: any) {
    console.error('[OCR] Document classification failed:', error.message);
    throw new Error(`Document classification failed: ${error.message}`);
  }
}

/**
 * Extract property entities from document
 */
export async function extractEntities(
  fileUrl: string,
  documentType: string
): Promise<ExtractedEntities> {
  try {
    const response = await axios.post(`${OCR_SERVICE_URL}/ocr/extract-entities`, {
      file_url: fileUrl,
      document_type: documentType,
    }, {
      timeout: 30000,
    });

    return response.data.entities;
  } catch (error: any) {
    console.error('[OCR] Entity extraction failed:', error.message);
    throw new Error(`Entity extraction failed: ${error.message}`);
  }
}

/**
 * Assess document quality
 */
export async function assessDocumentQuality(fileUrl: string): Promise<DocumentQualityScore> {
  try {
    const response = await axios.post(`${OCR_SERVICE_URL}/ocr/quality-check`, {
      file_url: fileUrl,
    }, {
      timeout: 30000,
    });

    return response.data;
  } catch (error: any) {
    console.error('[OCR] Quality assessment failed:', error.message);
    throw new Error(`Quality assessment failed: ${error.message}`);
  }
}

/**
 * Check for duplicate documents
 */
export async function checkDuplicateDocument(
  fileUrl: string,
  threshold: number = 0.85
): Promise<{ isDuplicate: boolean; similarDocuments: Array<{ id: string; similarity: number }> }> {
  try {
    const response = await axios.post(`${OCR_SERVICE_URL}/ocr/check-duplicate`, {
      file_url: fileUrl,
      threshold,
    }, {
      timeout: 30000,
    });

    return response.data;
  } catch (error: any) {
    console.error('[OCR] Duplicate check failed:', error.message);
    throw new Error(`Duplicate check failed: ${error.message}`);
  }
}

/**
 * Process document with full pipeline
 * Extracts text, classifies, extracts entities, and assesses quality
 */
export async function processDocument(fileUrl: string, language: string = 'en') {
  try {
    // Run OCR extraction
    const ocrResult = await extractTextFromDocument(fileUrl, language);

    // Classify document
    const classification = await classifyDocument(fileUrl);

    // Extract entities
    const entities = await extractEntities(fileUrl, classification.documentType);

    // Assess quality
    const quality = await assessDocumentQuality(fileUrl);

    // Check for duplicates
    const duplicateCheck = await checkDuplicateDocument(fileUrl);

    return {
      ocr: ocrResult,
      classification,
      entities,
      quality,
      duplicateCheck,
      processedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('[OCR] Document processing failed:', error.message);
    throw new Error(`Document processing failed: ${error.message}`);
  }
}
