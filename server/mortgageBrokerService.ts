import { getDb } from './db';
import {
  mortgageBrokers,
  brokerClients,
  brokerCommissionStructures,
  brokerCommissions,
  brokerApplicationSubmissions,
  mortgageApplications,
} from '../drizzle/schema';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';

/**
 * Mortgage Broker Service
 * Handles broker registration, client management, commission tracking
 */

/**
 * Register new broker
 */
export async function registerBroker(params: {
  userId: number;
  companyName: string;
  licenseNumber: string;
  licenseExpiryDate: Date;
  businessPhone: string;
  businessEmail: string;
  businessAddress: string;
  defaultCommissionRate: number;
}): Promise<{ brokerId: string; status: string }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const brokerId = `BRK-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
  
  // Check if user is already a broker
  const existing = await db
    .select()
    .from(mortgageBrokers)
    .where(eq(mortgageBrokers.userId, params.userId));
  
  if (existing.length > 0) {
    throw new Error('User is already registered as a broker');
  }
  
  // Check if license number is already registered
  const existingLicense = await db
    .select()
    .from(mortgageBrokers)
    .where(eq(mortgageBrokers.licenseNumber, params.licenseNumber));
  
  if (existingLicense.length > 0) {
    throw new Error('License number is already registered');
  }
  
  // Create broker record
  const [broker] = await db
    .insert(mortgageBrokers)
    .values({
      brokerId,
      userId: params.userId,
      companyName: params.companyName,
      licenseNumber: params.licenseNumber,
      licenseExpiryDate: params.licenseExpiryDate,
      businessPhone: params.businessPhone,
      businessEmail: params.businessEmail,
      businessAddress: params.businessAddress,
      defaultCommissionRate: params.defaultCommissionRate,
      status: 'pending',
    })
    .returning();
  
  // Create default commission structure
  await db.insert(brokerCommissionStructures).values({
    brokerId: broker.id,
    tier: 'standard',
    commissionRate: params.defaultCommissionRate,
    minLoanAmount: 0,
    maxLoanAmount: null,
    effectiveFrom: new Date(),
    effectiveTo: null,
    isActive: true,
  });
  
  console.log(`[BrokerService] Registered broker ${brokerId} for user ${params.userId}`);
  
  return {
    brokerId,
    status: 'pending',
  };
}

/**
 * Approve broker registration
 */
export async function approveBroker(params: {
  brokerId: string;
  approvedBy: number;
}): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const [broker] = await db
    .select()
    .from(mortgageBrokers)
    .where(eq(mortgageBrokers.brokerId, params.brokerId));
  
  if (!broker) {
    throw new Error('Broker not found');
  }
  
  await db
    .update(mortgageBrokers)
    .set({
      status: 'active',
      approvedAt: new Date(),
      approvedBy: params.approvedBy,
      updatedAt: new Date(),
    })
    .where(eq(mortgageBrokers.brokerId, params.brokerId));
  
  console.log(`[BrokerService] Approved broker ${params.brokerId}`);
  
  return { success: true };
}

/**
 * Get broker details
 */
export async function getBrokerDetails(brokerId: string): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const [broker] = await db
    .select()
    .from(mortgageBrokers)
    .where(eq(mortgageBrokers.brokerId, brokerId));
  
  if (!broker) {
    throw new Error('Broker not found');
  }
  
  // Get commission structures
  const commissionStructures = await db
    .select()
    .from(brokerCommissionStructures)
    .where(eq(brokerCommissionStructures.brokerId, broker.id))
    .orderBy(desc(brokerCommissionStructures.effectiveFrom));
  
  return {
    ...broker,
    commissionStructures,
  };
}

/**
 * Get broker by user ID
 */
export async function getBrokerByUserId(userId: number): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const [broker] = await db
    .select()
    .from(mortgageBrokers)
    .where(eq(mortgageBrokers.userId, userId));
  
  if (!broker) {
    return null;
  }
  
  // Get commission structures
  const commissionStructures = await db
    .select()
    .from(brokerCommissionStructures)
    .where(eq(brokerCommissionStructures.brokerId, broker.id))
    .orderBy(desc(brokerCommissionStructures.effectiveFrom));
  
  return {
    ...broker,
    commissionStructures,
  };
}

/**
 * Add client to broker portfolio
 */
export async function addClient(params: {
  brokerId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientNIN?: string;
  notes?: string;
}): Promise<{ clientId: number }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const [broker] = await db
    .select()
    .from(mortgageBrokers)
    .where(eq(mortgageBrokers.brokerId, params.brokerId));
  
  if (!broker) {
    throw new Error('Broker not found');
  }
  
  // Check if client already exists for this broker
  const existing = await db
    .select()
    .from(brokerClients)
    .where(
      and(
        eq(brokerClients.brokerId, broker.id),
        eq(brokerClients.clientEmail, params.clientEmail)
      )
    );
  
  if (existing.length > 0) {
    throw new Error('Client already exists in your portfolio');
  }
  
  const [client] = await db
    .insert(brokerClients)
    .values({
      brokerId: broker.id,
      clientName: params.clientName,
      clientEmail: params.clientEmail,
      clientPhone: params.clientPhone,
      clientNIN: params.clientNIN || null,
      notes: params.notes || null,
    })
    .returning();
  
  console.log(`[BrokerService] Added client ${client.id} to broker ${params.brokerId}`);
  
  return { clientId: client.id };
}

/**
 * Get broker clients
 */
export async function getBrokerClients(brokerId: string): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const [broker] = await db
    .select()
    .from(mortgageBrokers)
    .where(eq(mortgageBrokers.brokerId, brokerId));
  
  if (!broker) {
    throw new Error('Broker not found');
  }
  
  const clients = await db
    .select()
    .from(brokerClients)
    .where(eq(brokerClients.brokerId, broker.id))
    .orderBy(desc(brokerClients.addedAt));
  
  return clients;
}

/**
 * Submit application on behalf of client
 */
export async function submitApplicationForClient(params: {
  brokerId: string;
  clientId: number;
  applicationId: number;
  submissionNotes?: string;
}): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const [broker] = await db
    .select()
    .from(mortgageBrokers)
    .where(eq(mortgageBrokers.brokerId, params.brokerId));
  
  if (!broker) {
    throw new Error('Broker not found');
  }
  
  if (broker.status !== 'active') {
    throw new Error('Broker account is not active');
  }
  
  // Verify client belongs to broker
  const [client] = await db
    .select()
    .from(brokerClients)
    .where(
      and(
        eq(brokerClients.id, params.clientId),
        eq(brokerClients.brokerId, broker.id)
      )
    );
  
  if (!client) {
    throw new Error('Client not found in broker portfolio');
  }
  
  // Create submission record
  await db.insert(brokerApplicationSubmissions).values({
    brokerId: broker.id,
    applicationId: params.applicationId,
    clientId: params.clientId,
    submissionNotes: params.submissionNotes || null,
  });
  
  // Update broker metrics
  await db
    .update(mortgageBrokers)
    .set({
      totalApplications: sql`${mortgageBrokers.totalApplications} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(mortgageBrokers.id, broker.id));
  
  console.log(`[BrokerService] Broker ${params.brokerId} submitted application ${params.applicationId}`);
  
  return { success: true };
}

/**
 * Calculate and create commission
 */
export async function calculateCommission(params: {
  brokerId: string;
  applicationId: number;
  loanAmount: number;
}): Promise<{ commissionId: string; commissionAmount: number }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const [broker] = await db
    .select()
    .from(mortgageBrokers)
    .where(eq(mortgageBrokers.brokerId, params.brokerId));
  
  if (!broker) {
    throw new Error('Broker not found');
  }
  
  // Find applicable commission structure
  const [structure] = await db
    .select()
    .from(brokerCommissionStructures)
    .where(
      and(
        eq(brokerCommissionStructures.brokerId, broker.id),
        eq(brokerCommissionStructures.isActive, true),
        gte(brokerCommissionStructures.minLoanAmount, params.loanAmount),
        sql`${brokerCommissionStructures.maxLoanAmount} IS NULL OR ${brokerCommissionStructures.maxLoanAmount} >= ${params.loanAmount}`
      )
    )
    .orderBy(desc(brokerCommissionStructures.effectiveFrom))
    .limit(1);
  
  const commissionRate = structure?.commissionRate || broker.defaultCommissionRate;
  const commissionAmount = Math.floor((params.loanAmount * commissionRate) / 10000);
  
  const commissionId = `COM-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
  
  // Create commission record
  await db.insert(brokerCommissions).values({
    commissionId,
    brokerId: broker.id,
    applicationId: params.applicationId,
    loanAmount: params.loanAmount,
    commissionRate,
    commissionAmount,
    status: 'pending',
  });
  
  console.log(
    `[BrokerService] Created commission ${commissionId} for broker ${params.brokerId}: ₦${commissionAmount.toLocaleString()}`
  );
  
  return {
    commissionId,
    commissionAmount,
  };
}

/**
 * Approve commission payment
 */
export async function approveCommission(params: {
  commissionId: string;
  approvedBy: number;
}): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const [commission] = await db
    .select()
    .from(brokerCommissions)
    .where(eq(brokerCommissions.commissionId, params.commissionId));
  
  if (!commission) {
    throw new Error('Commission not found');
  }
  
  await db
    .update(brokerCommissions)
    .set({
      status: 'approved',
      approvedAt: new Date(),
      approvedBy: params.approvedBy,
      updatedAt: new Date(),
    })
    .where(eq(brokerCommissions.commissionId, params.commissionId));
  
  console.log(`[BrokerService] Approved commission ${params.commissionId}`);
  
  return { success: true };
}

/**
 * Mark commission as paid
 */
export async function markCommissionPaid(params: {
  commissionId: string;
  paymentReference: string;
}): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const [commission] = await db
    .select()
    .from(brokerCommissions)
    .where(eq(brokerCommissions.commissionId, params.commissionId));
  
  if (!commission) {
    throw new Error('Commission not found');
  }
  
  if (commission.status !== 'approved') {
    throw new Error('Commission must be approved before marking as paid');
  }
  
  await db
    .update(brokerCommissions)
    .set({
      status: 'paid',
      paidAt: new Date(),
      paymentReference: params.paymentReference,
      updatedAt: new Date(),
    })
    .where(eq(brokerCommissions.commissionId, params.commissionId));
  
  // Update broker total commission earned
  await db
    .update(mortgageBrokers)
    .set({
      totalCommissionEarned: sql`${mortgageBrokers.totalCommissionEarned} + ${commission.commissionAmount}`,
      updatedAt: new Date(),
    })
    .where(eq(mortgageBrokers.id, commission.brokerId));
  
  console.log(`[BrokerService] Marked commission ${params.commissionId} as paid`);
  
  return { success: true };
}

/**
 * Get broker commissions
 */
export async function getBrokerCommissions(params: {
  brokerId: string;
  status?: string;
}): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const [broker] = await db
    .select()
    .from(mortgageBrokers)
    .where(eq(mortgageBrokers.brokerId, params.brokerId));
  
  if (!broker) {
    throw new Error('Broker not found');
  }
  
  const conditions = [eq(brokerCommissions.brokerId, broker.id)];
  
  if (params.status) {
    conditions.push(eq(brokerCommissions.status, params.status as any));
  }
  
  const results = await db
    .select({
      commission: brokerCommissions,
      application: mortgageApplications,
    })
    .from(brokerCommissions)
    .leftJoin(
      mortgageApplications,
      eq(brokerCommissions.applicationId, mortgageApplications.id)
    )
    .where(and(...conditions))
    .orderBy(desc(brokerCommissions.createdAt));
  

  
  return results.map((r) => ({
    ...r.commission,
    application: r.application,
  }));
}

/**
 * Get broker performance analytics
 */
export async function getBrokerPerformance(brokerId: string): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const [broker] = await db
    .select()
    .from(mortgageBrokers)
    .where(eq(mortgageBrokers.brokerId, brokerId));
  
  if (!broker) {
    throw new Error('Broker not found');
  }
  
  // Get commission summary
  const commissionSummary = await db
    .select({
      status: brokerCommissions.status,
      count: sql<number>`count(*)::int`,
      totalAmount: sql<number>`sum(${brokerCommissions.commissionAmount})::int`,
    })
    .from(brokerCommissions)
    .where(eq(brokerCommissions.brokerId, broker.id))
    .groupBy(brokerCommissions.status);
  
  // Get client count
  const [clientCount] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(case when ${brokerClients.isActive} then 1 end)::int`,
    })
    .from(brokerClients)
    .where(eq(brokerClients.brokerId, broker.id));
  
  // Get application submission count
  const [submissionCount] = await db
    .select({
      total: sql<number>`count(*)::int`,
    })
    .from(brokerApplicationSubmissions)
    .where(eq(brokerApplicationSubmissions.brokerId, broker.id));
  
  // Calculate approval rate
  const approvalRate =
    broker.totalApplications > 0
      ? (broker.approvedApplications / broker.totalApplications) * 100
      : 0;
  
  return {
    broker: {
      brokerId: broker.brokerId,
      companyName: broker.companyName,
      status: broker.status,
      totalApplications: broker.totalApplications,
      approvedApplications: broker.approvedApplications,
      approvalRate: approvalRate.toFixed(2),
      totalCommissionEarned: broker.totalCommissionEarned,
    },
    commissions: {
      summary: commissionSummary,
      totalEarned: broker.totalCommissionEarned,
    },
    clients: {
      total: clientCount?.total || 0,
      active: clientCount?.active || 0,
    },
    submissions: {
      total: submissionCount?.total || 0,
    },
  };
}

/**
 * Update broker commission structure
 */
export async function updateCommissionStructure(params: {
  brokerId: string;
  tier: string;
  commissionRate: number;
  minLoanAmount: number;
  maxLoanAmount?: number;
  effectiveFrom: Date;
}): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const [broker] = await db
    .select()
    .from(mortgageBrokers)
    .where(eq(mortgageBrokers.brokerId, params.brokerId));
  
  if (!broker) {
    throw new Error('Broker not found');
  }
  
  // Deactivate existing structures
  await db
    .update(brokerCommissionStructures)
    .set({ isActive: false })
    .where(eq(brokerCommissionStructures.brokerId, broker.id));
  
  // Create new structure
  await db.insert(brokerCommissionStructures).values({
    brokerId: broker.id,
    tier: params.tier as any,
    commissionRate: params.commissionRate,
    minLoanAmount: params.minLoanAmount,
    maxLoanAmount: params.maxLoanAmount || null,
    effectiveFrom: params.effectiveFrom,
    effectiveTo: null,
    isActive: true,
  });
  
  console.log(`[BrokerService] Updated commission structure for broker ${params.brokerId}`);
  
  return { success: true };
}
