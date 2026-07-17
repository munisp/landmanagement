import fs from 'fs';
import path from 'path';
import type { DroneImageUpload, ProcessingTask } from './odm';

interface StoredTask {
  id: string;
  name: string;
  status: ProcessingTask['status'];
  progress: number;
  createdAt: string;
  completedAt?: string;
  cancelledAt?: string;
  error?: string;
  imageCount: number;
  options?: DroneImageUpload['options'];
}

interface DroneProcessingStore {
  tasks: StoredTask[];
  nextSequence: number;
}

const dataDir = path.join(process.cwd(), 'server', 'data');
const storePath = path.join(dataDir, 'drone-processing-store.json');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function defaultStore(): DroneProcessingStore {
  const now = new Date();
  const completedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const createdAt = new Date(completedAt.getTime() - 35 * 60 * 1000);

  return {
    tasks: [
      {
        id: 'drone-task-0001',
        name: 'Abuja District Survey 2026',
        status: 'completed',
        progress: 100,
        createdAt: createdAt.toISOString(),
        completedAt: completedAt.toISOString(),
        imageCount: 24,
        options: {
          orthophoto: true,
          dsm: true,
          dtm: true,
          pointCloud: true,
          mesh: false,
          geoLocation: true,
        },
      },
    ],
    nextSequence: 2,
  };
}

function loadStore(): DroneProcessingStore {
  ensureDataDir();
  if (!fs.existsSync(storePath)) {
    const seeded = defaultStore();
    fs.writeFileSync(storePath, JSON.stringify(seeded, null, 2));
    return seeded;
  }

  const parsed = JSON.parse(fs.readFileSync(storePath, 'utf-8')) as DroneProcessingStore;
  if (!Array.isArray(parsed.tasks) || typeof parsed.nextSequence !== 'number') {
    const seeded = defaultStore();
    fs.writeFileSync(storePath, JSON.stringify(seeded, null, 2));
    return seeded;
  }
  return parsed;
}

function saveStore(store: DroneProcessingStore) {
  ensureDataDir();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function buildOutputs(taskId: string, options?: DroneImageUpload['options']) {
  return {
    orthophoto: options?.orthophoto === false ? undefined : `https://storage.idlr.local/odm/${taskId}/orthophoto.tif`,
    dsm: options?.dsm === false ? undefined : `https://storage.idlr.local/odm/${taskId}/dsm.tif`,
    dtm: options?.dtm === false ? undefined : `https://storage.idlr.local/odm/${taskId}/dtm.tif`,
    pointCloud: options?.pointCloud === false ? undefined : `https://storage.idlr.local/odm/${taskId}/point_cloud.laz`,
    mesh: options?.mesh ? `https://storage.idlr.local/odm/${taskId}/mesh.obj` : undefined,
    report: `https://storage.idlr.local/odm/${taskId}/processing-report.pdf`,
  };
}

function hydrateTask(task: StoredTask): ProcessingTask {
  if (task.status === 'failed') {
    return {
      id: task.id,
      name: task.name,
      status: task.status,
      progress: task.progress,
      createdAt: new Date(task.createdAt),
      completedAt: task.completedAt ? new Date(task.completedAt) : undefined,
      error: task.error,
    };
  }

  if (task.cancelledAt) {
    return {
      id: task.id,
      name: task.name,
      status: 'failed',
      progress: task.progress,
      createdAt: new Date(task.createdAt),
      completedAt: new Date(task.cancelledAt),
      error: 'Processing cancelled by operator',
    };
  }

  if (task.status === 'completed') {
    return {
      id: task.id,
      name: task.name,
      status: 'completed',
      progress: 100,
      createdAt: new Date(task.createdAt),
      completedAt: task.completedAt ? new Date(task.completedAt) : undefined,
      outputs: buildOutputs(task.id, task.options),
    };
  }

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(task.createdAt).getTime()) / 60000));
  const derivedProgress = Math.min(100, 10 + elapsedMinutes * 7);
  if (derivedProgress >= 100) {
    task.status = 'completed';
    task.progress = 100;
    task.completedAt = task.completedAt ?? new Date().toISOString();
  } else if (derivedProgress >= 15) {
    task.status = 'processing';
    task.progress = derivedProgress;
  } else {
    task.status = 'queued';
    task.progress = Math.max(5, derivedProgress);
  }

  return {
    id: task.id,
    name: task.name,
    status: task.status,
    progress: task.progress,
    createdAt: new Date(task.createdAt),
    completedAt: task.completedAt ? new Date(task.completedAt) : undefined,
    outputs: task.status === 'completed' ? buildOutputs(task.id, task.options) : undefined,
  };
}

export function createDroneProcessingTask(input: DroneImageUpload): ProcessingTask {
  const store = loadStore();
  const id = `drone-task-${String(store.nextSequence).padStart(4, '0')}`;
  const record: StoredTask = {
    id,
    name: input.name,
    status: 'queued',
    progress: 5,
    createdAt: new Date().toISOString(),
    imageCount: input.images.length,
    options: input.options,
  };

  store.tasks.unshift(record);
  store.nextSequence += 1;
  saveStore(store);
  return hydrateTask(record);
}

export function listDroneProcessingTasks(): ProcessingTask[] {
  const store = loadStore();
  const tasks = store.tasks.map((task) => hydrateTask(task));
  saveStore(store);
  return tasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function getDroneProcessingTask(taskId: string): ProcessingTask | null {
  const store = loadStore();
  const task = store.tasks.find((item) => item.id === taskId);
  if (!task) {
    return null;
  }
  const hydrated = hydrateTask(task);
  saveStore(store);
  return hydrated;
}

export function cancelDroneProcessingTask(taskId: string): boolean {
  const store = loadStore();
  const task = store.tasks.find((item) => item.id === taskId);
  if (!task) {
    return false;
  }

  task.cancelledAt = new Date().toISOString();
  task.status = 'failed';
  task.progress = Math.min(task.progress, 95);
  saveStore(store);
  return true;
}
