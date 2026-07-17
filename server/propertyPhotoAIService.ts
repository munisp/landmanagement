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
}

export const PropertyPhotoAIService = {
  /**
   * Extract property information from photo using LLM vision API
   */
  async analyzePropertyPhoto(imageUrl: string): Promise<PropertyPhotoAnalysis> {
    try {
      const response = await invokeLLM({
        messages: [
          {
            role: 'system',
            content: `You are a property surveying AI assistant. Analyze property photos and extract key information including:
- Property type (residential, commercial, agricultural, vacant land, etc.)
- Visible boundaries (fences, walls, natural boundaries like rivers/trees)
- Landmarks (roads, buildings, water bodies, vegetation)
- Structures (buildings, sheds, garages, pools, etc.)
- Estimated area based on visible features
- Any notable features or observations

Provide your analysis in JSON format with the following structure:
{
  "propertyType": "string",
  "boundaries": "string description",
  "landmarks": ["array", "of", "landmarks"],
  "structures": ["array", "of", "structures"],
  "estimatedArea": "string with unit (e.g., '500 sq meters')",
  "confidence": number (0-100),
  "notes": "string with additional observations"
}`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this property photo and extract all relevant information.',
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
            name: 'property_analysis',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                propertyType: { type: 'string', description: 'Type of property' },
                boundaries: { type: 'string', description: 'Description of visible boundaries' },
                landmarks: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'List of visible landmarks',
                },
                structures: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'List of visible structures',
                },
                estimatedArea: { type: 'string', description: 'Estimated area with unit' },
                confidence: {
                  type: 'number',
                  description: 'Confidence score 0-100',
                  minimum: 0,
                  maximum: 100,
                },
                notes: { type: 'string', description: 'Additional observations' },
              },
              required: [
                'propertyType',
                'boundaries',
                'landmarks',
                'structures',
                'estimatedArea',
                'confidence',
                'notes',
              ],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices[0].message.content;
      if (!content || typeof content !== 'string') {
        throw new Error('No response from AI');
      }

      const analysis = JSON.parse(content);

      // Try to extract GPS from EXIF data (would need exif-parser library in production)
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

  /**
   * Batch analyze multiple photos
   */
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

    return results.filter((r) => r !== null) as PropertyPhotoAnalysis[];
  },

  /**
   * Merge multiple photo analyses into a single comprehensive analysis
   */
  mergeAnalyses(analyses: PropertyPhotoAnalysis[]): PropertyPhotoAnalysis {
    if (analyses.length === 0) {
      throw new Error('No analyses to merge');
    }

    if (analyses.length === 1) {
      return analyses[0];
    }

    // Merge landmarks and structures (unique values)
    const allLandmarks = Array.from(new Set(analyses.flatMap((a) => a.landmarks)));
    const allStructures = Array.from(new Set(analyses.flatMap((a) => a.structures)));

    // Average confidence
    const avgConfidence = Math.round(
      analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length
    );

    // Use the most common property type
    const propertyTypes = analyses.map((a) => a.propertyType);
    const propertyType =
      propertyTypes
        .sort(
          (a, b) =>
            propertyTypes.filter((v) => v === a).length -
            propertyTypes.filter((v) => v === b).length
        )
        .pop() || propertyTypes[0];

    // Combine boundaries descriptions
    const boundaries = analyses
      .map((a, i) => `Photo ${i + 1}: ${a.boundaries}`)
      .join('. ');

    // Use first non-null GPS coordinates
    const gpsCoordinates = analyses.find((a) => a.gpsCoordinates)?.gpsCoordinates || null;

    // Combine notes
    const notes = analyses.map((a, i) => `Photo ${i + 1}: ${a.notes}`).join(' ');

    // Use first estimated area (or could average if numeric)
    const estimatedArea = analyses[0].estimatedArea;

    return {
      propertyType,
      boundaries,
      landmarks: allLandmarks,
      structures: allStructures,
      estimatedArea,
      gpsCoordinates,
      confidence: avgConfidence,
      notes,
    };
  },
};

/**
 * Extract GPS coordinates from image EXIF data
 * In production, would use exif-parser or similar library
 * For now, returns null (placeholder)
 */
async function extractGPSFromImage(imageUrl: string): Promise<{ lat: number; lng: number } | null> {
  // Placeholder - in production would parse EXIF data
  // const response = await fetch(imageUrl);
  // const buffer = await response.arrayBuffer();
  // const parser = ExifParser.create(buffer);
  // const result = parser.parse();
  // return result.tags.GPSLatitude && result.tags.GPSLongitude
  //   ? { lat: result.tags.GPSLatitude, lng: result.tags.GPSLongitude }
  //   : null;
  
  return null;
}
