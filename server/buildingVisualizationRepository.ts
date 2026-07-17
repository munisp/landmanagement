import { searchParcels } from './parcelRepository';

export function getBuildingVisualizationState() {
  const searchResult = searchParcels({ limit: 1 });
  const subject = searchResult.parcels[0];
  const areaSqm = subject?.areaSquareMeters ?? 900;
  const buildingArea = 400;
  const buildingHeight = 15;
  const solarPotential = 400 * 5.5 * 0.15 * 365;

  return {
    parcelId: subject?.parcelNumber ?? 'PARCEL001',
    location: subject ? `${subject.lga}, ${subject.state}` : 'Victoria Island, Lagos',
    boundaryCoordinates: subject?.boundaryCoordinates ?? '6.4281,3.4219;6.4285,3.4219;6.4285,3.4225;6.4281,3.4225',
    center: subject?.coordinates ?? { lat: 6.4281, lng: 3.4219 },
    elevationMeters: 45,
    floodRisk: 'Low',
    viewshedScore: 8.5,
    buildingArea,
    plotCoverage: Number(((buildingArea / areaSqm) * 100).toFixed(1)),
    floorAreaRatio: Number((buildingArea / areaSqm).toFixed(2)),
    setbackMeters: 5,
    solarPotential: Math.round(solarPotential),
    suggestedTerrain: 'flat',
  };
}
