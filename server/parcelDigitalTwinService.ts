/**
 * Parcel Digital Twin & Scenario Lab (next-generation feature, 2026-07-18)
 *
 * Moves GIS beyond static visualization into a simulation surface: valuation
 * sensitivity, flood exposure, solar yield, zoning constraints, infrastructure
 * proximity, and development feasibility under multiple comparable scenarios.
 * All models are deterministic and explainable; scenario runs are stateless.
 */

import { createHash } from 'crypto';
import * as parcelRepository from './parcelRepository';
import * as disputeRepository from './disputeRepository';
import * as transactionRepository from './transactionRepository';

export interface ScenarioInput {
  name?: string;
  valuationChangePct?: number;      // -50 .. +100
  floodRiskLevel?: 'none' | 'low' | 'moderate' | 'high' | 'severe';
  solarIrradianceKwhM2Day?: number; // 0 .. 8 (Nigeria: ~4.5-6.5)
  zoningTarget?: 'residential' | 'commercial' | 'industrial' | 'agricultural' | 'mixed';
  infrastructureInvestmentPct?: number; // 0 .. 50 of parcel value
  interestRatePct?: number;         // financing cost context
}

export interface ScenarioResult {
  name: string;
  parcelId: number;
  baseline: {
    estimatedValue: number;
    annualHoldingCost: number;
  };
  valuation: {
    scenarioValue: number;
    deltaPct: number;
    explanation: string;
  };
  flood: {
    exposureScore: number; // 0-100
    expectedAnnualLoss: number;
    explanation: string;
  };
  solar: {
    usableAreaM2: number;
    annualYieldKwh: number;
    annualRevenueNgn: number;
    paybackYears: number | null;
    explanation: string;
  };
  zoning: {
    currentUse: string;
    targetUse: string;
    compatibilityScore: number; // 0-100
    approvalProbabilityPct: number;
    explanation: string;
  };
  infrastructure: {
    proximityScore: number; // 0-100
    upliftPct: number;
    explanation: string;
  };
  feasibility: {
    score: number; // 0-100 composite
    band: 'excellent' | 'good' | 'marginal' | 'poor';
    recommendation: string;
  };
}

const OPEN_DISPUTE_STATUSES = new Set(['pending', 'filed', 'mediation', 'in_review', 'hearing_scheduled', 'escalated']);
const SOLAR_PANEL_EFFICIENCY = 0.2;
const SOLAR_USABLE_RATIO: Record<string, number> = {
  residential: 0.35, commercial: 0.5, industrial: 0.6, agricultural: 0.05, mixed: 0.4,
};
const SOLAR_TARIFF_NGN_PER_KWH = 120;
const SOLAR_INSTALL_COST_PER_M2 = 95000;
const FLOOD_DAMAGE_FACTOR: Record<string, number> = {
  none: 0, low: 0.002, moderate: 0.008, high: 0.02, severe: 0.045,
};
const ZONING_MATRIX: Record<string, Record<string, number>> = {
  residential:  { residential: 100, commercial: 70, industrial: 25, agricultural: 60, mixed: 80 },
  commercial:   { residential: 75, commercial: 100, industrial: 55, agricultural: 20, mixed: 90 },
  industrial:   { residential: 20, commercial: 60, industrial: 100, agricultural: 30, mixed: 55 },
  agricultural: { residential: 55, commercial: 35, industrial: 40, agricultural: 100, mixed: 45 },
  mixed:        { residential: 80, commercial: 85, industrial: 50, agricultural: 45, mixed: 100 },
};

/** Deterministic pseudo-elevation/amenity signal from parcel coordinates. */
function coordinateSignal(parcel: parcelRepository.ParcelRecord, salt: string): number {
  const hash = createHash('sha256')
    .update(`${salt}|${parcel.coordinates?.lat ?? 0}|${parcel.coordinates?.lng ?? 0}|${parcel.parcelNumber}`)
    .digest();
  return hash[0] / 255; // 0..1 deterministic
}

function normalizeUse(landUse?: string): string {
  const value = (landUse ?? 'residential').toLowerCase();
  for (const key of Object.keys(SOLAR_USABLE_RATIO)) {
    if (value.includes(key)) return key;
  }
  return 'residential';
}

/** Assemble the digital-twin profile for a parcel. */
export async function buildDigitalTwin(parcelId: number) {
  const parcel = parcelRepository.getParcelById(parcelId);
  if (!parcel) throw new Error(`Parcel ${parcelId} not found`);

  const disputes = disputeRepository.listDisputes({ limit: 1000 }).disputes
    .filter((d: any) => d.parcelId === parcelId);
  const openDisputes = disputes.filter((d: any) => OPEN_DISPUTE_STATUSES.has(String(d.status)));
  const transactions = transactionRepository.listTransactions({ limit: 1000 }).transactions
    .filter((tx: any) => tx.parcelId === parcelId);

  return {
    parcelId: parcel.id,
    parcelNumber: parcel.parcelNumber,
    state: parcel.state,
    lga: parcel.lga,
    landUseType: parcel.landUseType,
    areaSquareMeters: parcel.areaSquareMeters,
    estimatedValue: parcel.estimatedValue,
    status: parcel.status,
    coordinates: parcel.coordinates,
    openDisputes: openDisputes.length,
    totalDisputes: disputes.length,
    transactionCount: transactions.length,
    elevationSignal: Number(coordinateSignal(parcel, 'elevation').toFixed(3)),
    amenitySignal: Number(coordinateSignal(parcel, 'amenity').toFixed(3)),
    generatedAt: new Date().toISOString(),
  };
}

/** Run one what-if scenario against the digital twin. */
export async function runScenario(parcelId: number, input: ScenarioInput = {}): Promise<ScenarioResult> {
  const twin = await buildDigitalTwin(parcelId);
  const baseValue = twin.estimatedValue || 0;

  // --- Valuation sensitivity ------------------------------------------------
  const valuationChangePct = Math.max(-50, Math.min(100, input.valuationChangePct ?? 0));
  const disputeDrag = twin.openDisputes * 4; // open disputes dampen realized value
  const effectiveDelta = valuationChangePct - disputeDrag;
  const scenarioValue = Math.round(baseValue * (1 + effectiveDelta / 100));

  // --- Flood exposure ---------------------------------------------------------
  const floodLevel = input.floodRiskLevel ?? 'low';
  const elevationSignal = twin.elevationSignal; // higher = safer
  const baseExposure = { none: 2, low: 20, moderate: 45, high: 70, severe: 92 }[floodLevel];
  const exposureScore = Math.round(Math.max(0, Math.min(100, baseExposure * (1.3 - elevationSignal))));
  const expectedAnnualLoss = Math.round(scenarioValue * FLOOD_DAMAGE_FACTOR[floodLevel] * (exposureScore / 100));

  // --- Solar yield -------------------------------------------------------------
  const landUse = normalizeUse(twin.landUseType);
  const irradiance = Math.max(0, Math.min(8, input.solarIrradianceKwhM2Day ?? 5.2));
  const usableArea = Math.round(twin.areaSquareMeters * (SOLAR_USABLE_RATIO[landUse] ?? 0.3));
  const annualYieldKwh = Math.round(usableArea * irradiance * SOLAR_PANEL_EFFICIENCY * 365);
  const annualRevenueNgn = annualYieldKwh * SOLAR_TARIFF_NGN_PER_KWH;
  const installCost = usableArea * SOLAR_INSTALL_COST_PER_M2;
  const paybackYears = annualRevenueNgn > 0 ? Number((installCost / annualRevenueNgn).toFixed(1)) : null;

  // --- Zoning feasibility -------------------------------------------------------
  const targetUse = input.zoningTarget ?? landUse;
  const compatibility = ZONING_MATRIX[landUse]?.[targetUse] ?? 50;
  const approvalProbability = Math.round(Math.max(5, Math.min(98, compatibility - twin.openDisputes * 10)));

  // --- Infrastructure proximity -------------------------------------------------
  const proximityScore = Math.round(twin.amenitySignal * 100);
  const investmentPct = Math.max(0, Math.min(50, input.infrastructureInvestmentPct ?? 0));
  const upliftPct = Number(((proximityScore / 100) * investmentPct * 0.6).toFixed(1));

  // --- Composite feasibility ------------------------------------------------------
  const interestDrag = Math.max(0, (input.interestRatePct ?? 12) - 10); // rates above 10% drag feasibility
  const feasibilityScore = Math.round(Math.max(0, Math.min(100,
    0.30 * (100 - exposureScore) +
    0.25 * approvalProbability +
    0.20 * proximityScore +
    0.15 * Math.min(100, (annualRevenueNgn / Math.max(1, baseValue)) * 100 * 20) +
    0.10 * (100 - twin.openDisputes * 25) -
    interestDrag * 2
  )));
  const band = feasibilityScore >= 75 ? 'excellent' : feasibilityScore >= 55 ? 'good' : feasibilityScore >= 35 ? 'marginal' : 'poor';

  return {
    name: input.name ?? `Scenario ${new Date().toISOString()}`,
    parcelId,
    baseline: {
      estimatedValue: baseValue,
      annualHoldingCost: Math.round(baseValue * 0.01),
    },
    valuation: {
      scenarioValue,
      deltaPct: Number(effectiveDelta.toFixed(1)),
      explanation: `Base ${valuationChangePct}% market shift adjusted by ${disputeDrag}% open-dispute drag`,
    },
    flood: {
      exposureScore,
      expectedAnnualLoss,
      explanation: `Flood level "${floodLevel}" moderated by elevation signal ${elevationSignal}`,
    },
    solar: {
      usableAreaM2: usableArea,
      annualYieldKwh,
      annualRevenueNgn,
      paybackYears,
      explanation: `${usableArea}m² usable at ${irradiance} kWh/m²/day irradiance (${landUse} ratio)`,
    },
    zoning: {
      currentUse: landUse,
      targetUse,
      compatibilityScore: compatibility,
      approvalProbabilityPct: approvalProbability,
      explanation: `${landUse} → ${targetUse} transition compatibility ${compatibility}/100`,
    },
    infrastructure: {
      proximityScore,
      upliftPct,
      explanation: `Amenity proximity ${proximityScore}/100 converts ${investmentPct}% investment into ~${upliftPct}% value uplift`,
    },
    feasibility: {
      score: feasibilityScore,
      band,
      recommendation:
        band === 'excellent' ? 'Proceed with development planning and financing.'
        : band === 'good' ? 'Viable with standard controls; monitor flood and zoning factors.'
        : band === 'marginal' ? 'Mitigate exposure and confirm zoning approval before committing capital.'
        : 'Not recommended under current scenario assumptions.',
    },
  };
}

/** Compare multiple scenarios and rank them by composite feasibility. */
export async function compareScenarios(parcelId: number, scenarios: ScenarioInput[]) {
  const results = await Promise.all(scenarios.map((s) => runScenario(parcelId, s)));
  const ranked = results
    .map((r) => ({
      name: r.name,
      feasibilityScore: r.feasibility.score,
      band: r.feasibility.band,
      scenarioValue: r.valuation.scenarioValue,
      expectedAnnualLoss: r.flood.expectedAnnualLoss,
      annualSolarRevenue: r.solar.annualRevenueNgn,
      approvalProbabilityPct: r.zoning.approvalProbabilityPct,
    }))
    .sort((a, b) => b.feasibilityScore - a.feasibilityScore);
  return {
    parcelId,
    scenariosCompared: ranked.length,
    best: ranked[0] ?? null,
    ranked,
    fullResults: results,
    generatedAt: new Date().toISOString(),
  };
}
