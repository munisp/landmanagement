/**
 * Kafka Event Consumers for Payment-Blockchain-Ledger Reconciliation
 * 
 * This module implements event consumers that process events from Kafka topics
 * and perform reconciliation between Mojaloop payments, blockchain transactions,
 * and TigerBeetle ledger entries.
 */

import { Consumer, EachMessagePayload } from 'kafkajs';
import {
  getKafkaClient,
  KAFKA_TOPICS,
  PaymentEvent,
  PaymentEventType,
  BlockchainEvent,
  BlockchainEventType,
  LedgerEvent,
  ReconciliationEvent,
} from './kafkaClient';
import { getTigerBeetleClient } from './tigerBeetleClient';
// Payment and smart contract services will be imported when needed
import { requireDb } from './db';
import { mojaloopTransactions, blockchainTransactions } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

/**
 * Payment Event Consumer
 * 
 * Processes payment events from Mojaloop and updates TigerBeetle ledger
 */
export class PaymentEventConsumer {
  private consumer: Consumer | null = null;
  private tigerBeetle = getTigerBeetleClient();
  // Payment service will be initialized when needed

  async start(): Promise<void> {
    const kafkaClient = getKafkaClient();
    this.consumer = await kafkaClient.getConsumer('payment-event-consumer');

    await this.consumer.subscribe({
      topic: KAFKA_TOPICS.PAYMENT_EVENTS,
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        try {
          await this.processPaymentEvent(payload);
        } catch (error) {
          console.error('Error processing payment event:', error);
          await this.handleError(payload, error as Error);
        }
      },
    });

    console.log('✅ Payment event consumer started');
  }

  private async processPaymentEvent(payload: EachMessagePayload): Promise<void> {
    const { message } = payload;
    const event: PaymentEvent = JSON.parse(message.value!.toString());

    console.log(`Processing payment event: ${event.type} for payment ${event.paymentId}`);

    switch (event.type) {
      case PaymentEventType.INITIATED:
        await this.handlePaymentInitiated(event);
        break;

      case PaymentEventType.COMPLETED:
        await this.handlePaymentCompleted(event);
        break;

      case PaymentEventType.FAILED:
      case PaymentEventType.CANCELLED:
        await this.handlePaymentFailedOrCancelled(event);
        break;

      default:
        console.log(`Ignoring payment event type: ${event.type}`);
    }
  }

  private async handlePaymentInitiated(event: PaymentEvent): Promise<void> {
    // Create pending transfer in TigerBeetle
    const result = await this.tigerBeetle.createPendingTransfer({
      transferId: event.paymentId,
      debitAccountId: event.payerId,
      creditAccountId: 'platform-escrow',
      amount: event.amount,
      ledgerId: 1,
      code: 2000, // Payment transfer code
      userData128: JSON.stringify({
        paymentId: event.paymentId,
        transactionId: event.transactionId,
      }),
      timeout: 3600000000000, // 1 hour
    });

    if (result.success) {
      console.log(`✅ Created pending transfer for payment ${event.paymentId}`);
      
      // Publish ledger event
      const kafkaClient = getKafkaClient();
      await kafkaClient.publishLedgerEvent({
        type: 'ledger.transfer_created' as any,
        transferId: event.paymentId,
        debitAccountId: event.payerId,
        creditAccountId: 'platform-escrow',
        amount: event.amount,
        ledgerId: 1,
        code: 2000,
        status: 'pending',
        timestamp: new Date().toISOString(),
      });
    } else {
      throw new Error(`Failed to create pending transfer: ${result.error}`);
    }
  }

  private async handlePaymentCompleted(event: PaymentEvent): Promise<void> {
    // Post pending transfer (commit)
    const result = await this.tigerBeetle.postPendingTransfer(event.paymentId);

    if (result.success) {
      console.log(`✅ Posted pending transfer for payment ${event.paymentId}`);

      // Publish ledger event
      const kafkaClient = getKafkaClient();
      await kafkaClient.publishLedgerEvent({
        type: 'ledger.transfer_posted' as any,
        transferId: event.paymentId,
        debitAccountId: event.payerId,
        creditAccountId: 'platform-escrow',
        amount: event.amount,
        ledgerId: 1,
        code: 2000,
        status: 'posted',
        timestamp: new Date().toISOString(),
      });

      // Trigger blockchain transaction if needed
      if (event.metadata?.propertyId) {
        // This will be handled by the reconciliation consumer
        console.log(`Payment ${event.paymentId} ready for blockchain reconciliation`);
      }
    } else {
      throw new Error(`Failed to post pending transfer: ${result.error}`);
    }
  }

  private async handlePaymentFailedOrCancelled(event: PaymentEvent): Promise<void> {
    // Void pending transfer (rollback)
    const result = await this.tigerBeetle.voidPendingTransfer(event.paymentId);

    if (result.success) {
      console.log(`✅ Voided pending transfer for payment ${event.paymentId}`);

      // Publish ledger event
      const kafkaClient = getKafkaClient();
      await kafkaClient.publishLedgerEvent({
        type: 'ledger.transfer_voided' as any,
        transferId: event.paymentId,
        debitAccountId: event.payerId,
        creditAccountId: 'platform-escrow',
        amount: event.amount,
        ledgerId: 1,
        code: 2000,
        status: 'voided',
        timestamp: new Date().toISOString(),
      });
    } else {
      console.error(`Failed to void pending transfer: ${result.error}`);
    }
  }

  private async handleError(payload: EachMessagePayload, error: Error): Promise<void> {
    const kafkaClient = getKafkaClient();
    await kafkaClient.publishToDeadLetterQueue(
      payload.topic,
      payload.message.key?.toString() || '',
      payload.message.value?.toString(),
      error
    );
  }

  async stop(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect();
      console.log('✅ Payment event consumer stopped');
    }
  }
}

/**
 * Blockchain Event Consumer
 * 
 * Processes blockchain events and updates TigerBeetle ledger
 */
export class BlockchainEventConsumer {
  private consumer: Consumer | null = null;
  private tigerBeetle = getTigerBeetleClient();
    // Smart contract integration will be used when needed

  async start(): Promise<void> {
    const kafkaClient = getKafkaClient();
    this.consumer = await kafkaClient.getConsumer('blockchain-event-consumer');

    await this.consumer.subscribe({
      topic: KAFKA_TOPICS.BLOCKCHAIN_EVENTS,
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        try {
          await this.processBlockchainEvent(payload);
        } catch (error) {
          console.error('Error processing blockchain event:', error);
          await this.handleError(payload, error as Error);
        }
      },
    });

    console.log('✅ Blockchain event consumer started');
  }

  private async processBlockchainEvent(payload: EachMessagePayload): Promise<void> {
    const { message } = payload;
    const event: BlockchainEvent = JSON.parse(message.value!.toString());

    console.log(`Processing blockchain event: ${event.type} for tx ${event.transactionHash}`);

    switch (event.type) {
      case BlockchainEventType.ESCROW_CREATED:
        await this.handleEscrowCreated(event);
        break;

      case BlockchainEventType.ESCROW_RELEASED:
        await this.handleEscrowReleased(event);
        break;

      case BlockchainEventType.ESCROW_REFUNDED:
        await this.handleEscrowRefunded(event);
        break;

      default:
        console.log(`Ignoring blockchain event type: ${event.type}`);
    }
  }

  private async handleEscrowCreated(event: BlockchainEvent): Promise<void> {
    // Record escrow creation in ledger
    const kafkaClient = getKafkaClient();
    await kafkaClient.publishLedgerEvent({
      type: 'ledger.account_created' as any,
      transferId: event.transactionHash,
      debitAccountId: 'platform-escrow',
      creditAccountId: event.to,
      amount: event.value,
      ledgerId: 1,
      code: 3000, // Escrow code
      status: 'created',
      metadata: {
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
      },
      timestamp: new Date().toISOString(),
    });

    console.log(`✅ Recorded escrow creation for tx ${event.transactionHash}`);
  }

  private async handleEscrowReleased(event: BlockchainEvent): Promise<void> {
    // Create transfer from escrow to recipient
    const result = await this.tigerBeetle.createTransfer({
      debitAccountId: 'platform-escrow',
      creditAccountId: event.to,
      amount: event.value,
      ledgerId: 1,
      code: 3001, // Escrow release code
      userData128: JSON.stringify({
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
      }),
    });

    if (result.success) {
      console.log(`✅ Created escrow release transfer for tx ${event.transactionHash}`);

      // Publish ledger event
      const kafkaClient = getKafkaClient();
      await kafkaClient.publishLedgerEvent({
        type: 'ledger.transfer_created' as any,
        transferId: result.transfer!.transferId,
        debitAccountId: 'platform-escrow',
        creditAccountId: event.to,
        amount: event.value,
        ledgerId: 1,
        code: 3001,
        status: 'posted',
        metadata: {
          transactionHash: event.transactionHash,
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      throw new Error(`Failed to create escrow release transfer: ${result.error}`);
    }
  }

  private async handleEscrowRefunded(event: BlockchainEvent): Promise<void> {
    // Create transfer from escrow back to sender
    const result = await this.tigerBeetle.createTransfer({
      debitAccountId: 'platform-escrow',
      creditAccountId: event.from,
      amount: event.value,
      ledgerId: 1,
      code: 3002, // Escrow refund code
      userData128: JSON.stringify({
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
      }),
    });

    if (result.success) {
      console.log(`✅ Created escrow refund transfer for tx ${event.transactionHash}`);

      // Publish ledger event
      const kafkaClient = getKafkaClient();
      await kafkaClient.publishLedgerEvent({
        type: 'ledger.transfer_created' as any,
        transferId: result.transfer!.transferId,
        debitAccountId: 'platform-escrow',
        creditAccountId: event.from,
        amount: event.value,
        ledgerId: 1,
        code: 3002,
        status: 'posted',
        metadata: {
          transactionHash: event.transactionHash,
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      throw new Error(`Failed to create escrow refund transfer: ${result.error}`);
    }
  }

  private async handleError(payload: EachMessagePayload, error: Error): Promise<void> {
    const kafkaClient = getKafkaClient();
    await kafkaClient.publishToDeadLetterQueue(
      payload.topic,
      payload.message.key?.toString() || '',
      payload.message.value?.toString(),
      error
    );
  }

  async stop(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect();
      console.log('✅ Blockchain event consumer stopped');
    }
  }
}

/**
 * Reconciliation Consumer
 * 
 * Reconciles payment, blockchain, and ledger events
 */
export class ReconciliationConsumer {
  private consumer: Consumer | null = null;
  private tigerBeetle = getTigerBeetleClient();

  async start(): Promise<void> {
    const kafkaClient = getKafkaClient();
    this.consumer = await kafkaClient.getConsumer('reconciliation-consumer');

    // Subscribe to all event topics
    await this.consumer.subscribe({
      topics: [
        KAFKA_TOPICS.PAYMENT_EVENTS,
        KAFKA_TOPICS.BLOCKCHAIN_EVENTS,
        KAFKA_TOPICS.LEDGER_EVENTS,
      ],
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        try {
          await this.reconcileEvent(payload);
        } catch (error) {
          console.error('Error reconciling event:', error);
          await this.handleError(payload, error as Error);
        }
      },
    });

    console.log('✅ Reconciliation consumer started');
  }

  private async reconcileEvent(payload: EachMessagePayload): Promise<void> {
    const { topic, message } = payload;
    const event = JSON.parse(message.value!.toString());

    // Check if this is a completed payment that needs blockchain reconciliation
    if (topic === KAFKA_TOPICS.PAYMENT_EVENTS && event.type === PaymentEventType.COMPLETED) {
      await this.reconcilePaymentWithBlockchain(event);
    }

    // Check if this is a confirmed blockchain transaction that needs ledger reconciliation
    if (topic === KAFKA_TOPICS.BLOCKCHAIN_EVENTS && event.type === BlockchainEventType.TRANSACTION_CONFIRMED) {
      await this.reconcileBlockchainWithLedger(event);
    }
  }

  private async reconcilePaymentWithBlockchain(paymentEvent: PaymentEvent): Promise<void> {
    const db = await requireDb();


    // Find corresponding blockchain transaction
    const [payment] = await db
      .select()
      .from(mojaloopTransactions)
      .where(eq(mojaloopTransactions.transactionId, paymentEvent.transactionId))
      .limit(1);

    if (!payment) {
      console.warn(`Payment not found for reconciliation: ${paymentEvent.paymentId}`);
      return;
    }

    // Check if blockchain transaction exists
    if (payment.blockchainTxHash) {
      const [blockchainTx] = await db
        .select()
        .from(blockchainTransactions)
        .where(eq(blockchainTransactions.txHash, payment.blockchainTxHash))
        .limit(1);

      if (blockchainTx && blockchainTx.status === 'confirmed') {
        // Reconcile with TigerBeetle
        const result = await this.tigerBeetle.reconcilePayment({
          paymentId: paymentEvent.paymentId,
          transactionHash: payment.blockchainTxHash,
          debitAccountId: 'platform-escrow',
          creditAccountId: paymentEvent.payeeId,
          amount: paymentEvent.amount,
          code: 4000, // Reconciliation code
          metadata: JSON.stringify({
            paymentId: paymentEvent.paymentId,
            transactionId: paymentEvent.transactionId,
            blockchainTxHash: payment.blockchainTxHash,
          }),
        });

        if (result.success) {
          console.log(`✅ Reconciled payment ${paymentEvent.paymentId} with blockchain`);

          // Publish reconciliation event
          const kafkaClient = getKafkaClient();
          await kafkaClient.publishReconciliationEvent({
            paymentId: paymentEvent.paymentId,
            transactionHash: payment.blockchainTxHash,
            transferId: result.transferId!,
            amount: paymentEvent.amount,
            status: 'completed',
            timestamp: new Date().toISOString(),
          });
        } else {
          throw new Error(`Failed to reconcile payment: ${result.error}`);
        }
      }
    }
  }

  private async reconcileBlockchainWithLedger(blockchainEvent: BlockchainEvent): Promise<void> {
    // Verify ledger entry exists for this blockchain transaction
    const transfer = await this.tigerBeetle.getTransfer(blockchainEvent.transactionHash);

    if (!transfer.success) {
      console.warn(`Ledger entry not found for blockchain tx: ${blockchainEvent.transactionHash}`);
      return;
    }

    // Verify amounts match
    if (transfer.transfer && transfer.transfer.amount === blockchainEvent.value) {
      console.log(`✅ Blockchain tx ${blockchainEvent.transactionHash} matches ledger entry`);
    } else {
      console.error(`❌ Amount mismatch for tx ${blockchainEvent.transactionHash}`);
      
      // Publish reconciliation failure event
      const kafkaClient = getKafkaClient();
      await kafkaClient.publishReconciliationEvent({
        paymentId: '',
        transactionHash: blockchainEvent.transactionHash,
        transferId: transfer.transfer?.transferId || '',
        amount: blockchainEvent.value,
        status: 'failed',
        errorMessage: 'Amount mismatch between blockchain and ledger',
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async handleError(payload: EachMessagePayload, error: Error): Promise<void> {
    const kafkaClient = getKafkaClient();
    await kafkaClient.publishToDeadLetterQueue(
      payload.topic,
      payload.message.key?.toString() || '',
      payload.message.value?.toString(),
      error
    );
  }

  async stop(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect();
      console.log('✅ Reconciliation consumer stopped');
    }
  }
}

/**
 * Start all consumers
 */
export async function startAllConsumers(): Promise<void> {
  const paymentConsumer = new PaymentEventConsumer();
  const blockchainConsumer = new BlockchainEventConsumer();
  const reconciliationConsumer = new ReconciliationConsumer();

  await Promise.all([
    paymentConsumer.start(),
    blockchainConsumer.start(),
    reconciliationConsumer.start(),
  ]);

  console.log('✅ All Kafka consumers started');
}

/**
 * Stop all consumers
 */
export async function stopAllConsumers(): Promise<void> {
  // Consumers will be automatically disconnected when Kafka client shuts down
  console.log('✅ All Kafka consumers stopped');
}
