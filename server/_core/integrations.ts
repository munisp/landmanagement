/**
 * External Integrations Verification Service
 * 
 * Verifies connectivity and health of all external services:
 * - Hyperledger Fabric (blockchain)
 * - Mojaloop (payment processing)
 * - TigerBeetle (financial ledger)
 * - Kafka (event streaming)
 * - Temporal (workflow orchestration)
 * - Elasticsearch (search and analytics)
 * - Keycloak (identity federation)
 * - APISIX (API gateway)
 * - Permify (authorization)
 * - Dapr (service invocation and pubsub)
 * - Fluvio (streaming)
 * - OpenAppSec (WAF)
 * - Lakehouse (analytics)
 */

import { logger } from './logger';
import { externalApiCalls, externalApiErrors, externalApiDuration } from './metrics';
import { externalClients } from './externalClients';

export interface IntegrationStatus {
  name: string;
  status: 'up' | 'down' | 'degraded' | 'not_configured';
  responseTime?: number;
  message?: string;
  lastChecked: string;
  details?: Record<string, any>;
}

export interface IntegrationsHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: IntegrationStatus[];
  timestamp: string;
}

/**
 * Check Hyperledger Fabric connection
 */
export async function checkFabricConnection(): Promise<IntegrationStatus> {
  const start = Date.now();
  const name = 'hyperledger_fabric';

  try {
    const gatewayUrl = process.env.FABRIC_GATEWAY_URL;
    
    if (!gatewayUrl) {
      return {
        name,
        status: 'not_configured',
        message: 'FABRIC_GATEWAY_URL not configured',
        lastChecked: new Date().toISOString(),
      };
    }

    // Use real Fabric SDK client
    if (!externalClients.fabric) {
      return {
        name,
        status: 'not_configured',
        message: 'Fabric client not initialized',
        lastChecked: new Date().toISOString(),
      };
    }

    logger.debug({ gatewayUrl }, 'Checking Fabric connection');
    externalApiCalls.labels(name, 'health_check').inc();

    const healthCheck = await externalClients.fabric.healthCheck();
    externalApiDuration.labels(name, 'health_check').observe(healthCheck.responseTime / 1000);

    return {
      name,
      status: healthCheck.status,
      responseTime: healthCheck.responseTime,
      message: healthCheck.status === 'up' ? 'Connected to Fabric gateway' : 'Fabric gateway unavailable',
      lastChecked: new Date().toISOString(),
      details: {
        gatewayUrl,
        mspId: process.env.FABRIC_MSP_ID,
      },
    };
  } catch (error) {
    externalApiErrors.labels(name, 'connection_error').inc();
    logger.error({ error }, 'Fabric connection check failed');
    
    return {
      name,
      status: 'down',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'Connection failed',
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * Check Mojaloop API connection
 */
export async function checkMojalooConnection(): Promise<IntegrationStatus> {
  const start = Date.now();
  const name = 'mojaloop';

  try {
    const apiUrl = process.env.MOJALOOP_API_URL;
    
    if (!apiUrl) {
      return {
        name,
        status: 'not_configured',
        message: 'MOJALOOP_API_URL not configured',
        lastChecked: new Date().toISOString(),
      };
    }

    // Use real Mojaloop SDK client
    if (!externalClients.mojaloop) {
      return {
        name,
        status: 'not_configured',
        message: 'Mojaloop client not initialized',
        lastChecked: new Date().toISOString(),
      };
    }

    logger.debug({ apiUrl }, 'Checking Mojaloop connection');
    externalApiCalls.labels(name, 'health_check').inc();

    const healthCheck = await externalClients.mojaloop.healthCheck();
    externalApiDuration.labels(name, 'health_check').observe(healthCheck.responseTime / 1000);

    return {
      name,
      status: healthCheck.status,
      responseTime: healthCheck.responseTime,
      message: healthCheck.status === 'up' ? 'Connected to Mojaloop API' : 'Mojaloop API unavailable',
      lastChecked: new Date().toISOString(),
      details: {
        apiUrl,
        participantId: process.env.MOJALOOP_PARTICIPANT_ID,
      },
    };
  } catch (error) {
    externalApiErrors.labels(name, 'connection_error').inc();
    logger.error({ error }, 'Mojaloop connection check failed');
    
    return {
      name,
      status: 'down',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'Connection failed',
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * Check TigerBeetle connection
 */
export async function checkTigerBeetleConnection(): Promise<IntegrationStatus> {
  const start = Date.now();
  const name = 'tigerbeetle';

  try {
    const clusterId = process.env.TIGERBEETLE_CLUSTER_ID;
    const replicas = process.env.TIGERBEETLE_REPLICAS;
    
    if (!clusterId || !replicas) {
      return {
        name,
        status: 'not_configured',
        message: 'TigerBeetle configuration missing',
        lastChecked: new Date().toISOString(),
      };
    }

    // Use real TigerBeetle SDK client
    if (!externalClients.tigerbeetle) {
      return {
        name,
        status: 'not_configured',
        message: 'TigerBeetle client not initialized',
        lastChecked: new Date().toISOString(),
      };
    }

    logger.debug({ clusterId, replicas }, 'Checking TigerBeetle connection');
    externalApiCalls.labels(name, 'health_check').inc();

    const healthCheck = await externalClients.tigerbeetle.healthCheck();
    externalApiDuration.labels(name, 'health_check').observe(healthCheck.responseTime / 1000);

    return {
      name,
      status: healthCheck.status,
      responseTime: healthCheck.responseTime,
      message: healthCheck.status === 'up' ? 'Connected to TigerBeetle cluster' : 'TigerBeetle cluster unavailable',
      lastChecked: new Date().toISOString(),
      details: {
        clusterId,
        replicas,
      },
    };
  } catch (error) {
    externalApiErrors.labels(name, 'connection_error').inc();
    logger.error({ error }, 'TigerBeetle connection check failed');
    
    return {
      name,
      status: 'down',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'Connection failed',
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * Check Kafka connection
 */
export async function checkKafkaConnection(): Promise<IntegrationStatus> {
  const start = Date.now();
  const name = 'kafka';

  try {
    const brokers = process.env.KAFKA_BROKERS;
    
    if (!brokers) {
      return {
        name,
        status: 'not_configured',
        message: 'KAFKA_BROKERS not configured',
        lastChecked: new Date().toISOString(),
      };
    }

    // Use real Kafka SDK client
    if (!externalClients.kafka) {
      return {
        name,
        status: 'not_configured',
        message: 'Kafka client not initialized',
        lastChecked: new Date().toISOString(),
      };
    }

    logger.debug({ brokers }, 'Checking Kafka connection');
    externalApiCalls.labels(name, 'health_check').inc();

    const healthCheck = await externalClients.kafka.healthCheck();
    externalApiDuration.labels(name, 'health_check').observe(healthCheck.responseTime / 1000);

    return {
      name,
      status: healthCheck.status,
      responseTime: healthCheck.responseTime,
      message: healthCheck.status === 'up' ? 'Connected to Kafka brokers' : 'Kafka brokers unavailable',
      lastChecked: new Date().toISOString(),
      details: {
        brokers,
        clientId: process.env.KAFKA_CLIENT_ID,
        groupId: process.env.KAFKA_GROUP_ID,
      },
    };
  } catch (error) {
    externalApiErrors.labels(name, 'connection_error').inc();
    logger.error({ error }, 'Kafka connection check failed');
    
    return {
      name,
      status: 'down',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'Connection failed',
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * Check Temporal connection
 */
export async function checkTemporalConnection(): Promise<IntegrationStatus> {
  const start = Date.now();
  const name = 'temporal';

  try {
    const address = process.env.TEMPORAL_ADDRESS;
    
    if (!address) {
      return {
        name,
        status: 'not_configured',
        message: 'TEMPORAL_ADDRESS not configured',
        lastChecked: new Date().toISOString(),
      };
    }

    // Use real Temporal SDK client
    if (!externalClients.temporal) {
      return {
        name,
        status: 'not_configured',
        message: 'Temporal client not initialized',
        lastChecked: new Date().toISOString(),
      };
    }

    logger.debug({ address }, 'Checking Temporal connection');
    externalApiCalls.labels(name, 'health_check').inc();

    const healthCheck = await externalClients.temporal.healthCheck();
    externalApiDuration.labels(name, 'health_check').observe(healthCheck.responseTime / 1000);

    return {
      name,
      status: healthCheck.status,
      responseTime: healthCheck.responseTime,
      message: healthCheck.status === 'up' ? 'Connected to Temporal server' : 'Temporal server unavailable',
      lastChecked: new Date().toISOString(),
      details: {
        address,
        namespace: process.env.TEMPORAL_NAMESPACE,
      },
    };
  } catch (error) {
    externalApiErrors.labels(name, 'connection_error').inc();
    logger.error({ error }, 'Temporal connection check failed');
    
    return {
      name,
      status: 'down',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'Connection failed',
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * Check Elasticsearch connection
 */
export async function checkElasticsearchConnection(): Promise<IntegrationStatus> {
  const start = Date.now();
  const name = 'elasticsearch';

  try {
    const url = process.env.ELASTICSEARCH_URL;
    
    if (!url) {
      return {
        name,
        status: 'not_configured',
        message: 'ELASTICSEARCH_URL not configured',
        lastChecked: new Date().toISOString(),
      };
    }

    // Use real Elasticsearch SDK client
    if (!externalClients.elasticsearch) {
      return {
        name,
        status: 'not_configured',
        message: 'Elasticsearch client not initialized',
        lastChecked: new Date().toISOString(),
      };
    }

    logger.debug({ url }, 'Checking Elasticsearch connection');
    externalApiCalls.labels(name, 'health_check').inc();

    const healthCheck = await externalClients.elasticsearch.healthCheck();
    externalApiDuration.labels(name, 'health_check').observe(healthCheck.responseTime / 1000);

    return {
      name,
      status: healthCheck.status,
      responseTime: healthCheck.responseTime,
      message: healthCheck.status === 'up' ? 'Connected to Elasticsearch cluster' : 'Elasticsearch cluster unavailable',
      lastChecked: new Date().toISOString(),
      details: {
        url,
        username: process.env.ELASTICSEARCH_USERNAME,
      },
    };
  } catch (error) {
    externalApiErrors.labels(name, 'connection_error').inc();
    logger.error({ error }, 'Elasticsearch connection check failed');
    
    return {
      name,
      status: 'down',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'Connection failed',
      lastChecked: new Date().toISOString(),
    };
  }
}

async function checkHttpBackedIntegration(params: {
  name: string;
  envValue?: string;
  envLabel: string;
  client?: { healthCheck: () => Promise<{ status: 'up' | 'down' | 'degraded'; responseTime: number; details?: Record<string, any> }> };
  configuredMessage: string;
}) : Promise<IntegrationStatus> {
  const start = Date.now();

  try {
    if (!params.envValue) {
      return {
        name: params.name,
        status: 'not_configured',
        message: `${params.envLabel} not configured`,
        lastChecked: new Date().toISOString(),
      };
    }

    if (!params.client) {
      return {
        name: params.name,
        status: 'not_configured',
        message: `${params.name} client not initialized`,
        lastChecked: new Date().toISOString(),
      };
    }

    externalApiCalls.labels(params.name, 'health_check').inc();
    const healthCheck = await params.client.healthCheck();
    externalApiDuration.labels(params.name, 'health_check').observe(healthCheck.responseTime / 1000);

    return {
      name: params.name,
      status: healthCheck.status,
      responseTime: healthCheck.responseTime,
      message: healthCheck.status === 'up' ? params.configuredMessage : `${params.name} unavailable`,
      lastChecked: new Date().toISOString(),
      details: {
        endpoint: params.envValue,
        ...(healthCheck.details || {}),
      },
    };
  } catch (error) {
    externalApiErrors.labels(params.name, 'connection_error').inc();
    logger.error({ error, service: params.name }, 'HTTP-backed integration health check failed');

    return {
      name: params.name,
      status: 'down',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'Connection failed',
      lastChecked: new Date().toISOString(),
    };
  }
}

export async function checkKeycloakConnection(): Promise<IntegrationStatus> {
  return checkHttpBackedIntegration({
    name: 'keycloak',
    envValue: process.env.KEYCLOAK_URL,
    envLabel: 'KEYCLOAK_URL',
    client: externalClients.keycloak,
    configuredMessage: 'Connected to Keycloak realm',
  });
}

export async function checkApisixConnection(): Promise<IntegrationStatus> {
  return checkHttpBackedIntegration({
    name: 'apisix',
    envValue: process.env.APISIX_ADMIN_URL,
    envLabel: 'APISIX_ADMIN_URL',
    client: externalClients.apisix,
    configuredMessage: 'Connected to APISIX admin API',
  });
}

export async function checkPermifyConnection(): Promise<IntegrationStatus> {
  return checkHttpBackedIntegration({
    name: 'permify',
    envValue: process.env.PERMIFY_URL,
    envLabel: 'PERMIFY_URL',
    client: externalClients.permify,
    configuredMessage: 'Connected to Permify authorization service',
  });
}

export async function checkDaprConnection(): Promise<IntegrationStatus> {
  return checkHttpBackedIntegration({
    name: 'dapr',
    envValue: process.env.DAPR_HTTP_URL,
    envLabel: 'DAPR_HTTP_URL',
    client: externalClients.dapr,
    configuredMessage: 'Connected to Dapr sidecar',
  });
}

export async function checkFluvioConnection(): Promise<IntegrationStatus> {
  return checkHttpBackedIntegration({
    name: 'fluvio',
    envValue: process.env.FLUVIO_API_URL,
    envLabel: 'FLUVIO_API_URL',
    client: externalClients.fluvio,
    configuredMessage: 'Connected to Fluvio streaming cluster',
  });
}

export async function checkOpenAppSecConnection(): Promise<IntegrationStatus> {
  return checkHttpBackedIntegration({
    name: 'openappsec',
    envValue: process.env.OPENAPPSEC_URL,
    envLabel: 'OPENAPPSEC_URL',
    client: externalClients.openappsec,
    configuredMessage: 'Connected to OpenAppSec control plane',
  });
}

export async function checkLakehouseConnection(): Promise<IntegrationStatus> {
  return checkHttpBackedIntegration({
    name: 'lakehouse',
    envValue: process.env.LAKEHOUSE_API_URL,
    envLabel: 'LAKEHOUSE_API_URL',
    client: externalClients.lakehouse,
    configuredMessage: 'Connected to Lakehouse analytics API',
  });
}

/**
 * Check all integrations health
 */
export async function checkAllIntegrations(): Promise<IntegrationsHealth> {
  logger.info('Checking all external integrations');

  const [fabric, mojaloop, tigerbeetle, kafka, temporal, elasticsearch, keycloak, apisix, permify, dapr, fluvio, openappsec, lakehouse] = await Promise.all([
    checkFabricConnection(),
    checkMojalooConnection(),
    checkTigerBeetleConnection(),
    checkKafkaConnection(),
    checkTemporalConnection(),
    checkElasticsearchConnection(),
    checkKeycloakConnection(),
    checkApisixConnection(),
    checkPermifyConnection(),
    checkDaprConnection(),
    checkFluvioConnection(),
    checkOpenAppSecConnection(),
    checkLakehouseConnection(),
  ]);

  const services = [fabric, mojaloop, tigerbeetle, kafka, temporal, elasticsearch, keycloak, apisix, permify, dapr, fluvio, openappsec, lakehouse];

  // Determine overall health
  const upCount = services.filter(s => s.status === 'up').length;
  const downCount = services.filter(s => s.status === 'down').length;
  const degradedCount = services.filter(s => s.status === 'degraded').length;

  let overall: 'healthy' | 'degraded' | 'unhealthy';
  
  if (downCount > 0) {
    overall = 'unhealthy';
  } else if (degradedCount > 0) {
    overall = 'degraded';
  } else {
    overall = 'healthy';
  }

  logger.info({ overall, upCount, downCount, degradedCount }, 'Integration health check complete');

  return {
    overall,
    services,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get integration configuration status
 */
export function getIntegrationConfig(): Record<string, boolean> {
  return {
    fabric: !!(process.env.FABRIC_GATEWAY_URL && process.env.FABRIC_MSP_ID),
    mojaloop: !!(process.env.MOJALOOP_API_URL && process.env.MOJALOOP_PARTICIPANT_ID),
    tigerbeetle: !!(process.env.TIGERBEETLE_CLUSTER_ID && process.env.TIGERBEETLE_REPLICAS),
    kafka: !!(process.env.KAFKA_BROKERS && process.env.KAFKA_CLIENT_ID),
    temporal: !!(process.env.TEMPORAL_ADDRESS && process.env.TEMPORAL_NAMESPACE),
    elasticsearch: !!(process.env.ELASTICSEARCH_URL),
    keycloak: !!process.env.KEYCLOAK_URL,
    apisix: !!process.env.APISIX_ADMIN_URL,
    permify: !!process.env.PERMIFY_URL,
    dapr: !!process.env.DAPR_HTTP_URL,
    fluvio: !!process.env.FLUVIO_API_URL,
    openappsec: !!process.env.OPENAPPSEC_URL,
    lakehouse: !!process.env.LAKEHOUSE_API_URL,
  };
}
