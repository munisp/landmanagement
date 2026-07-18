/**
 * Bulk Import Service
 * Handle CSV/Excel parsing and batch database operations
 */

import { getDb, getUserByOpenId, upsertUser } from './db';
import { parcels, transactions, legalDocuments } from '../drizzle/schema';
import { eq } from 'drizzle-orm';
import { createParcel, getParcelByNumber, searchParcels, verifyParcel } from './parcelRepository';
import { listAllDocuments, uploadDocumentRecord } from './documentRepository';
import { createImportedTransaction, listTransactions } from './transactionRepository';
import { listAdminInsurancePolicies, listAdminMortgageApplications, listAdminTaxClearances } from './phase4AdminRepository';

export interface ImportResult {
  total: number;
  success: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
}

export interface ParcelImportRow {
  parcel_id: string;
  owner_name: string;
  area: number;
  coordinates: string;
  land_use: string;
  status: string;
}

export interface DocumentImportRow {
  document_id: string;
  parcel_id: string;
  document_type: string;
  file_url: string;
  upload_date: string;
}

export interface TransactionImportRow {
  transaction_id: string;
  parcel_id: string;
  type: string;
  amount: number;
  date: string;
  status: string;
}

export interface BulkExportRowMap {
  parcels: Array<Record<string, string | number | boolean | null>>;
  documents: Array<Record<string, string | number | boolean | null>>;
  transactions: Array<Record<string, string | number | boolean | null>>;
  users: Array<Record<string, string | number | boolean | null>>;
}

function normalizeImportIdentifier(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown-owner';
}

async function resolveImportedOwnerId(ownerName: string): Promise<number> {
  const identifier = normalizeImportIdentifier(ownerName);
  const openId = `bulk-import-${identifier}`;
  const email = `${identifier}@bulk-import.local`;

  await upsertUser({
    openId,
    name: ownerName,
    email,
    loginMethod: 'bulk_import',
    role: 'user',
  });

  const user = await getUserByOpenId(openId);
  if (!user) {
    return 1;
  }

  return Number(user.id);
}

function validateParcel(row: any): { valid: boolean; error?: string } {
  if (!row.parcel_id || typeof row.parcel_id !== 'string') {
    return { valid: false, error: 'Invalid or missing parcel_id' };
  }

  if (!row.owner_name || typeof row.owner_name !== 'string') {
    return { valid: false, error: 'Invalid or missing owner_name' };
  }

  const area = parseFloat(row.area);
  if (isNaN(area) || area <= 0) {
    return { valid: false, error: 'Invalid area value' };
  }

  if (!row.coordinates || typeof row.coordinates !== 'string') {
    return { valid: false, error: 'Invalid or missing coordinates' };
  }

  const validLandUses = ['Residential', 'Commercial', 'Agricultural', 'Industrial', 'Mixed'];
  if (!validLandUses.includes(row.land_use)) {
    return { valid: false, error: `Invalid land_use. Must be one of: ${validLandUses.join(', ')}` };
  }

  const validStatuses = ['Active', 'Pending', 'Inactive'];
  if (!validStatuses.includes(row.status)) {
    return { valid: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` };
  }

  return { valid: true };
}

function validateDocument(row: any): { valid: boolean; error?: string } {
  if (!row.document_id || typeof row.document_id !== 'string') {
    return { valid: false, error: 'Invalid or missing document_id' };
  }

  if (!row.parcel_id || typeof row.parcel_id !== 'string') {
    return { valid: false, error: 'Invalid or missing parcel_id' };
  }

  const validTypes = ['Title Deed', 'Survey Plan', 'Tax Clearance', 'Building Permit', 'Other'];
  if (!validTypes.includes(row.document_type)) {
    return { valid: false, error: `Invalid document_type. Must be one of: ${validTypes.join(', ')}` };
  }

  if (!row.file_url || typeof row.file_url !== 'string' || !row.file_url.startsWith('http')) {
    return { valid: false, error: 'Invalid file_url. Must be a valid URL' };
  }

  return { valid: true };
}

function validateTransaction(row: any): { valid: boolean; error?: string } {
  if (!row.transaction_id || typeof row.transaction_id !== 'string') {
    return { valid: false, error: 'Invalid or missing transaction_id' };
  }

  if (!row.parcel_id || typeof row.parcel_id !== 'string') {
    return { valid: false, error: 'Invalid or missing parcel_id' };
  }

  const validTypes = ['Transfer', 'Mortgage', 'Subdivision', 'Lease', 'Other'];
  if (!validTypes.includes(row.type)) {
    return { valid: false, error: `Invalid type. Must be one of: ${validTypes.join(', ')}` };
  }

  const amount = parseFloat(row.amount);
  if (isNaN(amount) || amount < 0) {
    return { valid: false, error: 'Invalid amount value' };
  }

  const validStatuses = ['Completed', 'Pending', 'Failed', 'Cancelled'];
  if (!validStatuses.includes(row.status)) {
    return { valid: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` };
  }

  return { valid: true };
}

export async function importParcels(data: ParcelImportRow[]): Promise<ImportResult> {
  const result: ImportResult = {
    total: data.length,
    success: 0,
    failed: 0,
    errors: [],
  };

  const db = await getDb();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const validation = validateParcel(row);

    if (!validation.valid) {
      result.failed++;
      result.errors.push({ row: i + 2, error: validation.error! });
      continue;
    }

    try {
      if (!db) {
        const createdParcel = await createParcel({
          surveyPlanNumber: row.coordinates.includes('SP/') ? row.coordinates : `IMP-${row.parcel_id}`,
          state: row.parcel_id.split('-')[0] === 'LG' ? 'Lagos' : row.parcel_id.split('-')[0] === 'AB' ? 'Abuja' : 'Imported State',
          lga: 'Imported LGA',
          ward: 'Imported Ward',
          streetAddress: `Imported parcel for ${row.owner_name}`,
          areaSquareMeters: Math.round(parseFloat(row.area.toString())),
          geometryGeoJSON: JSON.stringify({ type: 'Polygon', coordinates: [] }),
          landUseType: row.land_use.toLowerCase(),
          notes: `Bulk imported parcel source ${row.parcel_id} for ${row.owner_name}. Coordinates: ${row.coordinates}`,
          surveyorId: 'bulk-import',
        });

        if (row.status === 'Active') {
          await verifyParcel(createdParcel.id, 'bulk-import');
        }

        result.success++;
        continue;
      }

      const ownerId = await resolveImportedOwnerId(row.owner_name);

      await db.insert(parcels).values({
        parcelId: row.parcel_id,
        ownerId,
        address: 'Imported parcel',
        area: Math.round(parseFloat(row.area.toString())),
        landUse: row.land_use,
        status: row.status as any,
      });

      result.success++;
    } catch (error) {
      result.failed++;
      result.errors.push({
        row: i + 2,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return result;
}

export async function importDocuments(data: DocumentImportRow[]): Promise<ImportResult> {
  const result: ImportResult = {
    total: data.length,
    success: 0,
    failed: 0,
    errors: [],
  };

  const db = await getDb();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const validation = validateDocument(row);

    if (!validation.valid) {
      result.failed++;
      result.errors.push({ row: i + 2, error: validation.error! });
      continue;
    }

    try {
      if (!db) {
        const parcel = await getParcelByNumber(row.parcel_id);
        if (!parcel) {
          throw new Error(`Parcel ${row.parcel_id} not found`);
        }

        uploadDocumentRecord({
          parcelId: parcel.id,
          transactionId: undefined,
          titleId: undefined,
          type: row.document_type.toLowerCase().replace(/\s+/g, '_'),
          title: `Imported ${row.document_type}`,
          description: `Bulk imported document ${row.document_id}`,
          fileKey: row.document_id,
          fileUrl: row.file_url,
          fileName: row.file_url.split('/').pop() || `${row.document_id}.pdf`,
          mimeType: 'application/pdf',
          uploadedBy: 1,
        });

        result.success++;
        continue;
      }

      const parcel = await db.select().from(parcels).where(eq(parcels.parcelId, row.parcel_id)).limit(1);
      if (parcel.length === 0) {
        throw new Error(`Parcel ${row.parcel_id} not found`);
      }

      await db.insert(legalDocuments).values({
        documentId: row.document_id,
        transactionId: 'BULK_IMPORT',
        parcelId: parcel[0].id,
        documentType: row.document_type as any,
        title: `Imported Document ${row.document_id}`,
        documentUrl: row.file_url,
        status: 'draft' as any,
      });

      result.success++;
    } catch (error) {
      result.failed++;
      result.errors.push({
        row: i + 2,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return result;
}

export async function importTransactions(data: TransactionImportRow[]): Promise<ImportResult> {
  const result: ImportResult = {
    total: data.length,
    success: 0,
    failed: 0,
    errors: [],
  };

  const db = await getDb();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const validation = validateTransaction(row);

    if (!validation.valid) {
      result.failed++;
      result.errors.push({ row: i + 2, error: validation.error! });
      continue;
    }

    try {
      if (!db) {
        const parcel = await getParcelByNumber(row.parcel_id);
        if (!parcel) {
          throw new Error(`Parcel ${row.parcel_id} not found`);
        }

        const normalizedStatus: {
          status: 'completed' | 'pending_approval' | 'rejected';
          workflowStage: string;
          paymentStatus: 'paid' | 'pending' | 'unpaid';
          documentStatus: 'verified' | 'submitted' | 'pending';
        } = row.status === 'Completed'
          ? { status: 'completed', workflowStage: 'completed', paymentStatus: 'paid', documentStatus: 'verified' }
          : row.status === 'Pending'
            ? { status: 'pending_approval', workflowStage: 'registry_review', paymentStatus: 'pending', documentStatus: 'submitted' }
            : { status: 'rejected', workflowStage: 'closed', paymentStatus: 'unpaid', documentStatus: 'pending' };

        await createImportedTransaction({
          externalReference: row.transaction_id,
          type: row.type.toLowerCase(),
          parcelId: parcel.id,
          initiatorId: 1,
          initiatorName: 'Bulk Import',
          counterpartyName: 'Imported Counterparty',
          considerationAmount: row.amount,
          status: normalizedStatus.status,
          workflowStage: normalizedStatus.workflowStage,
          paymentStatus: normalizedStatus.paymentStatus,
          documentStatus: normalizedStatus.documentStatus,
          notes: `Imported transaction ${row.transaction_id} with source status ${row.status} on ${row.date}`,
          createdAt: new Date(row.date).toString() === 'Invalid Date' ? undefined : new Date(row.date).toISOString(),
        });

        result.success++;
        continue;
      }

      const parcel = await db.select().from(parcels).where(eq(parcels.parcelId, row.parcel_id)).limit(1);
      if (parcel.length === 0) {
        throw new Error(`Parcel ${row.parcel_id} not found`);
      }

      await db.insert(transactions).values({
        transactionId: row.transaction_id,
        parcelId: parcel[0].id,
        fromUserId: 1,
        toUserId: 1,
        transactionType: row.type as any,
        status: row.status as any,
        amount: Math.round(row.amount * 100),
        currency: 'NGN',
      });

      result.success++;
    } catch (error) {
      result.failed++;
      result.errors.push({
        row: i + 2,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return result;
}

export async function exportBulkData(type: keyof BulkExportRowMap): Promise<Array<Record<string, string | number | boolean | null>>> {
  if (type === 'parcels') {
    return (await searchParcels({ page: 1, limit: 5000 })).parcels.map((parcel) => ({
      parcel_id: parcel.parcelNumber,
      survey_plan_number: parcel.surveyPlanNumber,
      state: parcel.state,
      lga: parcel.lga,
      area_square_meters: parcel.areaSquareMeters,
      land_use: parcel.landUseType,
      status: parcel.status,
      estimated_value: parcel.estimatedValue,
      street_address: parcel.streetAddress ?? '',
      created_at: parcel.createdAt,
    }));
  }

  if (type === 'documents') {
    return (await listAllDocuments()).map((document) => ({
      document_id: document.id,
      parcel_id: document.parcelId ?? null,
      transaction_id: document.transactionId ?? null,
      type: document.type,
      title: document.title,
      file_name: document.fileName,
      file_url: document.fileUrl,
      verified: document.verified,
      uploaded_at: document.uploadedAt,
    }));
  }

  if (type === 'transactions') {
    return (await listTransactions({ page: 1, limit: 5000 })).transactions.map((transaction) => ({
      transaction_id: transaction.id,
      parcel_id: transaction.parcelId,
      type: transaction.type,
      status: transaction.status,
      workflow_stage: transaction.workflowStage,
      payment_status: transaction.paymentStatus,
      consideration_amount: transaction.considerationAmount,
      initiator_name: transaction.initiatorName,
      counterparty_name: transaction.counterpartyName ?? '',
      created_at: transaction.createdAt,
    }));
  }

  const dedupedUsers = new Map<number, Record<string, string | number | boolean | null>>();
  const userRows = [
    ...(await listAdminMortgageApplications()).map((item) => ({ id: item.applicantId, name: `Borrower ${item.applicantId}`, role: 'borrower', source: 'mortgage' })),
    ...(await listAdminTaxClearances()).map((item) => ({ id: item.ownerId, name: `Owner ${item.ownerId}`, role: 'owner', source: 'tax' })),
    ...(await listAdminInsurancePolicies()).map((item) => ({ id: item.policyHolderId, name: `Policy Holder ${item.policyHolderId}`, role: 'user', source: 'insurance' })),
    { id: 1, name: 'System Administrator', role: 'admin', source: 'system' },
  ];

  for (const row of userRows) {
    if (!dedupedUsers.has(row.id)) {
      dedupedUsers.set(row.id, {
        user_id: row.id,
        name: row.name,
        role: row.role,
        source: row.source,
      });
    }
  }

  return Array.from(dedupedUsers.values());
}
