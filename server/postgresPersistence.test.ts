/**
 * Integration tests for the PostgreSQL-backed repositories.
 *
 * These run against a real embedded PostgreSQL (PGlite) with the production
 * migration chain applied — proving that every core repository persists
 * durably with no in-memory or file-store behavior.
 */
import { describe, expect, it } from 'vitest';
import {
  createParcel,
  getParcelById,
  getParcelByNumber,
  searchParcels,
  updateParcel,
  verifyParcel,
  geospatialSearch,
} from './parcelRepository';
import {
  advanceTransaction,
  createTransaction,
  getTransactionById,
  listTransactions,
} from './transactionRepository';
import {
  confirmPaymentRecord,
  getLatestPaymentForTransaction,
  getPaymentById,
  listPaymentsByTransaction,
  processPaymentRecord,
} from './paymentRepository';
import {
  createTitle,
  getTitleByNumber,
  getTitlesByOwner,
  searchTitles,
  verifyTitle,
} from './titleRepository';
import { readJsonStore, writeJsonStore } from './jsonStore';

describe('parcel repository (PostgreSQL)', () => {
  it('persists created parcels and retrieves them by id and number', async () => {
    const created = await createParcel({
      surveyPlanNumber: 'SP/TEST/1001',
      state: 'Lagos',
      lga: 'Eti-Osa',
      ward: 'Ward 9',
      streetAddress: '1 Persistence Close',
      areaSquareMeters: 640,
      geometryGeoJSON: '{"type":"Polygon","coordinates":[]}',
      landUseType: 'residential',
      surveyorId: 'surveyor-test',
      notes: 'Integration test parcel',
    });

    expect(created.id).toBeGreaterThan(0);
    expect(created.status).toBe('pending_verification');
    expect(created.parcelNumber).toMatch(/^LAGOS-ETIOSA-\d{4}-[A-F0-9]{8}$/);

    const byId = await getParcelById(created.id);
    expect(byId?.parcelNumber).toBe(created.parcelNumber);
    expect(byId?.streetAddress).toBe('1 Persistence Close');

    const byNumber = await getParcelByNumber(created.parcelNumber);
    expect(byNumber?.id).toBe(created.id);
  });

  it('verifies parcels with an auditable verifier trail', async () => {
    const created = await createParcel({
      surveyPlanNumber: 'SP/TEST/1002',
      state: 'Abuja',
      lga: 'Garki',
      areaSquareMeters: 900,
      geometryGeoJSON: '{}',
      landUseType: 'commercial',
      surveyorId: 'surveyor-test',
    });

    const verified = await verifyParcel(created.id, 'registrar-42');
    expect(verified.status).toBe('verified');
    expect(verified.verifierId).toBe('registrar-42');
    expect(verified.verifiedAt).toBeDefined();

    // Idempotent: verifying again keeps the same state.
    const again = await verifyParcel(created.id, 'registrar-42');
    expect(again.status).toBe('verified');
  });

  it('rejects updates to registered parcels (amendment workflow rule)', async () => {
    // Parcel 2 is seeded as registered by the production migration chain.
    await expect(updateParcel(2, { notes: 'illegal edit' })).rejects.toThrow(/amendment/i);
  });
    
  it('searches with filters and pagination', async () => {
    const lagos = await searchParcels({ state: 'Lagos', limit: 50 });
    expect(lagos.parcels.length).toBeGreaterThanOrEqual(3);
    expect(lagos.parcels.every((p) => p.state === 'Lagos')).toBe(true);

    const expensive = await searchParcels({ priceMin: 200000000, limit: 50 });
    expect(expensive.parcels.every((p) => p.estimatedValue !== null && p.estimatedValue >= 200000000)).toBe(true);

    const paged = await searchParcels({ page: 2, limit: 2 });
    expect(paged.parcels.length).toBeLessThanOrEqual(2);
    expect(paged.page).toBe(2);
  });

  it('performs radius geospatial search ordered by distance', async () => {
    const result = await geospatialSearch({ centerLat: 6.4281, centerLng: 3.4219, radiusKm: 2 });
    expect(result.parcels.length).toBeGreaterThanOrEqual(1);
    expect(result.parcels[0].distance).toBeLessThanOrEqual(2);
    const distances = result.parcels.map((p) => p.distance);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });
});

describe('transaction repository (PostgreSQL)', () => {
  it('persists transactions through the workflow state machine', async () => {
    const tx = await createTransaction({
      type: 'transfer',
      parcelId: 1,
      initiatorId: 1,
      initiatorName: 'Amina Bello',
      counterpartyName: 'Test Buyer',
      considerationAmount: 50000000,
      notes: 'Integration test transfer',
    });

    expect(tx.status).toBe('pending_approval');
    expect(tx.paymentStatus).toBe('unpaid');

    const submitted = await advanceTransaction(tx.id, 'submit');
    expect(submitted.workflowStage).toBe('registry_review');
    expect(submitted.documentStatus).toBe('submitted');

    const approved = await advanceTransaction(tx.id, 'approve');
    expect(approved.status).toBe('registered');
    expect(approved.documentStatus).toBe('verified');

    const completed = await advanceTransaction(tx.id, 'complete');
    expect(completed.status).toBe('completed');
    expect(completed.paymentStatus).toBe('paid');

    const fetched = await getTransactionById(tx.id);
    expect(fetched?.status).toBe('completed');
  });

  it('rejects advancing a missing transaction', async () => {
    await expect(advanceTransaction(999999, 'approve')).rejects.toThrow(/not found/i);
  });

  it('lists transactions with filters', async () => {
    const registered = await listTransactions({ status: 'registered', limit: 50 });
    expect(registered.transactions.every((t) => t.status === 'registered')).toBe(true);
  });
});

describe('payment repository (PostgreSQL)', () => {
  it('creates payments as pending — never auto-completed', async () => {
    const tx = await createTransaction({
      type: 'transfer',
      parcelId: 1,
      initiatorId: 1,
      initiatorName: 'Amina Bello',
      considerationAmount: 10000000,
    });

    const payment = await processPaymentRecord({
      transactionId: tx.id,
      payerId: 1,
      amount: 10000000,
      method: 'card',
    });

    // The old simulation auto-completed card payments; the honest lifecycle
    // requires explicit confirmation.
    expect(payment.status).toBe('pending');
    expect(payment.reference).toMatch(/^PAY-\d{8}-\d{5}$/);
    expect(payment.totalAmount).toBe(payment.amount + payment.feeAmount);
  });

  it('completes payments only through confirmation and advances the transaction', async () => {
    const tx = await createTransaction({
      type: 'transfer',
      parcelId: 1,
      initiatorId: 1,
      initiatorName: 'Amina Bello',
      considerationAmount: 8000000,
    });

    const payment = await processPaymentRecord({
      transactionId: tx.id,
      payerId: 1,
      amount: 8000000,
      method: 'bank_transfer',
    });

    const confirmed = await confirmPaymentRecord(payment.id);
    expect(confirmed.status).toBe('completed');
    expect(confirmed.receiptNumber).toMatch(/^RCP-/);
    expect(confirmed.paidAt).toBeDefined();

    const updatedTx = await getTransactionById(tx.id);
    expect(updatedTx?.status).toBe('completed');
    expect(updatedTx?.paymentStatus).toBe('paid');

    // Idempotent: confirming again returns the same completed record.
    const again = await confirmPaymentRecord(payment.id);
    expect(again.status).toBe('completed');
    expect(again.receiptNumber).toBe(confirmed.receiptNumber);
  });

  it('returns the existing completed payment instead of duplicating', async () => {
    const tx = await createTransaction({
      type: 'transfer',
      parcelId: 1,
      initiatorId: 1,
      initiatorName: 'Amina Bello',
      considerationAmount: 6000000,
    });

    const first = await processPaymentRecord({ transactionId: tx.id, payerId: 1, amount: 6000000, method: 'card' });
    await confirmPaymentRecord(first.id);
    const second = await processPaymentRecord({ transactionId: tx.id, payerId: 1, amount: 6000000, method: 'card' });
    expect(second.id).toBe(first.id);
  });

  it('generates real Mojaloop transaction ids for mojaloop payments', async () => {
    const tx = await createTransaction({
      type: 'transfer',
      parcelId: 1,
      initiatorId: 1,
      initiatorName: 'Amina Bello',
      considerationAmount: 4000000,
    });
    const payment = await processPaymentRecord({ transactionId: tx.id, payerId: 1, amount: 4000000, method: 'mojaloop' });
    expect(payment.channelReference).toMatch(/^txn_\d+_[0-9a-f]{16}$/);
    expect(payment.status).toBe('pending');
  });

  it('lists payments per transaction, newest first', async () => {
    const tx = await createTransaction({
      type: 'transfer',
      parcelId: 1,
      initiatorId: 1,
      initiatorName: 'Amina Bello',
      considerationAmount: 3000000,
    });
    const payment = await processPaymentRecord({ transactionId: tx.id, payerId: 1, amount: 3000000, method: 'ussd' });
    expect(payment.ussdCode).toMatch(/^\*737\*000\*\d+#$/);

    const list = await listPaymentsByTransaction(tx.id);
    expect(list.length).toBe(1);
    const latest = await getLatestPaymentForTransaction(tx.id);
    expect(latest?.id).toBe(payment.id);
    const byId = await getPaymentById(payment.id);
    expect(byId?.reference).toBe(payment.reference);
  });
});

describe('title repository (PostgreSQL)', () => {
  it('persists titles with generated numbers and verifies them', async () => {
    const title = await createTitle({
      parcelId: 1,
      ownerId: 1,
      ownershipType: 'sole',
      ownershipPercentage: 100,
      titleType: 'certificate_of_occupancy',
    });

    expect(title.titleNumber).toMatch(/^CERT-\d{4}-\d{4}$/);
    expect(title.status).toBe('pending_verification');

    const verified = await verifyTitle(title.id);
    expect(verified.status).toBe('verified');
    expect(verified.verifiedAt).toBeDefined();

    const byNumber = await getTitleByNumber(title.titleNumber);
    expect(byNumber?.id).toBe(title.id);
  });

  it('searches titles by owner and query', async () => {
    const owned = await getTitlesByOwner(1);
    expect(owned.length).toBeGreaterThanOrEqual(1);
    expect(owned.every((t) => t.ownerId === 1)).toBe(true);

    const found = await searchTitles({ query: 'C-of-O', limit: 50 });
    expect(found.titles.length).toBeGreaterThanOrEqual(2);
  });
});

describe('jsonStore (PostgreSQL JSONB persistence)', () => {
  it('seeds on first read and persists writes across reads', async () => {
    const collection = 'test-collection-roundtrip';
    const initial = await readJsonStore(collection, () => ({ counter: 1, items: [] as string[] }));
    expect(initial.counter).toBe(1);

    await writeJsonStore(collection, { counter: 42, items: ['a', 'b'] });

    const reloaded = await readJsonStore(collection, () => ({ counter: 999, items: [] as string[] }));
    expect(reloaded.counter).toBe(42);
    expect(reloaded.items).toEqual(['a', 'b']);
  });
});
