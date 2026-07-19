/**
 * External API surface (v1).
 *
 * A small, explicitly read-only REST surface for third-party integrators
 * (banks, survey firms, government agencies) authenticated by `x-api-key`.
 * Keys are issued/revoked through the admin api-keys surface and validated
 * fail-closed by `validateApiKey()` — a key that is not persisted (or whose
 * validation backend is down) is rejected.
 *
 * Mounted at /api/v1/external in server/_core/index.ts.
 */
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { validateApiKey, rateLimiters } from './_core/security';
import { requireDb } from './db';
import { getParcelByNumber, searchParcels } from './parcelRepository';
import { registryTransactions } from '../drizzle/schema';

export const externalApiRouter = Router();

// Every external endpoint requires a valid, persisted API key and is
// rate-limited tighter than the general API surface.
externalApiRouter.use(validateApiKey());
externalApiRouter.use(rateLimiters.api);

/**
 * GET /parcels — search registered parcels.
 * Query params: query, state, lga, status, landUseType, page, limit
 */
externalApiRouter.get('/parcels', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
    const result = await searchParcels({
      query: req.query.query ? String(req.query.query) : undefined,
      state: req.query.state ? String(req.query.state) : undefined,
      lga: req.query.lga ? String(req.query.lga) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
      landUseType: req.query.landUseType ? String(req.query.landUseType) : undefined,
      page,
      limit,
    });
    res.json({ data: result.parcels, page, limit, total: result.total });
  } catch (error) {
    console.error('[ExternalAPI] parcel search failed:', error);
    res.status(500).json({ error: 'Parcel search failed' });
  }
});

/**
 * GET /parcels/:parcelNumber — fetch one parcel by its public parcel number.
 */
externalApiRouter.get('/parcels/:parcelNumber', async (req, res) => {
  try {
    const parcel = await getParcelByNumber(req.params.parcelNumber);
    if (!parcel) {
      return res.status(404).json({ error: 'Parcel not found' });
    }
    res.json({ data: parcel });
  } catch (error) {
    console.error('[ExternalAPI] parcel lookup failed:', error);
    res.status(500).json({ error: 'Parcel lookup failed' });
  }
});

/**
 * GET /transactions/:reference — registry transaction status by external
 * reference. Returns status/workflow stage only — no personal data beyond
 * the initiating party names already present on the public record.
 */
externalApiRouter.get('/transactions/:reference', async (req, res) => {
  try {
    const db = await requireDb();
    const [tx] = await db
      .select({
        id: registryTransactions.id,
        type: registryTransactions.type,
        status: registryTransactions.status,
        workflowStage: registryTransactions.workflowStage,
        paymentStatus: registryTransactions.paymentStatus,
        documentStatus: registryTransactions.documentStatus,
        externalReference: registryTransactions.externalReference,
        createdAt: registryTransactions.createdAt,
        updatedAt: registryTransactions.updatedAt,
      })
      .from(registryTransactions)
      .where(eq(registryTransactions.externalReference, req.params.reference))
      .limit(1);
    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json({ data: tx });
  } catch (error) {
    console.error('[ExternalAPI] transaction lookup failed:', error);
    res.status(500).json({ error: 'Transaction lookup failed' });
  }
});
