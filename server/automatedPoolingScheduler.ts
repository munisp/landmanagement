import { runAutomatedPooling, monitorPoolPerformance } from './loanPoolingEngine';
import { sendEmail } from './notificationDelivery';
import { getDb } from './db';
import { users } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

/**
 * Automated Pooling Scheduler
 * Runs loan pooling engine on a schedule with email notifications
 */

export interface SchedulerConfig {
  enabled: boolean;
  strategy: 'riskBased' | 'maturityBased' | 'balanced';
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: number; // 0-6 for weekly (0 = Sunday)
  dayOfMonth?: number; // 1-31 for monthly
  hour: number; // 0-23
  minute: number; // 0-59
  notifyAdmins: boolean;
  adminEmails: string[];
}

// Default scheduler configuration
let schedulerConfig: SchedulerConfig = {
  enabled: true,
  strategy: 'balanced',
  frequency: 'daily',
  hour: 2, // 2 AM
  minute: 0,
  notifyAdmins: true,
  adminEmails: [],
};

// Scheduler state
let schedulerInterval: NodeJS.Timeout | null = null;
let lastRun: Date | null = null;
let nextScheduledRun: Date | null = null;

/**
 * Calculate next run time based on frequency
 */
function calculateNextRun(config: SchedulerConfig): Date {
  const now = new Date();
  const next = new Date(now);
  
  // Set time
  next.setHours(config.hour, config.minute, 0, 0);
  
  // If time has passed today, move to next occurrence
  if (next <= now) {
    switch (config.frequency) {
      case 'daily':
        next.setDate(next.getDate() + 1);
        break;
      case 'weekly':
        next.setDate(next.getDate() + 1);
        while (next.getDay() !== (config.dayOfWeek || 1)) {
          next.setDate(next.getDate() + 1);
        }
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        next.setDate(config.dayOfMonth || 1);
        break;
    }
  } else {
    // Check if we need to adjust for weekly/monthly
    if (config.frequency === 'weekly' && next.getDay() !== (config.dayOfWeek || 1)) {
      while (next.getDay() !== (config.dayOfWeek || 1)) {
        next.setDate(next.getDate() + 1);
      }
    } else if (config.frequency === 'monthly' && next.getDate() !== (config.dayOfMonth || 1)) {
      next.setDate(config.dayOfMonth || 1);
      if (next <= now) {
        next.setMonth(next.getMonth() + 1);
      }
    }
  }
  
  return next;
}

/**
 * Send notification email to admins
 */
async function notifyAdmins(
  subject: string,
  message: string,
  data?: any
): Promise<void> {
  if (!schedulerConfig.notifyAdmins || schedulerConfig.adminEmails.length === 0) {
    return;
  }
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">${subject}</h2>
      <p style="color: #666; line-height: 1.6;">${message}</p>
      ${data ? `
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin-top: 20px;">
          <h3 style="color: #333; margin-top: 0;">Details:</h3>
          <pre style="background-color: #fff; padding: 10px; border-radius: 3px; overflow-x: auto;">
${JSON.stringify(data, null, 2)}
          </pre>
        </div>
      ` : ''}
      <p style="color: #999; font-size: 12px; margin-top: 30px;">
        This is an automated notification from the Loan Pooling Scheduler.
      </p>
    </div>
  `;
  
  for (const email of schedulerConfig.adminEmails) {
    try {
      await sendEmail({
        to: email,
        subject,
        html: htmlContent,
      });
    } catch (error) {
      console.error(`[Scheduler] Failed to send email to ${email}:`, error);
    }
  }
}

/**
 * Execute scheduled pooling job
 */
async function executeScheduledPooling(): Promise<void> {
  console.log('[Scheduler] Starting scheduled loan pooling...');
  lastRun = new Date();
  
  try {
    // Run automated pooling
    const result = await runAutomatedPooling(schedulerConfig.strategy, 1); // System user ID
    
    console.log('[Scheduler] Pooling completed:', result);
    
    // Send success notification
    await notifyAdmins(
      'Automated Loan Pooling Completed',
      `The scheduled loan pooling job has completed successfully. ${result.poolsCreated} pools were created with ${result.loansPooled} loans.`,
      {
        strategy: schedulerConfig.strategy,
        poolsCreated: result.poolsCreated,
        loansPooled: result.loansPooled,
        timestamp: lastRun.toISOString(),
      }
    );
    
    // Monitor pool performance
    const performance = await monitorPoolPerformance();
    console.log('[Scheduler] Pool performance:', performance);
    
  } catch (error) {
    console.error('[Scheduler] Error during scheduled pooling:', error);
    
    // Send error notification
    await notifyAdmins(
      'Automated Loan Pooling Failed',
      `The scheduled loan pooling job encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        error: error instanceof Error ? error.message : String(error),
        timestamp: lastRun.toISOString(),
      }
    );
  }
  
  // Calculate next run
  nextScheduledRun = calculateNextRun(schedulerConfig);
  console.log('[Scheduler] Next run scheduled for:', nextScheduledRun);
}

/**
 * Check if it's time to run the scheduler
 */
function checkSchedule(): void {
  if (!schedulerConfig.enabled) {
    return;
  }
  
  const now = new Date();
  
  // If no next run is set, calculate it
  if (!nextScheduledRun) {
    nextScheduledRun = calculateNextRun(schedulerConfig);
    console.log('[Scheduler] Next run scheduled for:', nextScheduledRun);
    return;
  }
  
  // Check if it's time to run
  if (now >= nextScheduledRun) {
    executeScheduledPooling();
  }
}

/**
 * Start the scheduler
 */
export function startScheduler(config?: Partial<SchedulerConfig>): void {
  // Update configuration
  if (config) {
    schedulerConfig = { ...schedulerConfig, ...config };
  }
  
  // Load admin emails from database
  loadAdminEmails();
  
  // Stop existing scheduler if running
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }
  
  // Calculate next run
  nextScheduledRun = calculateNextRun(schedulerConfig);
  console.log('[Scheduler] Scheduler started. Next run:', nextScheduledRun);
  
  // Check every minute
  schedulerInterval = setInterval(checkSchedule, 60 * 1000);
  
  // Send startup notification
  notifyAdmins(
    'Automated Loan Pooling Scheduler Started',
    `The loan pooling scheduler has been started with the following configuration:`,
    {
      strategy: schedulerConfig.strategy,
      frequency: schedulerConfig.frequency,
      nextRun: nextScheduledRun?.toISOString(),
    }
  );
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[Scheduler] Scheduler stopped');
    
    notifyAdmins(
      'Automated Loan Pooling Scheduler Stopped',
      'The loan pooling scheduler has been stopped.',
      {
        lastRun: lastRun?.toISOString(),
      }
    );
  }
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
  enabled: boolean;
  running: boolean;
  config: SchedulerConfig;
  lastRun: Date | null;
  nextScheduledRun: Date | null;
} {
  return {
    enabled: schedulerConfig.enabled,
    running: schedulerInterval !== null,
    config: schedulerConfig,
    lastRun,
    nextScheduledRun,
  };
}

/**
 * Update scheduler configuration
 */
export function updateSchedulerConfig(config: Partial<SchedulerConfig>): void {
  schedulerConfig = { ...schedulerConfig, ...config };
  
  // Recalculate next run if scheduler is running
  if (schedulerInterval) {
    nextScheduledRun = calculateNextRun(schedulerConfig);
    console.log('[Scheduler] Configuration updated. Next run:', nextScheduledRun);
  }
  
  notifyAdmins(
    'Loan Pooling Scheduler Configuration Updated',
    'The scheduler configuration has been updated.',
    {
      newConfig: schedulerConfig,
      nextRun: nextScheduledRun?.toISOString(),
    }
  );
}

/**
 * Manually trigger pooling (outside of schedule)
 */
export async function triggerManualPooling(
  strategy?: 'riskBased' | 'maturityBased' | 'balanced',
  userId?: string
): Promise<any> {
  console.log('[Scheduler] Manual pooling triggered');
  
  const result = await runAutomatedPooling(
    strategy || schedulerConfig.strategy,
    1 // System user ID
  );
  
  await notifyAdmins(
    'Manual Loan Pooling Completed',
    `A manual loan pooling job was triggered and completed. ${result.poolsCreated} pools were created with ${result.loansPooled} loans.`,
    {
      strategy: strategy || schedulerConfig.strategy,
      poolsCreated: result.poolsCreated,
      loansPooled: result.loansPooled,
      triggeredBy: userId || 'manual',
      timestamp: new Date().toISOString(),
    }
  );
  
  return result;
}

/**
 * Load admin emails from database
 */
async function loadAdminEmails(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    
    const admins = await db
      .select()
      .from(users)
      .where(eq(users.role, 'admin'));
    
    schedulerConfig.adminEmails = admins
      .map((admin) => admin.email)
      .filter((email): email is string => email !== null);
    
    console.log(`[Scheduler] Loaded ${schedulerConfig.adminEmails.length} admin emails`);
  } catch (error) {
    console.error('[Scheduler] Failed to load admin emails:', error);
  }
}

/**
 * Get scheduler logs (last N runs)
 */
export interface SchedulerLog {
  timestamp: Date;
  type: 'success' | 'error' | 'manual';
  message: string;
  data?: any;
}

const schedulerLogs: SchedulerLog[] = [];
const MAX_LOGS = 100;

export function addSchedulerLog(log: SchedulerLog): void {
  schedulerLogs.unshift(log);
  if (schedulerLogs.length > MAX_LOGS) {
    schedulerLogs.pop();
  }
}

export function getSchedulerLogs(limit: number = 50): SchedulerLog[] {
  return schedulerLogs.slice(0, limit);
}

// Auto-start scheduler on module load
if (process.env.NODE_ENV === 'production') {
  startScheduler();
}
