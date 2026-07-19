import ExifParser from 'exif-parser';
import { invokeLLM } from './_core/llm';

export interface PropertyPhotoAnalysis {
  propertyType: string;
  boundaries: string;
  landmarks: string[];
  structures: string[];
  estimatedArea: string;
  gpsCoordinates: { lat: number; lng: number } | null;
  confidence: number;
  notes: string;
  boundaryConfidence: number;
  accessRoadType: string;
  encroachmentSignals: string[];
  terrainSignals: string[];
  drainageCondition: string;
  surveyRecommendations: string[];
  geoSummary: string;
}

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    propertyType: { type: 'string' },
    boundaries: { type: 'string' },
    landmarks: { type: 'array', items: { type: 'string' } },
    structures: { type: 'array', items: { type: 'string' } },
    estimatedArea: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 100 },
    notes: { type: 'string' },
    boundaryConfidence: { type: 'number', minimum: 0, maximum: 100 },
    accessRoadType: { type: 'string' },
    encroachmentSignals: { type: 'array', items: { type: 'string' } },
    terrainSignals: { type: 'array', items: { type: 'string' } },
    drainageCondition: { type: 'string' },
    surveyRecommendations: { type: 'array', items: { type: 'string' } },
    geoSummary: { type: 'string' },
  },
  required: [
    'propertyType',
    'boundaries',
    'landmarks',
    'structures',
    'estimatedArea',
    'confidence',
    'notes',
    'boundaryConfidence',
    'accessRoadType',
    'encroachmentSignals',
    'terrainSignals',
    'drainageCondition',
    'surveyRecommendations',
    'geoSummary',
  ],
  additionalProperties: false,
} as const;

async function fetchImageBuffer(imageUrl: string): Promise<Buffer | null> {
  try {
    if (imageUrl.startsWith('data:')) {
      const base64 = imageUrl.split(',')[1];
      return base64 ? Buffer.from(base64, 'base64') : null;
    }

    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const response = await fetch(imageUrl);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    return null;
  } catch {
    return null;
  }
}

async function extractGPSFromImage(imageUrl: string): Promise<{ lat: number; lng: number } | null> {
  const buffer = await fetchImageBuffer(imageUrl);
  if (!buffer) return null;

  try {
    const parser = ExifParser.create(buffer);
    const result = parser.parse();
    const lat = result.tags?.GPSLatitude;
    const lng = result.tags?.GPSLongitude;
    if (typeof lat === 'number' && typeof lng === 'number') {
      return { lat, lng };
    }
    return null;
  } catch {
    return null;
  }
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export const PropertyPhotoAIService = {
  async analyzePropertyPhoto(imageUrl: string): Promise<PropertyPhotoAnalysis> {
    try {
      const response = await invokeLLM({
        messages: [
          {
            role: 'system',
            content: `You are a property surveying and geospatial interpretation assistant. Analyze property photos for land administration workflows. Extract visible property type, boundaries, landmarks, structures, access-road posture, terrain and drainage signals, possible encroachment indicators, and concrete survey recommendations. Always be conservative and do not fabricate unreadable details.`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this property or parcel photo for a surveying and geospatial review. Return only the requested structured JSON.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'property_geospatial_analysis',
            strict: true,
            schema: ANALYSIS_SCHEMA,
          },
        },
      });

      const content = response.choices[0].message.content;
      if (!content || typeof content !== 'string') {
        throw new Error('No response from AI');
      }

      const analysis = JSON.parse(content) as Omit<PropertyPhotoAnalysis, 'gpsCoordinates'>;
      const gpsCoordinates = await extractGPSFromImage(imageUrl);

      return {
        ...analysis,
        gpsCoordinates,
      };
    } catch (error) {
      console.error('Property photo analysis error:', error);
      throw new Error('Failed to analyze property photo: ' + (error as Error).message);
    }
  },

  async analyzeMultiplePhotos(imageUrls: string[]): Promise<PropertyPhotoAnalysis[]> {
    const results = await Promise.all(
      imageUrls.map(async (url) => {
        try {
          return await this.analyzePropertyPhoto(url);
        } catch (error) {
          console.error(`Failed to analyze ${url}:`, error);
          return null;
        }
      })
    );

    return results.filter((r): r is PropertyPhotoAnalysis => r !== null);
  },

  mergeAnalyses(analyses: PropertyPhotoAnalysis[]): PropertyPhotoAnalysis {
    if (analyses.length === 0) {
      throw new Error('No analyses to merge');
    }

    if (analyses.length === 1) {
      return analyses[0];
    }

    const allLandmarks = dedupe(analyses.flatMap((a) => a.landmarks));
    const allStructures = dedupe(analyses.flatMap((a) => a.structures));
    const encroachmentSignals = dedupe(analyses.flatMap((a) => a.encroachmentSignals));
    const terrainSignals = dedupe(analyses.flatMap((a) => a.terrainSignals));
    const recommendations = dedupe(analyses.flatMap((a) => a.surveyRecommendations));

    const avgConfidence = Math.round(
      analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length
    );
    const avgBoundaryConfidence = Math.round(
      analyses.reduce((sum, a) => sum + a.boundaryConfidence, 0) / analyses.length
    );

    const propertyTypes = analyses.map((a) => a.propertyType);
    const propertyType =
      propertyTypes
        .sort(
          (a, b) =>
            propertyTypes.filter((v) => v === a).length -
            propertyTypes.filter((v) => v === b).length
        )
        .pop() || propertyTypes[0];

    const boundaries = analyses.map((a, i) => `Photo ${i + 1}: ${a.boundaries}`).join('. ');
    const gpsCoordinates = analyses.find((a) => a.gpsCoordinates)?.gpsCoordinates || null;
    const notes = analyses.map((a, i) => `Photo ${i + 1}: ${a.notes}`).join(' ');
    const estimatedArea = analyses[0].estimatedArea;
    const geoSummary = analyses.map((a) => a.geoSummary).join(' ');
    const accessRoadType = analyses.find((a) => a.accessRoadType)?.accessRoadType || 'unknown';
    const drainageCondition = analyses.find((a) => a.drainageCondition)?.drainageCondition || 'undetermined';

    return {
      propertyType,
      boundaries,
      landmarks: allLandmarks,
      structures: allStructures,
      estimatedArea,
      gpsCoordinates,
      confidence: avgConfidence,
      notes,
      boundaryConfidence: avgBoundaryConfidence,
      accessRoadType,
      encroachmentSignals,
      terrainSignals,
      drainageCondition,
      surveyRecommendations: recommendations,
      geoSummary,
    };
  },

  async analyzeSurveyPhotoSet(imageUrls: string[]) {
    const analyses = await this.analyzeMultiplePhotos(imageUrls);
    if (analyses.length === 0) {
      throw new Error('No photos could be analyzed');
    }

    const merged = this.mergeAnalyses(analyses);
    return {
      photoCount: analyses.length,
      merged,
      analyses,
      generatedAt: new Date().toISOString(),
    };
  },
};
