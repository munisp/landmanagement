import { buildDigitalTwin, compareScenarios } from './parcelDigitalTwinService';
import { getParcelById, searchParcels, type ParcelRecord } from './parcelRepository';
import { listDisputes } from './disputeRepository';
import { listTransactions } from './transactionRepository';

const OPEN_DISPUTE_STATUSES = new Set(['pending', 'investigating', 'mediation', 'hearing', 'filed', 'in_review', 'hearing_scheduled', 'escalated']);
const ACTIVE_TRANSACTION_STATUSES = new Set(['draft', 'pending_approval', 'pending_payment', 'in_review', 'registered']);

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function nearestNeighborRoute(parcels: ParcelRecord[]) {
  if (parcels.length === 0) return [] as Array<{ id: number; parcelNumber: string; stopOrder: number }>;
  const remaining = [...parcels];
  const ordered: ParcelRecord[] = [remaining.shift()!];
  while (remaining.length > 0) {
    const current = ordered[ordered.length - 1];
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    remaining.forEach((candidate, index) => {
      const currentDistance = distanceKm(current.coordinates, candidate.coordinates);
      if (currentDistance < bestDistance) {
        bestDistance = currentDistance;
        bestIndex = index;
      }
    });
    ordered.push(remaining.splice(bestIndex, 1)[0]);
  }
  return ordered.map((parcel, index) => ({
    id: parcel.id,
    parcelNumber: parcel.parcelNumber,
    stopOrder: index + 1,
  }));
}

export async function getParcelGeospatialWorkbench(parcelId: number) {
  const parcel = await getParcelById(parcelId);
  if (!parcel) throw new Error(`Parcel ${parcelId} not found`);

  const [digitalTwin, allParcelsResult, disputesResult, transactionsResult] = await Promise.all([
    buildDigitalTwin(parcelId),
    Promise.resolve(searchParcels({ page: 1, limit: 1000 })),
    listDisputes({ limit: 1000 }),
    listTransactions({ page: 1, limit: 1000 }),
  ]);

  const allParcels = allParcelsResult.parcels.filter((candidate) => candidate.id !== parcelId);
  const nearbyParcels = allParcels
    .map((candidate) => ({
      ...candidate,
      distanceKm: Number(distanceKm(parcel.coordinates, candidate.coordinates).toFixed(2)),
    }))
    .filter((candidate) => candidate.distanceKm <= 25)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 12);

  const localDisputes = disputesResult.disputes.filter((dispute) => dispute.parcelId === parcelId);
  const nearbyDisputes = disputesResult.disputes.filter((dispute) => {
    if (!dispute.parcelId || dispute.parcelId === parcelId) return false;
    const matchedParcel = allParcelsResult.parcels.find((candidate) => candidate.id === dispute.parcelId);
    return matchedParcel ? distanceKm(parcel.coordinates, matchedParcel.coordinates) <= 15 : false;
  });
  const openLocalDisputes = localDisputes.filter((dispute) => OPEN_DISPUTE_STATUSES.has(String(dispute.status)));
  const openNearbyDisputes = nearbyDisputes.filter((dispute) => OPEN_DISPUTE_STATUSES.has(String(dispute.status)));

  const parcelTransactions = transactionsResult.transactions.filter((transaction) => transaction.parcelId === parcelId);
  const activeTransactions = parcelTransactions.filter((transaction) => ACTIVE_TRANSACTION_STATUSES.has(String(transaction.status)));

  const sameUseNearby = nearbyParcels.filter((candidate) => candidate.landUseType === parcel.landUseType);
  const comparableAverageValue = sameUseNearby.length > 0
    ? Math.round(sameUseNearby.reduce((sum, candidate) => sum + candidate.estimatedValue, 0) / sameUseNearby.length)
    : parcel.estimatedValue;
  const relativeValuePct = comparableAverageValue > 0
    ? Number((((parcel.estimatedValue - comparableAverageValue) / comparableAverageValue) * 100).toFixed(1))
    : 0;

  const developmentScenarios = await compareScenarios(parcelId, [
    { name: 'Residential optimization', zoningTarget: 'residential', solarIrradianceKwhM2Day: 5.1, floodRiskLevel: 'low', infrastructureInvestmentPct: 10, interestRatePct: 14 },
    { name: 'Commercial densification', zoningTarget: 'commercial', solarIrradianceKwhM2Day: 5.3, floodRiskLevel: 'moderate', infrastructureInvestmentPct: 18, interestRatePct: 16 },
    { name: 'Mixed-use uplift', zoningTarget: 'mixed', solarIrradianceKwhM2Day: 5.4, floodRiskLevel: 'low', infrastructureInvestmentPct: 15, interestRatePct: 15 },
  ]);

  const bestScenario = developmentScenarios.best;
  const nearbyDensityScore = clamp(nearbyParcels.length * 8 + (openNearbyDisputes.length > 0 ? 8 : 0));
  const accessIndex = clamp(Math.round(digitalTwin.amenitySignal * 100) + (nearbyParcels.length >= 5 ? 10 : 0) - openNearbyDisputes.length * 5);
  const environmentalResilience = clamp(100 - Math.round(digitalTwin.elevationSignal < 0.25 ? 50 : digitalTwin.elevationSignal < 0.45 ? 30 : 15));
  const fieldMissionComplexity = clamp(openLocalDisputes.length * 25 + activeTransactions.length * 15 + (parcel.status === 'pending_verification' ? 20 : 0) + (nearbyParcels.length >= 6 ? 10 : 0));
  const readinessScore = clamp(
    25 +
    Math.round(digitalTwin.elevationSignal * 15) +
    Math.round(digitalTwin.amenitySignal * 15) +
    (parcel.status === 'verified' || parcel.status === 'registered' ? 20 : 8) +
    (bestScenario?.feasibilityScore ? Math.round(bestScenario.feasibilityScore * 0.2) : 0) -
    openLocalDisputes.length * 15 -
    activeTransactions.length * 8
  );

  const landUseTransition = {
    currentUse: parcel.landUseType,
    bestScenario: bestScenario?.name ?? 'No scenario available',
    bestScenarioScore: bestScenario?.feasibilityScore ?? 0,
    opportunityBand:
      (bestScenario?.feasibilityScore ?? 0) >= 75 ? 'high' :
      (bestScenario?.feasibilityScore ?? 0) >= 55 ? 'medium' : 'low',
  };

  return {
    parcel: {
      id: parcel.id,
      parcelNumber: parcel.parcelNumber,
      state: parcel.state,
      lga: parcel.lga,
      landUseType: parcel.landUseType,
      estimatedValue: parcel.estimatedValue,
      areaSquareMeters: parcel.areaSquareMeters,
      status: parcel.status,
      coordinates: parcel.coordinates,
    },
    digitalTwin,
    innovations: {
      nearbyComparables: {
        title: 'Nearby comparables engine',
        count: sameUseNearby.length,
        averageValue: comparableAverageValue,
        relativeValuePct,
        parcels: sameUseNearby.slice(0, 5).map((candidate) => ({
          id: candidate.id,
          parcelNumber: candidate.parcelNumber,
          distanceKm: candidate.distanceKm,
          estimatedValue: candidate.estimatedValue,
          status: candidate.status,
        })),
      },
      densityPressure: {
        title: 'Adjacency and density pressure score',
        score: nearbyDensityScore,
        nearbyParcelCount: nearbyParcels.length,
        explanation: `${nearbyParcels.length} parcels detected within 25 km with ${openNearbyDisputes.length} nearby open dispute signals.`,
      },
      boundaryConflictWatch: {
        title: 'Boundary conflict watch',
        score: clamp(openLocalDisputes.length * 35 + openNearbyDisputes.length * 12),
        openLocalDisputes: openLocalDisputes.length,
        openNearbyDisputes: openNearbyDisputes.length,
        caseNumbers: [...openLocalDisputes, ...openNearbyDisputes].slice(0, 6).map((dispute) => dispute.caseNumber),
      },
      accessIndex: {
        title: 'Field access and serviceability index',
        score: accessIndex,
        explanation: `Amenity signal ${digitalTwin.amenitySignal} with ${nearbyParcels.length} nearby parcels suggests current accessibility posture.`,
      },
      environmentalResilience: {
        title: 'Terrain and environmental resilience score',
        score: environmentalResilience,
        elevationSignal: digitalTwin.elevationSignal,
        explanation: 'Uses deterministic elevation proxy, nearby development activity, and scenario flood assumptions to summarize resilience.',
      },
      developmentOpportunity: {
        title: 'Land-use transition opportunity',
        ...landUseTransition,
      },
      amenityOpportunity: {
        title: 'Amenity and infrastructure uplift',
        score: clamp(Math.round(digitalTwin.amenitySignal * 100)),
        explanation: `Amenity signal ${digitalTwin.amenitySignal} contributes to projected infrastructure uplift in the best scenario.`,
      },
      fieldMissionPack: {
        title: 'Field mission pack and route plan',
        complexityScore: fieldMissionComplexity,
        recommendedStops: nearestNeighborRoute([parcel, ...nearbyParcels.slice(0, 4)]),
        checklist: [
          'Confirm boundary markers and visible access conditions',
          'Capture updated frontage and right-of-way photos',
          'Verify neighboring encroachment or fence-line anomalies',
          'Record any drainage, flood, or terrain concerns',
        ],
      },
      transactionHeat: {
        title: 'Geospatial transaction heat',
        activeTransactionCount: activeTransactions.length,
        recentTransactionCount: parcelTransactions.length,
        score: clamp(parcelTransactions.length * 15 + activeTransactions.length * 15),
      },
      readinessScore: {
        title: 'Overall geospatial readiness',
        score: readinessScore,
        band: readinessScore >= 75 ? 'high' : readinessScore >= 50 ? 'medium' : 'watch',
      },
    },
    nearbyParcels,
    disputes: {
      local: localDisputes.slice(0, 6),
      nearby: nearbyDisputes.slice(0, 6),
    },
    transactions: parcelTransactions.slice(0, 10),
    scenarios: developmentScenarios,
    generatedAt: new Date().toISOString(),
  };
}

export async function getGeospatialPortfolioHotspots() {
  const parcels = searchParcels({ page: 1, limit: 1000 }).parcels;
  const disputes = (await listDisputes({ limit: 1000 })).disputes;
  const transactions = (await listTransactions({ page: 1, limit: 1000 })).transactions;

  const hotspots = parcels.map((parcel) => {
    const parcelDisputes = disputes.filter((dispute) => dispute.parcelId === parcel.id && OPEN_DISPUTE_STATUSES.has(String(dispute.status)));
    const parcelTransactions = transactions.filter((transaction) => transaction.parcelId === parcel.id);
    const activeTransactions = parcelTransactions.filter((transaction) => ACTIVE_TRANSACTION_STATUSES.has(String(transaction.status)));
    const opportunityScore = clamp(
      (parcel.status === 'verified' || parcel.status === 'registered' ? 30 : 15) +
      Math.round((parcel.estimatedValue / Math.max(1, 300000000)) * 25) +
      Math.round((parcel.areaSquareMeters / Math.max(1, 3000)) * 20) -
      parcelDisputes.length * 15
    );
    const riskScore = clamp(parcelDisputes.length * 30 + activeTransactions.length * 10 + (parcel.status === 'pending_verification' ? 15 : 0));
    return {
      parcelId: parcel.id,
      parcelNumber: parcel.parcelNumber,
      state: parcel.state,
      lga: parcel.lga,
      landUseType: parcel.landUseType,
      opportunityScore,
      riskScore,
      openDisputeCount: parcelDisputes.length,
      activeTransactionCount: activeTransactions.length,
      recommendedAction:
        riskScore >= 70 ? 'Investigate and stabilize record conditions before promoting activity.' :
        opportunityScore >= 70 ? 'Prioritize for investor, planning, or development outreach.' :
        'Monitor for routine operational review.',
    };
  });

  return {
    opportunityLeaders: hotspots.slice().sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 10),
    riskLeaders: hotspots.slice().sort((a, b) => b.riskScore - a.riskScore).slice(0, 10),
    generatedAt: new Date().toISOString(),
  };
}
