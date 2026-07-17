/**
 * OpenDroneMap Integration Service
 * Handles drone imagery processing for orthophoto generation and 3D point cloud creation
 */

import axios from 'axios';

// OpenDroneMap API endpoint (can be configured via environment variable)
const ODM_API_URL = process.env.ODM_API_URL || 'http://localhost:3000/api/odm';

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
    const response = await axios.post(`${ODM_API_URL}/tasks`, {
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
    const response = await axios.get(`${ODM_API_URL}/tasks/${taskId}/info`);
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
        orthophoto: `${ODM_API_URL}/tasks/${task.uuid}/download/orthophoto.tif`,
        dsm: `${ODM_API_URL}/tasks/${task.uuid}/download/dsm.tif`,
        dtm: `${ODM_API_URL}/tasks/${task.uuid}/download/dtm.tif`,
        pointCloud: `${ODM_API_URL}/tasks/${task.uuid}/download/georeferenced_model.laz`,
        mesh: `${ODM_API_URL}/tasks/${task.uuid}/download/textured_model.obj`,
        report: `${ODM_API_URL}/tasks/${task.uuid}/download/report.pdf`,
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
    await axios.post(`${ODM_API_URL}/tasks/${taskId}/cancel`);
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
    const response = await axios.get(`${ODM_API_URL}/tasks`);
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
      `${ODM_API_URL}/tasks/${taskId}/download/${fileMap[outputType]}`,
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
    // This would integrate with the YOLOv8 service for building detection
    const response = await axios.post('http://localhost:8004/detect', {
      image_url: orthophotoUrl,
      confidence_threshold: 0.5,
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
      return 'queued';
  }
}

/**
 * Mock implementation for development/testing
 */
export async function submitDroneImageryMock(data: DroneImageUpload): Promise<ProcessingTask> {
  const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return {
    id: taskId,
    name: data.name,
    status: 'queued',
    progress: 0,
    createdAt: new Date(),
  };
}

export async function getTaskStatusMock(taskId: string): Promise<ProcessingTask> {
  // Simulate processing progress
  const progress = Math.min(100, Math.floor(Math.random() * 100));
  const status = progress === 100 ? 'completed' : 'processing';
  
  return {
    id: taskId,
    name: 'Drone Survey Project',
    status,
    progress,
    createdAt: new Date(Date.now() - 3600000), // 1 hour ago
    completedAt: status === 'completed' ? new Date() : undefined,
    outputs: status === 'completed' ? {
      orthophoto: `https://storage.example.com/odm/${taskId}/orthophoto.tif`,
      dsm: `https://storage.example.com/odm/${taskId}/dsm.tif`,
      dtm: `https://storage.example.com/odm/${taskId}/dtm.tif`,
      pointCloud: `https://storage.example.com/odm/${taskId}/point_cloud.laz`,
      mesh: `https://storage.example.com/odm/${taskId}/mesh.obj`,
      report: `https://storage.example.com/odm/${taskId}/report.pdf`,
    } : undefined,
  };
}
