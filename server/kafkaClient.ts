/**
 * Apache Kafka Client Configuration and Connection Manager
 * 
 * This module provides a centralized Kafka client for the IDLR-PTS platform.
 * It handles connection management, producer/consumer creation, and error handling.
 */

import { Kafka, Producer, Consumer, Admin, logLevel } from 'kafkajs';

// Messaging configuration is validated only when the Kafka compatibility
// client is constructed, avoiding an undeclared localhost broker at import time.
function requiredKafkaConfig(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured for Kafka messaging`);
  return value;
}

function kafkaRuntimeConfig() {
  const brokers = requiredKafkaConfig('KAFKA_BROKERS').split(',').map((broker) => broker.trim()).filter(Boolean);
  if (!brokers.length) throw new Error('KAFKA_BROKERS must contain at least one broker');
  const sslEnabled = process.env.KAFKA_SSL_ENABLED === 'true';
  const saslEnabled = process.env.KAFKA_SASL_ENABLED === 'true';
  const configuration = {
    clientId: requiredKafkaConfig('KAFKA_CLIENT_ID'),
    brokers,
    sslEnabled,
    saslEnabled,
    saslMechanism: process.env.KAFKA_SASL_MECHANISM?.trim(),
    saslUsername: process.env.KAFKA_SASL_USERNAME?.trim(),
    saslPassword: process.env.KAFKA_SASL_PASSWORD,
  };
  if (saslEnabled && (!configuration.saslMechanism || !configuration.saslUsername || !configuration.saslPassword)) {
    throw new Error('KAFKA_SASL_MECHANISM, KAFKA_SASL_USERNAME, and KAFKA_SASL_PASSWORD are required when KAFKA_SASL_ENABLED=true');
  }
  return configuration;
}

// Topic names
export const KAFKA_TOPICS = {
  PAYMENT_EVENTS: 'idlr.payment.events',
  BLOCKCHAIN_EVENTS: 'idlr.blockchain.events',
  LEDGER_EVENTS: 'idlr.ledger.events',
  RECONCILIATION_EVENTS: 'idlr.reconciliation.events',
  DEAD_LETTER_QUEUE: 'idlr.dlq',
} as const;

// Event types
export enum PaymentEventType {
  INITIATED = 'payment.initiated',
  QUOTE_RECEIVED = 'payment.quote_received',
  APPROVED = 'payment.approved',
  EXECUTING = 'payment.executing',
  COMPLETED = 'payment.completed',
  FAILED = 'payment.failed',
  CANCELLED = 'payment.cancelled',
}

export enum BlockchainEventType {
  TRANSACTION_SUBMITTED = 'blockchain.transaction_submitted',
  TRANSACTION_CONFIRMED = 'blockchain.transaction_confirmed',
  TRANSACTION_FAILED = 'blockchain.transaction_failed',
  ESCROW_CREATED = 'blockchain.escrow_created',
  ESCROW_RELEASED = 'blockchain.escrow_released',
  ESCROW_REFUNDED = 'blockchain.escrow_refunded',
}

export enum LedgerEventType {
  ACCOUNT_CREATED = 'ledger.account_created',
  TRANSFER_CREATED = 'ledger.transfer_created',
  TRANSFER_POSTED = 'ledger.transfer_posted',
  TRANSFER_VOIDED = 'ledger.transfer_voided',
  RECONCILIATION_COMPLETED = 'ledger.reconciliation_completed',
}

// Event interfaces
export interface PaymentEvent {
  type: PaymentEventType;
  paymentId: string;
  transactionId: string;
  amount: string;
  currency: string;
  payerId: string;
  payeeId: string;
  status: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface BlockchainEvent {
  type: BlockchainEventType;
  transactionHash: string;
  blockNumber?: number;
  contractAddress?: string;
  from: string;
  to: string;
  value: string;
  gasUsed?: string;
  status: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface LedgerEvent {
  type: LedgerEventType;
  transferId: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: string;
  ledgerId: number;
  code: number;
  status: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface ReconciliationEvent {
  paymentId: string;
  transactionHash: string;
  transferId: string;
  amount: string;
  status: 'pending' | 'completed' | 'failed';
  errorMessage?: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

/**
 * Kafka Client Manager
 */
class KafkaClientManager {
  private kafka: Kafka;
  private producer: Producer | null = null;
  private consumers: Map<string, Consumer> = new Map();
  private admin: Admin | null = null;
  private connected: boolean = false;

  constructor() {
    const runtime = kafkaRuntimeConfig();
    // Configure Kafka client
    const kafkaConfig: any = {
      clientId: runtime.clientId,
      brokers: runtime.brokers,
      logLevel: logLevel.INFO,
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    };

    // Add SSL configuration if enabled
    if (runtime.sslEnabled) {
      kafkaConfig.ssl = true;
    }

    // Add SASL authentication if enabled
    if (runtime.saslEnabled) {
      kafkaConfig.sasl = {
        mechanism: runtime.saslMechanism,
        username: runtime.saslUsername,
        password: runtime.saslPassword,
      };
    }

    this.kafka = new Kafka(kafkaConfig);
  }

  /**
   * Initialize Kafka connection and create topics
   */
  async initialize(): Promise<void> {
    try {
      // Create admin client
      this.admin = this.kafka.admin();
      await this.admin.connect();

      // Create topics if they don't exist
      const existingTopics = await this.admin.listTopics();
      const topicsToCreate = Object.values(KAFKA_TOPICS).filter(
        (topic) => !existingTopics.includes(topic)
      );

      if (topicsToCreate.length > 0) {
        await this.admin.createTopics({
          topics: topicsToCreate.map((topic) => ({
            topic,
            numPartitions: 3,
            replicationFactor: 1, // Increase in production
            configEntries: [
              { name: 'retention.ms', value: '604800000' }, // 7 days
              { name: 'compression.type', value: 'snappy' },
            ],
          })),
        });
        console.log(`✅ Created Kafka topics: ${topicsToCreate.join(', ')}`);
      }

      // Create producer
      this.producer = this.kafka.producer({
        allowAutoTopicCreation: false,
        transactionTimeout: 30000,
      });
      await this.producer.connect();

      this.connected = true;
      console.log('✅ Kafka client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Kafka client:', error);
      throw error;
    }
  }

  /**
   * Get or create a consumer for a specific group
   */
  async getConsumer(groupId: string): Promise<Consumer> {
    if (this.consumers.has(groupId)) {
      return this.consumers.get(groupId)!;
    }

    const consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    await consumer.connect();
    this.consumers.set(groupId, consumer);

    return consumer;
  }

  /**
   * Publish an event to a topic
   */
  async publishEvent(
    topic: string,
    key: string,
    value: any,
    headers?: Record<string, string>
  ): Promise<void> {
    if (!this.producer) {
      throw new Error('Kafka producer not initialized');
    }

    try {
      await this.producer.send({
        topic,
        messages: [
          {
            key,
            value: JSON.stringify(value),
            headers: headers
              ? Object.entries(headers).reduce((acc, [k, v]) => {
                  acc[k] = Buffer.from(v);
                  return acc;
                }, {} as Record<string, Buffer>)
              : undefined,
            timestamp: Date.now().toString(),
          },
        ],
      });

      console.log(`✅ Published event to ${topic}: ${key}`);
    } catch (error) {
      console.error(`❌ Failed to publish event to ${topic}:`, error);
      throw error;
    }
  }

  /**
   * Publish payment event
   */
  async publishPaymentEvent(event: PaymentEvent): Promise<void> {
    await this.publishEvent(
      KAFKA_TOPICS.PAYMENT_EVENTS,
      event.paymentId,
      event,
      {
        eventType: event.type,
        transactionId: event.transactionId,
      }
    );
  }

  /**
   * Publish blockchain event
   */
  async publishBlockchainEvent(event: BlockchainEvent): Promise<void> {
    await this.publishEvent(
      KAFKA_TOPICS.BLOCKCHAIN_EVENTS,
      event.transactionHash,
      event,
      {
        eventType: event.type,
        contractAddress: event.contractAddress || '',
      }
    );
  }

  /**
   * Publish ledger event
   */
  async publishLedgerEvent(event: LedgerEvent): Promise<void> {
    await this.publishEvent(
      KAFKA_TOPICS.LEDGER_EVENTS,
      event.transferId,
      event,
      {
        eventType: event.type,
        ledgerId: event.ledgerId.toString(),
      }
    );
  }

  /**
   * Publish reconciliation event
   */
  async publishReconciliationEvent(event: ReconciliationEvent): Promise<void> {
    await this.publishEvent(
      KAFKA_TOPICS.RECONCILIATION_EVENTS,
      event.paymentId,
      event,
      {
        status: event.status,
      }
    );
  }

  /**
   * Publish to dead letter queue
   */
  async publishToDeadLetterQueue(
    originalTopic: string,
    originalKey: string,
    originalValue: any,
    error: Error
  ): Promise<void> {
    await this.publishEvent(
      KAFKA_TOPICS.DEAD_LETTER_QUEUE,
      originalKey,
      {
        originalTopic,
        originalValue,
        error: {
          message: error.message,
          stack: error.stack,
        },
        timestamp: new Date().toISOString(),
      },
      {
        originalTopic,
        errorMessage: error.message,
      }
    );
  }

  /**
   * Check if Kafka is connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Disconnect from Kafka
   */
  async disconnect(): Promise<void> {
    try {
      if (this.producer) {
        await this.producer.disconnect();
      }

      for (const groupId of Array.from(this.consumers.keys())) {
        const consumer = this.consumers.get(groupId);
        if (consumer) {
          await consumer.disconnect();
          console.log(`✅ Disconnected consumer: ${groupId}`);
        }
      }

      if (this.admin) {
        await this.admin.disconnect();
      }

      this.connected = false;
      console.log('✅ Kafka client disconnected');
    } catch (error) {
      console.error('❌ Error disconnecting Kafka client:', error);
      throw error;
    }
  }
}

// Singleton instance
let kafkaClient: KafkaClientManager | null = null;

/**
 * Get or create Kafka client instance
 */
export function getKafkaClient(): KafkaClientManager {
  if (!kafkaClient) {
    kafkaClient = new KafkaClientManager();
  }
  return kafkaClient;
}

/**
 * Initialize Kafka client
 */
export async function initializeKafka(): Promise<boolean> {
  try {
    const client = getKafkaClient();
    await client.initialize();
    return true;
  } catch (error) {
    console.error('Failed to initialize Kafka:', error);
    return false;
  }
}

/**
 * Graceful shutdown
 */
export async function shutdownKafka(): Promise<void> {
  if (kafkaClient) {
    await kafkaClient.disconnect();
    kafkaClient = null;
  }
}

// Handle process termination
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down Kafka client...');
  await shutdownKafka();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down Kafka client...');
  await shutdownKafka();
  process.exit(0);
});
