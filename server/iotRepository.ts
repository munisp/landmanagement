import { readJsonStore, writeJsonStore } from './jsonStore';

export interface IoTDeviceRecord {
  id: number;
  name: string;
  category: 'environmental_sensor' | 'access_control' | 'utility_meter';
  location: string;
  status: 'online' | 'offline' | 'maintenance';
  lastSeenAt: string;
  firmwareVersion: string;
}

export interface EnvironmentalReadingRecord {
  id: number;
  deviceId: number;
  temperatureCelsius: number;
  humidityPercent: number;
  recordedAt: string;
}

export interface AccessControlEventRecord {
  id: number;
  deviceId: number;
  actor: string;
  credentialType: 'badge' | 'biometric' | 'temporary_code';
  outcome: 'granted' | 'denied';
  recordedAt: string;
}

export interface UtilityMeterReadingRecord {
  id: number;
  deviceId: number;
  meterType: 'electricity' | 'water' | 'gas';
  usage: number;
  unit: string;
  recordedAt: string;
}

export interface MaintenanceAlertRecord {
  id: number;
  deviceId: number;
  severity: 'medium' | 'high';
  title: string;
  recommendation: string;
  predictedFailureWindow: string;
  createdAt: string;
}

interface IoTStore {
  nextDeviceId: number;
  nextEnvironmentalReadingId: number;
  nextAccessEventId: number;
  nextUtilityReadingId: number;
  nextMaintenanceAlertId: number;
  devices: IoTDeviceRecord[];
  environmentalReadings: EnvironmentalReadingRecord[];
  accessControlEvents: AccessControlEventRecord[];
  utilityMeterReadings: UtilityMeterReadingRecord[];
  maintenanceAlerts: MaintenanceAlertRecord[];
}


function defaultStore(): IoTStore {
  return {
    nextDeviceId: 5,
    nextEnvironmentalReadingId: 5,
    nextAccessEventId: 5,
    nextUtilityReadingId: 5,
    nextMaintenanceAlertId: 3,
    devices: [
      { id: 1, name: 'Registry Vault Sensor A', category: 'environmental_sensor', location: 'Title Archive Room', status: 'online', lastSeenAt: '2026-07-17T14:10:00.000Z', firmwareVersion: '2.3.1' },
      { id: 2, name: 'Main Gate Access Node', category: 'access_control', location: 'Central Facility Entrance', status: 'online', lastSeenAt: '2026-07-17T14:12:00.000Z', firmwareVersion: '4.0.2' },
      { id: 3, name: 'Utility Meter E-17', category: 'utility_meter', location: 'Operations Wing', status: 'online', lastSeenAt: '2026-07-17T14:08:00.000Z', firmwareVersion: '1.9.4' },
      { id: 4, name: 'Survey Equipment Storage Sensor', category: 'environmental_sensor', location: 'Field Gear Store', status: 'maintenance', lastSeenAt: '2026-07-17T12:30:00.000Z', firmwareVersion: '2.1.0' },
    ],
    environmentalReadings: [
      { id: 1, deviceId: 1, temperatureCelsius: 21.4, humidityPercent: 47, recordedAt: '2026-07-17T14:00:00.000Z' },
      { id: 2, deviceId: 1, temperatureCelsius: 21.7, humidityPercent: 46, recordedAt: '2026-07-17T14:10:00.000Z' },
      { id: 3, deviceId: 4, temperatureCelsius: 28.1, humidityPercent: 68, recordedAt: '2026-07-17T12:10:00.000Z' },
      { id: 4, deviceId: 4, temperatureCelsius: 29.4, humidityPercent: 71, recordedAt: '2026-07-17T12:25:00.000Z' },
    ],
    accessControlEvents: [
      { id: 1, deviceId: 2, actor: 'Amina Bello', credentialType: 'badge', outcome: 'granted', recordedAt: '2026-07-17T13:42:00.000Z' },
      { id: 2, deviceId: 2, actor: 'Unknown User', credentialType: 'temporary_code', outcome: 'denied', recordedAt: '2026-07-17T13:57:00.000Z' },
      { id: 3, deviceId: 2, actor: 'Security Officer #4', credentialType: 'biometric', outcome: 'granted', recordedAt: '2026-07-17T14:05:00.000Z' },
      { id: 4, deviceId: 2, actor: 'Maintenance Vendor', credentialType: 'temporary_code', outcome: 'granted', recordedAt: '2026-07-17T14:15:00.000Z' },
    ],
    utilityMeterReadings: [
      { id: 1, deviceId: 3, meterType: 'electricity', usage: 1482.5, unit: 'kWh', recordedAt: '2026-07-17T13:00:00.000Z' },
      { id: 2, deviceId: 3, meterType: 'electricity', usage: 1496.2, unit: 'kWh', recordedAt: '2026-07-17T14:00:00.000Z' },
      { id: 3, deviceId: 3, meterType: 'water', usage: 82.4, unit: 'm3', recordedAt: '2026-07-17T13:00:00.000Z' },
      { id: 4, deviceId: 3, meterType: 'water', usage: 84.0, unit: 'm3', recordedAt: '2026-07-17T14:00:00.000Z' },
    ],
    maintenanceAlerts: [
      { id: 1, deviceId: 4, severity: 'high', title: 'Humidity drift in survey equipment store', recommendation: 'Inspect HVAC control and replace sensor gasket within 24 hours.', predictedFailureWindow: '24-48 hours', createdAt: '2026-07-17T12:35:00.000Z' },
      { id: 2, deviceId: 3, severity: 'medium', title: 'Utility meter consumption spike', recommendation: 'Inspect after-hours loads and validate meter calibration next service window.', predictedFailureWindow: '3-5 days', createdAt: '2026-07-17T14:05:00.000Z' },
    ],
  };
}

async function loadStore(): Promise<IoTStore> {
  return readJsonStore<IoTStore>('iot-store', defaultStore);
}

async function saveStore(store: IoTStore) {
  await writeJsonStore('iot-store', store);
}

export async function getIoTOverview() {
  const store = await loadStore();
  return {
    devices: store.devices,
    environmentalReadings: store.environmentalReadings.slice().sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()),
    accessControlEvents: store.accessControlEvents.slice().sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()),
    utilityMeterReadings: store.utilityMeterReadings.slice().sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()),
    maintenanceAlerts: store.maintenanceAlerts.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    metrics: {
      onlineDevices: store.devices.filter((d) => d.status === 'online').length,
      offlineDevices: store.devices.filter((d) => d.status === 'offline').length,
      maintenanceDevices: store.devices.filter((d) => d.status === 'maintenance').length,
      activeMaintenanceAlerts: store.maintenanceAlerts.length,
    },
  };
}

export async function registerIoTDevice(input: Omit<IoTDeviceRecord, 'id' | 'lastSeenAt'>) {
  const store = await loadStore();
  const device: IoTDeviceRecord = {
    id: store.nextDeviceId++,
    ...input,
    lastSeenAt: new Date().toISOString(),
  };
  store.devices.unshift(device);
  await saveStore(store);
  return device;
}

export async function addEnvironmentalReading(input: Omit<EnvironmentalReadingRecord, 'id' | 'recordedAt'>) {
  const store = await loadStore();
  const reading: EnvironmentalReadingRecord = {
    id: store.nextEnvironmentalReadingId++,
    ...input,
    recordedAt: new Date().toISOString(),
  };
  store.environmentalReadings.unshift(reading);
  const device = store.devices.find((item) => item.id === input.deviceId);
  if (device) device.lastSeenAt = reading.recordedAt;
  await saveStore(store);
  return reading;
}

export async function addAccessControlEvent(input: Omit<AccessControlEventRecord, 'id' | 'recordedAt'>) {
  const store = await loadStore();
  const event: AccessControlEventRecord = {
    id: store.nextAccessEventId++,
    ...input,
    recordedAt: new Date().toISOString(),
  };
  store.accessControlEvents.unshift(event);
  const device = store.devices.find((item) => item.id === input.deviceId);
  if (device) device.lastSeenAt = event.recordedAt;
  await saveStore(store);
  return event;
}

export async function addUtilityMeterReading(input: Omit<UtilityMeterReadingRecord, 'id' | 'recordedAt'>) {
  const store = await loadStore();
  const reading: UtilityMeterReadingRecord = {
    id: store.nextUtilityReadingId++,
    ...input,
    recordedAt: new Date().toISOString(),
  };
  store.utilityMeterReadings.unshift(reading);
  const device = store.devices.find((item) => item.id === input.deviceId);
  if (device) device.lastSeenAt = reading.recordedAt;
  await saveStore(store);
  return reading;
}

export async function createMaintenanceAlert(input: Omit<MaintenanceAlertRecord, 'id' | 'createdAt'>) {
  const store = await loadStore();
  const alert: MaintenanceAlertRecord = {
    id: store.nextMaintenanceAlertId++,
    ...input,
    createdAt: new Date().toISOString(),
  };
  store.maintenanceAlerts.unshift(alert);
  const device = store.devices.find((item) => item.id === input.deviceId);
  if (device) device.status = 'maintenance';
  await saveStore(store);
  return alert;
}
