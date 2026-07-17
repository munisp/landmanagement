import { describe, expect, it } from 'vitest';
import { getParcelById, getParcelByNumber, searchParcels } from './parcelRepository';
import { listTransactions } from './transactionRepository';
import * as verificationService from './verificationService';

describe('End-to-End Workflow Tests', () => {
  describe('Search Workflow', () => {
    it('should find parcels by parcel_id', async () => {
      const results = searchParcels({ query: 'LG-VI-2024', page: 1, limit: 10 });

      expect(results.parcels.length).toBeGreaterThan(0);
      expect(results.parcels[0].parcelNumber).toContain('LG-VI-2024');
    });

    it('should find parcels by location', async () => {
      const results = searchParcels({ query: 'Victoria Island', page: 1, limit: 10 });

      expect(results.parcels.length).toBeGreaterThan(0);
      expect(results.parcels[0].streetAddress).toContain('Victoria Island');
    });

    it('should retrieve parcel details with all fields', async () => {
      const parcel = getParcelByNumber('LG-VI-2024-001');

      expect(parcel).toBeDefined();
      expect(parcel).toHaveProperty('parcelNumber');
      expect(parcel).toHaveProperty('streetAddress');
      expect(parcel).toHaveProperty('areaSquareMeters');
      expect(parcel).toHaveProperty('id');
    });
  });

  describe('Transaction Workflow', () => {
    it('should retrieve pending transactions', async () => {
      const results = listTransactions({ status: 'pending_approval', limit: 10 });

      expect(results.transactions.length).toBeGreaterThan(0);
      expect(results.transactions[0].status).toBe('pending_approval');
    });

    it('should retrieve completed or registered transactions with lifecycle history', async () => {
      const results = listTransactions({ limit: 100 });
      const completedTx = results.transactions.find((tx) => tx.paymentStatus === 'paid' && tx.documentStatus === 'verified');

      expect(completedTx).toBeDefined();
      expect(['completed', 'registered', 'in_review']).toContain(completedTx?.status);
      expect(completedTx?.paymentStatus).toBe('paid');
      expect(completedTx?.documentStatus).toBe('verified');
    });

    it('should link transactions to parcels correctly', async () => {
      const tx = listTransactions({ type: 'transfer', limit: 10 }).transactions[0];
      const parcel = getParcelById(tx.parcelId);

      expect(tx).toBeDefined();
      expect(parcel).toBeDefined();
      expect(parcel?.parcelNumber).toBe('LG-VI-2024-001');
    });

    it('should track transaction amounts correctly', async () => {
      const tx = listTransactions({ type: 'transfer', limit: 10 }).transactions[0];

      expect(tx).toBeDefined();
      expect(tx.considerationAmount).toBeGreaterThan(0);
    });
  });

  describe('Verification Workflow', () => {
    it('should retrieve submitted verification requests', async () => {
      const results = await verificationService.listVerificationRequests({ status: 'submitted' }, 1, 10);

      expect(results.requests.length).toBeGreaterThan(0);
      expect(results.requests[0].status).toBe('submitted');
      expect(results.requests[0].reviewerId).toBeNull();
    });

    it('should retrieve approved verifications with reviewer', async () => {
      const results = await verificationService.listVerificationRequests({ status: 'approved' }, 1, 10);

      expect(results.requests.length).toBeGreaterThan(0);
      const approved = results.requests[0];
      expect(approved.reviewerId).not.toBeNull();
      expect(approved.approvedAt).not.toBeNull();
      expect(approved.notes).toBeTruthy();
    });

    it('should retrieve rejected verifications with notes', async () => {
      const results = await verificationService.listVerificationRequests({ status: 'rejected' }, 1, 20);

      expect(results.requests.length).toBeGreaterThan(0);
      const rejected = results.requests.find((request) =>
        (request.notes || '').toLowerCase().includes('incomplete') ||
        (request.rejectionReason || '').toLowerCase().includes('incomplete'),
      ) ?? results.requests[0];
      expect(rejected.notes || rejected.rejectionReason).toBeTruthy();
      expect(`${rejected.notes || ''} ${rejected.rejectionReason || ''}`.toLowerCase()).toContain('incomplete');
    });

    it('should link verification requests to parcels', async () => {
      const verResults = await verificationService.listVerificationRequests({ parcelId: 'LG-VI-2024-001' }, 1, 10);
      const parcel = getParcelByNumber('LG-VI-2024-001');

      expect(verResults.requests.length).toBeGreaterThan(0);
      expect(parcel).toBeDefined();
    });
  });

  describe('Data Integrity', () => {
    it('should have consistent user references', async () => {
      const txResults = listTransactions({ limit: 5 }).transactions;

      for (const tx of txResults) {
        expect(tx.initiatorId).toBeGreaterThan(0);
      }
    });

    it('should have valid timestamps', async () => {
      const parcelResults = searchParcels({ limit: 5 }).parcels;

      for (const parcel of parcelResults) {
        expect(new Date(parcel.createdAt).toString()).not.toBe('Invalid Date');
        expect(new Date(parcel.updatedAt).toString()).not.toBe('Invalid Date');
      }
    });

    it('should have valid coordinates for parcels', async () => {
      const parcel = getParcelByNumber('LG-VI-2024-001');

      expect(parcel).toBeDefined();
      const lat = parcel!.coordinates.lat;
      const lng = parcel!.coordinates.lng;
      expect(typeof lat).toBe('number');
      expect(typeof lng).toBe('number');
      expect(lat).toBeGreaterThan(-90);
      expect(lat).toBeLessThan(90);
      expect(lng).toBeGreaterThan(-180);
      expect(lng).toBeLessThan(180);
    });
  });
});
