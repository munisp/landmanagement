import { searchParcels } from './parcelRepository';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function scoreFloodRisk(risk: string) {
  switch (risk.toLowerCase()) {
    case 'low':
      return 24;
    case 'medium':
      return 14;
    case 'high':
      return 6;
    default:
      return 10;
  }
}

function scoreTerrain(terrain: string) {
  switch (terrain.toLowerCase()) {
    case 'flat':
      return 20;
    case 'gentle-slope':
    case 'slope':
      return 15;
    case 'hilly':
      return 10;
    default:
      return 12;
  }
}

function scoreLandUse(landUseType: string) {
  switch (landUseType.toLowerCase()) {
    case 'residential':
      return { score: 22, recommendation: 'Residential housing and mixed live-work uses are strongly aligned with this parcel.' };
    case 'commercial':
      return { score: 20, recommendation: 'Commercial and office-led development are well supported with moderate compliance review.' };
    case 'agricultural':
      return { score: 18, recommendation: 'Agro-processing, storage, and low-density development are better suited than high-rise construction.' };
    case 'industrial':
      return { score: 16, recommendation: 'Industrial and logistics uses are suitable, but buffering and environmental controls should be enforced.' };
    case 'mixed':
      return { score: 21, recommendation: 'Mixed-use schemes are viable with careful traffic, parking, and utility planning.' };
    default:
      return { score: 15, recommendation: 'Detailed zoning confirmation is required before finalizing the preferred development program.' };
  }
}

export function getBuildingVisualizationState() {
  const searchResult = searchParcels({ limit: 1 });
  const subject = searchResult.parcels[0];
  const areaSqm = subject?.areaSquareMeters ?? 900;
  const buildingArea = 400;
  const solarPotential = 400 * 5.5 * 0.15 * 365;
  const floodRisk = 'Low';
  const viewshedScore = 8.5;
  const suggestedTerrain = 'flat';
  const landUseType = subject?.landUseType ?? 'residential';
  const plotCoverage = Number(((buildingArea / areaSqm) * 100).toFixed(1));
  const floorAreaRatio = Number((buildingArea / areaSqm).toFixed(2));
  const solarScore = clamp(Math.round((solarPotential / 120000) * 18), 8, 18);
  const visibilityScore = clamp(Math.round((viewshedScore / 10) * 18), 6, 18);
  const densityScore = plotCoverage <= 45 ? 16 : plotCoverage <= 60 ? 12 : 8;
  const floodScore = scoreFloodRisk(floodRisk);
  const terrainScore = scoreTerrain(suggestedTerrain);
  const landUseAssessment = scoreLandUse(landUseType);
  const suitabilityScore = floodScore + terrainScore + solarScore + visibilityScore + densityScore + landUseAssessment.score;
  const suitabilityBand = suitabilityScore >= 84 ? 'Highly Suitable' : suitabilityScore >= 68 ? 'Moderately Suitable' : 'Conditionally Suitable';
  const suitabilityDrivers = [
    `Flood risk assessed as ${floodRisk.toLowerCase()} with score ${floodScore}/24`,
    `Terrain classified as ${suggestedTerrain} with score ${terrainScore}/20`,
    `Solar yield estimated at ${Math.round(solarPotential).toLocaleString()} kWh/year contributing ${solarScore}/18`,
    `Viewshed quality rated ${viewshedScore}/10 contributing ${visibilityScore}/18`,
    `Plot coverage at ${plotCoverage}% contributing ${densityScore}/16`,
    `Land use type ${landUseType} contributing ${landUseAssessment.score}/22`,
  ];

  return {
    parcelId: subject?.parcelNumber ?? 'PARCEL001',
    location: subject ? `${subject.lga}, ${subject.state}` : 'Victoria Island, Lagos',
    boundaryCoordinates: subject?.boundaryCoordinates ?? '6.4281,3.4219;6.4285,3.4219;6.4285,3.4225;6.4281,3.4225',
    center: subject?.coordinates ?? { lat: 6.4281, lng: 3.4219 },
    elevationMeters: 45,
    floodRisk,
    viewshedScore,
    buildingArea,
    plotCoverage,
    floorAreaRatio,
    setbackMeters: 5,
    solarPotential: Math.round(solarPotential),
    suggestedTerrain,
    landUseType,
    suitabilityScore,
    suitabilityBand,
    suitabilityDrivers,
    recommendedDevelopment: landUseAssessment.recommendation,
  };
}
