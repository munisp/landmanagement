/**
 * OpenDroneMap Integration Service
 * Handles drone imagery processing for orthophoto generation and 3D point cloud creation
 */

import axios from 'axios';

function requiredServiceUrl(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured for drone processing`);
  return value.replace(/\/$/, '');
}

function odmApiUrl(): string {
  return requiredServiceUrl('ODM_API_URL');
}

function buildingDetectionServiceUrl(): string {
  return requiredServiceUrl('BUILDING_DETECTION_SERVICE_URL');
}

function buildingDetectionConfidenceThreshold(): number {
  const value = Number(process.env.BUILDING_DETECTION_CONFIDENCE_THRESHOLD);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('BUILDING_DETECTION_CONFIDENCE_THRESHOLD must be configured as a number from 0 to 1');
  }
  return value;
}

export interface DroneImageUpload {
  images: string[]; // Array of image URLs or file paths
  name: string; // Project name
  options?: {
    dsm?: boolean; // Digital Surface Model
    dtm?: boolean; // Digital Terrain Model
    orthophoto?: boolean; // Orthophoto generation
    pointCloud?: boolean; // Point cloud generation
    mesh?: boolean; // 3D mesh generation
    gcp?: string; // Ground Control Points file URL
    geoLocation?: boolean; // Use GPS data from images
  };
}

export interface ProcessingTask {
  id: string;
  name: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  createdAt: Date;
  completedAt?: Date;
  error?: string;
  outputs?: {
    orthophoto?: string;
    dsm?: string;
    dtm?: string;
    pointCloud?: string;
    mesh?: string;
    report?: string;
  };
}

/**
 * Submit drone images for processing
 */
export async function submitDroneImagery(data: DroneImageUpload): Promise<ProcessingTask> {
  try {
    const response = await axios.post(`${odmApiUrl()}/tasks`, {
      name: data.name,
      images: data.images,
      options: {
        dsm: data.options?.dsm ?? true,
        dtm: data.options?.dtm ?? true,
        orthophoto: data.options?.orthophoto ?? true,
        'pc-quality': data.options?.pointCloud ? 'high' : 'medium',
        mesh: data.options?.mesh ?? false,
        gcp: data.options?.gcp,
        'use-exif': data.options?.geoLocation ?? true,
      },
    });

    return {
      id: response.data.uuid,
      name: data.name,
      status: 'queued',
      progress: 0,
      createdAt: new Date(),
    };
  } catch (error) {
    console.error('Error submitting drone imagery:', error);
    throw new Error('Failed to submit drone imagery for processing');
  }
}

/**
 * Get processing task status
 */
export async function getTaskStatus(taskId: string): Promise<ProcessingTask> {
  try {
    const response = await axios.get(`${odmApiUrl()}/tasks/${taskId}/info`);
    const task = response.data;

    return {
      id: task.uuid,
      name: task.name,
      status: mapStatus(task.status.code),
      progress: task.progress || 0,
      createdAt: new Date(task.dateCreated),
      completedAt: task.dateCompleted ? new Date(task.dateCompleted) : undefined,
      error: task.status.errorMessage,
      outputs: task.status.code === 40 ? {
        orthophoto: `${odmApiUrl()}/tasks/${task.uuid}/download/orthophoto.tif`,
        dsm: `${odmApiUrl()}/tasks/${task.uuid}/download/dsm.tif`,
        dtm: `${odmApiUrl()}/tasks/${task.uuid}/download/dtm.tif`,
        pointCloud: `${odmApiUrl()}/tasks/${task.uuid}/download/georeferenced_model.laz`,
        mesh: `${odmApiUrl()}/tasks/${task.uuid}/download/textured_model.obj`,
        report: `${odmApiUrl()}/tasks/${task.uuid}/download/report.pdf`,
      } : undefined,
    };
  } catch (error) {
    console.error('Error getting task status:', error);
    throw new Error('Failed to get task status');
  }
}

/**
 * Cancel a processing task
 */
export async function cancelTask(taskId: string): Promise<void> {
  try {
    await axios.post(`${odmApiUrl()}/tasks/${taskId}/cancel`);
  } catch (error) {
    console.error('Error canceling task:', error);
    throw new Error('Failed to cancel task');
  }
}

/**
 * List all processing tasks
 */
export async function listTasks(): Promise<ProcessingTask[]> {
  try {
    const response = await axios.get(`${odmApiUrl()}/tasks`);
    return response.data.map((task: any) => ({
      id: task.uuid,
      name: task.name,
      status: mapStatus(task.status.code),
      progress: task.progress || 0,
      createdAt: new Date(task.dateCreated),
      completedAt: task.dateCompleted ? new Date(task.dateCompleted) : undefined,
    }));
  } catch (error) {
    console.error('Error listing tasks:', error);
    throw new Error('Failed to list tasks');
  }
}

/**
 * Download processed output
 */
export async function downloadOutput(
  taskId: string,
  outputType: 'orthophoto' | 'dsm' | 'dtm' | 'pointCloud' | 'mesh' | 'report'
): Promise<Buffer> {
  try {
    const fileMap = {
      orthophoto: 'orthophoto.tif',
      dsm: 'dsm.tif',
      dtm: 'dtm.tif',
      pointCloud: 'georeferenced_model.laz',
      mesh: 'textured_model.obj',
      report: 'report.pdf',
    };

    const response = await axios.get(
      `${odmApiUrl()}/tasks/${taskId}/download/${fileMap[outputType]}`,
      { responseType: 'arraybuffer' }
    );

    return Buffer.from(response.data);
  } catch (error) {
    console.error('Error downloading output:', error);
    throw new Error('Failed to download output');
  }
}

/**
 * Extract building footprints from orthophoto using AI
 */
export async function extractBuildingFootprints(orthophotoUrl: string): Promise<any> {
  try {
    const response = await axios.post(`${buildingDetectionServiceUrl()}/detect`, {
      image_url: orthophotoUrl,
      confidence_threshold: buildingDetectionConfidenceThreshold(),
      classes: ['building'],
    });

    return response.data.detections;
  } catch (error) {
    console.error('Error extracting building footprints:', error);
    throw new Error('Failed to extract building footprints');
  }
}

/**
 * Map ODM status codes to our status enum
 */
function mapStatus(code: number): ProcessingTask['status'] {
  switch (code) {
    case 10: // Queued
      return 'queued';
    case 20: // Running
    case 30: // Failed (will retry)
      return 'processing';
    case 40: // Completed
      return 'completed';
    case 50: // Canceled
    case 60: // Failed
      return 'failed';
    default:
      return 'failed';
  }
}
