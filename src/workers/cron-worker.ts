/**
 * Node-Cron Worker Implementation
 * Simple in-memory scheduler for eBay background searches
 * 
 * Benefits:
 * - No external dependencies (no Redis)
 * - Simple to set up and understand
 * - Good for single-instance deployments
 * 
 * Limitations:
 * - Jobs don't persist across restarts
 * - No horizontal scaling
 * - Limited monitoring capabilities
 */

import cron, { ScheduledTask } from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { createSearchWorker } from './search-worker';

export interface CronWorkerConfig {
  accessToken: string;
  sandbox?: boolean;
  cronSchedule: string; // Cron expression (e.g., "*/5 * * * *" for every 5 minutes)
  enabled: boolean;
}

/**
 * Manages cron-scheduled background tasks
 */
export class CronWorkerManager {
  private prisma: PrismaClient;
  private config: CronWorkerConfig;
  private task: ScheduledTask | null = null;
  private running = false;
  private lastRunTime: Date | null = null;
  private lastDuration = 0;

  constructor(prisma: PrismaClient, config: CronWorkerConfig) {
    this.prisma = prisma;
    this.config = config;
  }

  /**
   * Start the cron scheduler
   */
  start(): void {
    if (this.task) {
      console.log('[cron] Scheduler already running');
      return;
    }

    if (!this.config.enabled) {
      console.log('[cron] Scheduler disabled in config');
      return;
    }

    this.task = cron.schedule(
      this.config.cronSchedule,
      async () => {
        if (this.running) {
          console.warn('[cron] Previous search cycle still running, skipping this interval');
          return;
        }

        await this.executeSearch();
      }
    );

    console.log(`[cron] Cron scheduler started with schedule: "${this.config.cronSchedule}"`);
  }

  /**
   * Stop the cron scheduler
   */
  stop(): void {
    if (!this.task) {
      console.log('[cron] Scheduler not running');
      return;
    }

    this.task.stop();
    this.task.destroy();
    this.task = null;

    console.log('[cron] Cron scheduler stopped');
  }

  /**
   * Execute a search cycle
   */
  private async executeSearch(): Promise<void> {
    if (this.running) {
      console.warn('[cron] Search already in progress');
      return;
    }

    this.running = true;
    const startTime = Date.now();
    this.lastRunTime = new Date();

    console.log('[cron] Starting scheduled search cycle...');

    try {
      const searchWorker = createSearchWorker(this.prisma, {
        accessToken: this.config.accessToken,
        sandbox: this.config.sandbox || false,
        maxConcurrentRequests: 3,
        delayBetweenRequestsMs: 500,
        maxSearchesPerRun: 50,
      });

      const stats = await searchWorker.runSearchCycle();
      this.lastDuration = Date.now() - startTime;

      console.log('[cron] Search cycle completed:', {
        totalSearches: stats.totalSearches,
        completed: stats.completedSearches,
        failed: stats.failedSearches,
        newItems: stats.newItemsFound,
        totalItems: stats.totalItemsProcessed,
        durationMs: stats.durationMs,
      });
    } catch (error) {
      this.lastDuration = Date.now() - startTime;
      console.error('[cron] Error during search cycle:', error);
    } finally {
      this.running = false;
    }
  }

  /**
   * Manually trigger a search right now
   */
  async triggerNow(): Promise<void> {
    if (this.running) {
      console.warn('[cron] Search cycle already running');
      return;
    }

    console.log('[cron] Manually triggering search cycle...');
    await this.executeSearch();
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    running: boolean;
    enabled: boolean;
    schedule: string;
    lastRunTime: Date | null;
    lastDurationMs: number;
    nextRunTime: string | null;
  } {
    return {
      running: this.running,
      enabled: this.config.enabled && this.task !== null,
      schedule: this.config.cronSchedule,
      lastRunTime: this.lastRunTime,
      lastDurationMs: this.lastDuration,
      nextRunTime: null, // node-cron doesn't expose nextDate
    };
  }
}

/**
 * Cron schedule examples
 */
export const CRON_SCHEDULES = {
  // Every 5 minutes
  '5_MINUTES': '*/5 * * * *',
  
  // Every 15 minutes
  '15_MINUTES': '*/15 * * * *',
  
  // Every 30 minutes
  '30_MINUTES': '*/30 * * * *',
  
  // Every hour
  'HOURLY': '0 * * * *',
  
  // Every 2 hours
  '2_HOURS': '0 */2 * * *',
  
  // Every 6 hours
  '6_HOURS': '0 */6 * * *',
  
  // Daily at midnight
  'DAILY_MIDNIGHT': '0 0 * * *',
  
  // Daily at 6 AM
  'DAILY_6AM': '0 6 * * *',
  
  // Daily at noon
  'DAILY_NOON': '0 12 * * *',
  
  // Business hours: every 15 min, Monday-Friday, 9 AM - 5 PM
  'BUSINESS_HOURS': '*/15 9-17 * * 1-5',
  
  // Off-peak: every hour at 10 PM - 6 AM
  'OFF_PEAK': '0 22-5 * * *',
};

/**
 * Create a new cron scheduler
 */
export function createCronWorker(
  prisma: PrismaClient,
  config: CronWorkerConfig
): CronWorkerManager {
  return new CronWorkerManager(prisma, config);
}
