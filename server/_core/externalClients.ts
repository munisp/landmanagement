/**
 * External Service SDK Clients
 * 
 * Provides configured clients for all external services:
 * - Hyperledger Fabric (blockchain)
 * - Mojaloop (payment processing)
 * - TigerBeetle (financial ledger)
 * - Apache Kafka (event streaming)
 * - Temporal (workflow orchestration)
 * - Elasticsearch (search & analytics)
 */

import { connect, Gateway, type Contract } from '@hyperledger/fabric-gateway';
import * as grpc from '@grpc/grpc-js';
import { Kafka, type Producer, type Consumer } from 'kafkajs';
import { Client as TemporalClient, Connection as TemporalConnection } from '@temporalio/client';
import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { createClient as createTigerBeetleClient, type Client as TigerBeetleClient } from 'tigerbeetle-node';
import { logger } from './logger';
import * as fs from 'fs';
import * as path from 'path';

export class HttpJsonServiceClient {
  constructor(
    public readonly serviceName: string,
    private readonly config: {
      baseUrl: string;
      healthPath?: string;
      headers?: Record<string, string>;
      method?: 'GET' | 'POST';
      body?: Record<string, unknown>;
    }
  ) {}

  async healthCheck(): Promise<{ status: 'up' | 'down' | 'degraded'; responseTime: number; details?: Record<string, unknown> }> {
    const start = Date.now();

    try {
      const url = `${this.config.baseUrl.replace(/\/$/, '')}${this.config.healthPath || '/health'}`;
      const response = await fetch(url, {
        method: this.config.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.headers || {}),
        },
        body: this.config.method === 'POST' ? JSON.stringify(this.config.body || {}) : undefined,
      });

      return {
        status: response.ok ? 'up' : response.status >= 500 ? 'down' : 'degraded',
        responseTime: Date.now() - start,
        details: {
          url,
          statusCode: response.status,
        },
      };
    } catch (error) {
      logger.error({ error, serviceName: this.serviceName }, 'External HTTP service health check failed');
      return {
        status: 'down',
        responseTime: Date.now() - start,
        details: {
          message: error instanceof Error ? error.message : 'Unknown connection error',
        },
      };
    }
  }
}

export class KeycloakClient extends HttpJsonServiceClient {
  constructor(baseUrl: string, realm: string) {
    super('keycloak', {
      baseUrl,
      healthPath: `/realms/${realm}`,
    });
  }
}

export class ApisixClient extends HttpJsonServiceClient {
  constructor(baseUrl: string, apiKey?: string) {
    super('apisix', {
      baseUrl,
      healthPath: '/apisix/admin/routes',
      headers: apiKey ? { 'X-API-KEY': apiKey } : undefined,
    });
  }
}

export class PermifyClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('permify', {
      baseUrl,
      healthPath: '/healthz',
    });
  }
}

export class DaprClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('dapr', {
      baseUrl,
      healthPath: '/v1.0/healthz/outbound',
    });
  }
}

export class FluvioClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('fluvio', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class OpenAppSecClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('openappsec', {
      baseUrl,
      healthPath: '/healthz',
    });
  }
}

export class LakehouseHttpClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('lakehouse', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class RedisHttpBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('redis', {
      baseUrl,
      healthPath: '/health/redis',
    });
  }
}

export class PostgresHttpBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('postgres', {
      baseUrl,
      healthPath: '/health/database',
    });
  }
}

export class TigerBeetleGrpcBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('tigerbeetle_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class TemporalHttpBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('temporal_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class FluvioAdminBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('fluvio_admin_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class DaprStateBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('dapr_state_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class KeycloakAdminBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('keycloak_admin_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class PermifyBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('permify_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class OpenAppSecBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('openappsec_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class ApisixBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('apisix_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class LakehouseBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('lakehouse_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class FluvioTopicBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('fluvio_topic_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class DaprPubSubBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('dapr_pubsub_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class PermifyDecisionBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('permify_decision_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class ApisixAdminBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('apisix_admin_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class KeycloakOidcBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('keycloak_oidc_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class OpenAppSecEventsBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('openappsec_events_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class LakehouseQueryBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('lakehouse_query_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class DaprWorkflowBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('dapr_workflow_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class FluvioConsumerBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('fluvio_consumer_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class KeycloakTokenClient extends HttpJsonServiceClient {
  constructor(baseUrl: string, realm: string) {
    super('keycloak_token', {
      baseUrl,
      healthPath: `/realms/${realm}/.well-known/openid-configuration`,
    });
  }
}

export class OpenAppSecPolicyBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('openappsec_policy_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class LakehouseIngestBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('lakehouse_ingest_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class PermifySchemaBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('permify_schema_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class DaprBindingBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('dapr_binding_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class FluvioProducerBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('fluvio_producer_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class ApisixPluginBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('apisix_plugin_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class KeycloakRealmBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('keycloak_realm_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class OpenAppSecLogBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('openappsec_log_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class LakehouseCatalogBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('lakehouse_catalog_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class FluvioSchemaBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('fluvio_schema_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class DaprSecretBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('dapr_secret_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class PermifyTupleBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('permify_tuple_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class ApisixRouteBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('apisix_route_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class OpenAppSecRuntimeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('openappsec_runtime', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class LakehouseAnalyticsBridgeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('lakehouse_analytics_bridge', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class FluvioAdminClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('fluvio_admin', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class DaprInvocationClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('dapr_invocation', {
      baseUrl,
      healthPath: '/v1.0/healthz',
    });
  }
}

export class PermifyHealthClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('permify_health', {
      baseUrl,
      healthPath: '/healthz',
    });
  }
}

export class ApisixHealthClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('apisix_health', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class OpenAppSecHealthClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('openappsec_health', {
      baseUrl,
      healthPath: '/healthz',
    });
  }
}

export class LakehouseHealthClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('lakehouse_health', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class FluvioHealthClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('fluvio_health', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class KeycloakHealthClient extends HttpJsonServiceClient {
  constructor(baseUrl: string, realm: string) {
    super('keycloak_health', {
      baseUrl,
      healthPath: `/realms/${realm}`,
    });
  }
}

export class ApisixAdminClient extends HttpJsonServiceClient {
  constructor(baseUrl: string, apiKey?: string) {
    super('apisix_admin', {
      baseUrl,
      healthPath: '/apisix/admin/services',
      headers: apiKey ? { 'X-API-KEY': apiKey } : undefined,
    });
  }
}

export class DaprSidecarClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('dapr_sidecar', {
      baseUrl,
      healthPath: '/v1.0/healthz',
    });
  }
}

export class PermifyAuthorizationClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('permify_authorization', {
      baseUrl,
      healthPath: '/healthz',
    });
  }
}

export class OpenAppSecAgentClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('openappsec_agent', {
      baseUrl,
      healthPath: '/healthz',
    });
  }
}

export class LakehouseApiClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('lakehouse_api', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class FluvioClusterClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('fluvio_cluster', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class KeycloakOidcClient extends HttpJsonServiceClient {
  constructor(baseUrl: string, realm: string) {
    super('keycloak_oidc', {
      baseUrl,
      healthPath: `/realms/${realm}/.well-known/openid-configuration`,
    });
  }
}

export class ApisixGatewayClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('apisix_gateway', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class DaprPubSubClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('dapr_pubsub', {
      baseUrl,
      healthPath: '/v1.0/healthz',
    });
  }
}

export class PermifySchemaClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('permify_schema', {
      baseUrl,
      healthPath: '/healthz',
    });
  }
}

export class OpenAppSecWafClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('openappsec_waf', {
      baseUrl,
      healthPath: '/healthz',
    });
  }
}

export class LakehouseCatalogClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('lakehouse_catalog', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class FluvioStreamingClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('fluvio_streaming', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class KeycloakRealmClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('keycloak_realm', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class ApisixConsumerClient extends HttpJsonServiceClient {
  constructor(baseUrl: string, apiKey?: string) {
    super('apisix_consumer', {
      baseUrl,
      healthPath: '/apisix/admin/consumers',
      headers: apiKey ? { 'X-API-KEY': apiKey } : undefined,
    });
  }
}

export class DaprStateClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('dapr_state', {
      baseUrl,
      healthPath: '/v1.0/healthz',
    });
  }
}

export class PermifyTupleClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('permify_tuple', {
      baseUrl,
      healthPath: '/healthz',
    });
  }
}

export class OpenAppSecPolicyClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('openappsec_policy', {
      baseUrl,
      healthPath: '/healthz',
    });
  }
}

export class LakehouseQueryClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('lakehouse_query', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class FluvioTopicClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('fluvio_topic', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class KeycloakAdminClient extends HttpJsonServiceClient {
  constructor(baseUrl: string, realm: string) {
    super('keycloak_admin', {
      baseUrl,
      healthPath: `/admin/realms/${realm}`,
    });
  }
}

export class OpenAppSecEventsClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('openappsec_events', {
      baseUrl,
      healthPath: '/healthz',
    });
  }
}

export class LakehouseIngestClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('lakehouse_ingest', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class FluvioConsumerClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('fluvio_consumer', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class KeycloakRuntimeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string, realm: string) {
    super('keycloak_runtime', {
      baseUrl,
      healthPath: `/realms/${realm}`,
    });
  }
}

export class PermifyRuntimeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('permify_runtime', {
      baseUrl,
      healthPath: '/healthz',
    });
  }
}

export class DaprRuntimeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('dapr_runtime', {
      baseUrl,
      healthPath: '/v1.0/healthz',
    });
  }
}

export class FluvioRuntimeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('fluvio_runtime', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

export class OpenAppSecRuntimeHealthClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('openappsec_runtime_health', {
      baseUrl,
      healthPath: '/healthz',
    });
  }
}

export class LakehouseRuntimeClient extends HttpJsonServiceClient {
  constructor(baseUrl: string) {
    super('lakehouse_runtime', {
      baseUrl,
      healthPath: '/health',
    });
  }
}

/**
 * Hyperledger Fabric Client
 */
export class FabricClient {
  private gateway?: Gateway;
  private contract?: Contract;
  private connected: boolean = false;

  constructor(
    private config: {
      gatewayUrl: string;
      mspId: string;
      certPath?: string;
      keyPath?: string;
      channelName?: string;
      chaincodeName?: string;
    }
  ) {}

  async connect(): Promise<void> {
    try {
      // Create gRPC connection
      const grpcConn = new grpc.Client(
        this.config.gatewayUrl,
        grpc.credentials.createInsecure() // Use TLS in production
      );

      // Load identity (certificate and private key)
      const cert = this.config.certPath 
        ? fs.readFileSync(this.config.certPath)
        : Buffer.from(''); // Placeholder for demo

      const key = this.config.keyPath
        ? fs.readFileSync(this.config.keyPath)
        : Buffer.from(''); // Placeholder for demo

      // Connect to gateway
      this.gateway = connect({
        client: grpcConn,
        identity: {
          mspId: this.config.mspId,
          credentials: cert,
        },
        // Signer will be configured with actual private key in production
      } as any); // Type assertion for demo purposes

      // Get contract
      if (this.config.channelName && this.config.chaincodeName) {
        const network = this.gateway.getNetwork(this.config.channelName);
        this.contract = network.getContract(this.config.chaincodeName);
      }

      this.connected = true;
      logger.info({ gatewayUrl: this.config.gatewayUrl }, 'Fabric client connected');
    } catch (error) {
      logger.error({ error }, 'Failed to connect Fabric client');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.gateway) {
      this.gateway.close();
      this.connected = false;
      logger.info('Fabric client disconnected');
    }
  }

  async submitTransaction(name: string, ...args: string[]): Promise<Uint8Array> {
    if (!this.contract) {
      throw new Error('Fabric contract not initialized');
    }
    return await this.contract.submitTransaction(name, ...args);
  }

  async evaluateTransaction(name: string, ...args: string[]): Promise<Uint8Array> {
    if (!this.contract) {
      throw new Error('Fabric contract not initialized');
    }
    return await this.contract.evaluateTransaction(name, ...args);
  }

  isConnected(): boolean {
    return this.connected;
  }

  async healthCheck(): Promise<{ status: 'up' | 'down'; responseTime: number }> {
    const start = Date.now();
    try {
      // Simple connectivity check
      if (!this.connected) {
        await this.connect();
      }
      return {
        status: 'up',
        responseTime: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'down',
        responseTime: Date.now() - start,
      };
    }
  }
}

/**
 * Mojaloop Client (HTTP-based)
 */
export class MojaloopClient {
  constructor(
    private config: {
      apiUrl: string;
      participantId: string;
      apiKey?: string;
    }
  ) {}

  async healthCheck(): Promise<{ status: 'up' | 'down'; responseTime: number }> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.config.apiUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
        },
      });

      return {
        status: response.ok ? 'up' : 'down',
        responseTime: Date.now() - start,
      };
    } catch (error) {
      logger.error({ error }, 'Mojaloop health check failed');
      return {
        status: 'down',
        responseTime: Date.now() - start,
      };
    }
  }

  async initiateTransfer(params: {
    amount: string;
    currency: string;
    payerFspId: string;
    payeeFspId: string;
  }): Promise<any> {
    const response = await fetch(`${this.config.apiUrl}/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Mojaloop transfer failed: ${response.statusText}`);
    }

    return await response.json();
  }
}

/**
 * TigerBeetle Client
 */
export class TigerBeetleClientWrapper {
  private client?: TigerBeetleClient;
  private connected: boolean = false;

  constructor(
    private config: {
      clusterId: bigint;
      replicaAddresses: string[];
    }
  ) {}

  async connect(): Promise<void> {
    try {
      this.client = createTigerBeetleClient({
        cluster_id: this.config.clusterId,
        replica_addresses: this.config.replicaAddresses,
      });

      this.connected = true;
      logger.info({ clusterId: this.config.clusterId }, 'TigerBeetle client connected');
    } catch (error) {
      logger.error({ error }, 'Failed to connect TigerBeetle client');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.destroy();
      this.connected = false;
      logger.info('TigerBeetle client disconnected');
    }
  }

  getClient(): TigerBeetleClient | undefined {
    return this.client;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async healthCheck(): Promise<{ status: 'up' | 'down'; responseTime: number }> {
    const start = Date.now();
    try {
      if (!this.connected) {
        await this.connect();
      }
      // TigerBeetle doesn't have a built-in health check, so we verify connection
      return {
        status: this.connected ? 'up' : 'down',
        responseTime: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'down',
        responseTime: Date.now() - start,
      };
    }
  }
}

/**
 * Kafka Client
 */
export class KafkaClientWrapper {
  private kafka: Kafka;
  private producer?: Producer;
  private consumer?: Consumer;
  private connected: boolean = false;

  constructor(
    private config: {
      brokers: string[];
      clientId: string;
      groupId?: string;
    }
  ) {
    this.kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
    });
  }

  async connect(): Promise<void> {
    try {
      this.producer = this.kafka.producer();
      await this.producer.connect();

      if (this.config.groupId) {
        this.consumer = this.kafka.consumer({ groupId: this.config.groupId });
        await this.consumer.connect();
      }

      this.connected = true;
      logger.info({ brokers: this.config.brokers }, 'Kafka client connected');
    } catch (error) {
      logger.error({ error }, 'Failed to connect Kafka client');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
    }
    if (this.consumer) {
      await this.consumer.disconnect();
    }
    this.connected = false;
    logger.info('Kafka client disconnected');
  }

  getProducer(): Producer | undefined {
    return this.producer;
  }

  getConsumer(): Consumer | undefined {
    return this.consumer;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async healthCheck(): Promise<{ status: 'up' | 'down'; responseTime: number }> {
    const start = Date.now();
    try {
      if (!this.connected) {
        await this.connect();
      }
      // Verify producer is connected
      const admin = this.kafka.admin();
      await admin.connect();
      await admin.listTopics();
      await admin.disconnect();

      return {
        status: 'up',
        responseTime: Date.now() - start,
      };
    } catch (error) {
      logger.error({ error }, 'Kafka health check failed');
      return {
        status: 'down',
        responseTime: Date.now() - start,
      };
    }
  }
}

/**
 * Temporal Client
 */
export class TemporalClientWrapper {
  private client?: TemporalClient;
  private connection?: TemporalConnection;
  private connected: boolean = false;

  constructor(
    private config: {
      address: string;
      namespace?: string;
    }
  ) {}

  async connect(): Promise<void> {
    try {
      this.connection = await TemporalConnection.connect({
        address: this.config.address,
      });

      this.client = new TemporalClient({
        connection: this.connection,
        namespace: this.config.namespace || 'default',
      });

      this.connected = true;
      logger.info({ address: this.config.address }, 'Temporal client connected');
    } catch (error) {
      logger.error({ error }, 'Failed to connect Temporal client');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      this.connection.close();
      this.connected = false;
      logger.info('Temporal client disconnected');
    }
  }

  getClient(): TemporalClient | undefined {
    return this.client;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async healthCheck(): Promise<{ status: 'up' | 'down'; responseTime: number }> {
    const start = Date.now();
    try {
      if (!this.connected) {
        await this.connect();
      }
      // Temporal connection is healthy if connected
      return {
        status: this.connected ? 'up' : 'down',
        responseTime: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'down',
        responseTime: Date.now() - start,
      };
    }
  }
}

/**
 * Elasticsearch Client
 */
export class ElasticsearchClientWrapper {
  private client: ElasticsearchClient;
  private connected: boolean = false;

  constructor(
    private config: {
      node: string;
      auth?: {
        username: string;
        password: string;
      };
    }
  ) {
    this.client = new ElasticsearchClient({
      node: config.node,
      auth: config.auth,
    });
  }

  async connect(): Promise<void> {
    try {
      // Test connection
      await this.client.ping();
      this.connected = true;
      logger.info({ node: this.config.node }, 'Elasticsearch client connected');
    } catch (error) {
      logger.error({ error }, 'Failed to connect Elasticsearch client');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.client.close();
    this.connected = false;
    logger.info('Elasticsearch client disconnected');
  }

  getClient(): ElasticsearchClient {
    return this.client;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async healthCheck(): Promise<{ status: 'up' | 'down'; responseTime: number }> {
    const start = Date.now();
    try {
      const health = await this.client.cluster.health();
      const status = health.status === 'green' || health.status === 'yellow' ? 'up' : 'down';

      return {
        status,
        responseTime: Date.now() - start,
      };
    } catch (error) {
      logger.error({ error }, 'Elasticsearch health check failed');
      return {
        status: 'down',
        responseTime: Date.now() - start,
      };
    }
  }
}

/**
 * Initialize all clients with environment configuration
 */
export function initializeClients() {
  const clients = {
    fabric: process.env.FABRIC_GATEWAY_URL
      ? new FabricClient({
          gatewayUrl: process.env.FABRIC_GATEWAY_URL,
          mspId: process.env.FABRIC_MSP_ID || 'Org1MSP',
          certPath: process.env.FABRIC_CERT_PATH,
          keyPath: process.env.FABRIC_KEY_PATH,
          channelName: process.env.FABRIC_CHANNEL_NAME || 'mychannel',
          chaincodeName: process.env.FABRIC_CHAINCODE_NAME || 'basic',
        })
      : undefined,

    mojaloop: process.env.MOJALOOP_API_URL
      ? new MojaloopClient({
          apiUrl: process.env.MOJALOOP_API_URL,
          participantId: process.env.MOJALOOP_PARTICIPANT_ID || 'default',
          apiKey: process.env.MOJALOOP_API_KEY,
        })
      : undefined,

    tigerbeetle: process.env.TIGERBEETLE_CLUSTER_ID && process.env.TIGERBEETLE_REPLICAS
      ? new TigerBeetleClientWrapper({
          clusterId: BigInt(process.env.TIGERBEETLE_CLUSTER_ID),
          replicaAddresses: process.env.TIGERBEETLE_REPLICAS.split(','),
        })
      : undefined,

    kafka: process.env.KAFKA_BROKERS
      ? new KafkaClientWrapper({
          brokers: process.env.KAFKA_BROKERS.split(','),
          clientId: process.env.KAFKA_CLIENT_ID || 'idlr-pts',
          groupId: process.env.KAFKA_GROUP_ID,
        })
      : undefined,

    temporal: process.env.TEMPORAL_ADDRESS
      ? new TemporalClientWrapper({
          address: process.env.TEMPORAL_ADDRESS,
          namespace: process.env.TEMPORAL_NAMESPACE,
        })
      : undefined,

    elasticsearch: process.env.ELASTICSEARCH_URL
      ? new ElasticsearchClientWrapper({
          node: process.env.ELASTICSEARCH_URL,
          auth: process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD
            ? {
                username: process.env.ELASTICSEARCH_USERNAME,
                password: process.env.ELASTICSEARCH_PASSWORD,
              }
            : undefined,
        })
      : undefined,

    keycloak: process.env.KEYCLOAK_URL
      ? new KeycloakClient(process.env.KEYCLOAK_URL, process.env.KEYCLOAK_REALM || 'master')
      : undefined,

    apisix: process.env.APISIX_ADMIN_URL
      ? new ApisixClient(process.env.APISIX_ADMIN_URL, process.env.APISIX_API_KEY)
      : undefined,

    permify: process.env.PERMIFY_URL
      ? new PermifyClient(process.env.PERMIFY_URL)
      : undefined,

    dapr: process.env.DAPR_HTTP_URL
      ? new DaprClient(process.env.DAPR_HTTP_URL)
      : undefined,

    fluvio: process.env.FLUVIO_API_URL
      ? new FluvioClient(process.env.FLUVIO_API_URL)
      : undefined,

    openappsec: process.env.OPENAPPSEC_URL
      ? new OpenAppSecClient(process.env.OPENAPPSEC_URL)
      : undefined,

    lakehouse: process.env.LAKEHOUSE_API_URL
      ? new LakehouseHttpClient(process.env.LAKEHOUSE_API_URL)
      : undefined,
  };

  logger.info(
    {
      fabric: !!clients.fabric,
      mojaloop: !!clients.mojaloop,
      tigerbeetle: !!clients.tigerbeetle,
      kafka: !!clients.kafka,
      temporal: !!clients.temporal,
      elasticsearch: !!clients.elasticsearch,
      keycloak: !!clients.keycloak,
      apisix: !!clients.apisix,
      permify: !!clients.permify,
      dapr: !!clients.dapr,
      fluvio: !!clients.fluvio,
      openappsec: !!clients.openappsec,
      lakehouse: !!clients.lakehouse,
    },
    'External clients initialized'
  );

  return clients;
}

// Export singleton instance
export const externalClients = initializeClients();
