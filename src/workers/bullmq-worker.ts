/**
 * BullMQ Worker Implementation
 * Production-grade background job queue for periodic eBay searches
 * 
 * Benefits:
 * - Redis-backed persistence (survives restarts)
 * - Distributed workers (scale horizontally)
 * - Automatic retries and exponential backoff
 * - Job monitoring and dashboard support
 * - Better rate limit handling across workers
 */

import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { createSearchWorker } from './search-worker';

export interface JobData {
  type: 'search-cycle' | 'single-search';
  userId?: number;
  searchId?: number;
  accessToken: string;
  sandbox?: boolean;
}

/**
 * Initialize BullMQ queue for eBay background searches
 */
export function createSearchQueue(redisUrl?: string): Queue<JobData> {
  const connection = {
    host: 'localhost',
    port: 6379,
    maxRetriesPerRequest: null,
    ...(redisUrl && { url: redisUrl }),
  };

  const queue = new Queue<JobData>('ebay-searches', {
    connection: connection as any,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 3600, // Keep completed jobs for 1 hour
      },
      removeOnFail: false, // Keep failed jobs for debugging
    },
  });

  console.log('[bullmq] Search queue initialized');
  return queue;
}

/**
 * Create a BullMQ worker to process search jobs
 */
export function createBullMQWorker(
  queue: Queue<JobData>,
  prisma: PrismaClient,
  accessToken: string,
  sandbox?: boolean
): Worker<JobData> {
  const worker = new Worker<JobData>(
    queue.name,
    async (job: Job<JobData>) => {
      console.log(`[bullmq] Processing job ${job.id}: ${job.data.type}`);

      const searchWorker = createSearchWorker(prisma, {
        accessToken: job.data.accessToken || accessToken,
        sandbox: job.data.sandbox ?? sandbox,
        maxConcurrentRequests: 3,
        delayBetweenRequestsMs: 500,
        maxSearchesPerRun: 50,
      });

      try {
        const stats = await searchWorker.runSearchCycle();
        console.log(`[bullmq] Job ${job.id} completed:`, stats);
        return { success: true, stats };
      } catch (error) {
        console.error(`[bullmq] Job ${job.id} failed:`, error);
        throw error;
      }
    },
    {
      connection: {
        host: 'localhost',
        port: 6379,
        maxRetriesPerRequest: null,
      } as any,
      concurrency: 2, // Max 2 concurrent jobs
    }
  );

  // Event handlers
  worker.on('completed', (job) => {
    console.log(`[bullmq] ✓ Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[bullmq] ✗ Job ${job?.id} failed:`, err?.message);
  });

  worker.on('error', (err) => {
    console.error('[bullmq] Worker error:', err);
  });

  console.log('[bullmq] Worker started and listening');
  return worker;
}

/**
 * Schedule periodic search jobs using BullMQ repeatable jobs
 */
export async function schedulePeriodicSearches(
  queue: Queue<JobData>,
  intervalMs: number = 5 * 60 * 1000, // Default: 5 minutes
  accessToken: string
): Promise<string> {
  const job = await queue.add(
    'periodic-search',
    {
      type: 'search-cycle',
      accessToken,
      sandbox: false,
    },
    {
      repeat: {
        every: intervalMs,
      },
      jobId: 'ebay-search-cycle-5min',
    }
  );

  console.log(`[bullmq] Scheduled periodic search job every ${intervalMs}ms`);
  return job.id || 'ebay-search-cycle-5min';
}

/**
 * Manually trigger a search job immediately
 */
export async function triggerSearchNow(
  queue: Queue<JobData>,
  accessToken: string
): Promise<string> {
  const job = await queue.add(
    'immediate-search',
    {
      type: 'search-cycle',
      accessToken,
      sandbox: false,
    }
  );

  console.log(`[bullmq] Triggered immediate search job ${job.id}`);
  return job.id || 'unknown';
}

/**
 * Get queue statistics and job information
 */
export async function getQueueStats(queue: Queue<JobData>): Promise<{
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const counts = await queue.getJobCounts();
  console.log('[bullmq] Queue stats:', counts);
  return {
    active: counts.active || 0,
    waiting: counts.waiting || 0,
    completed: counts.completed || 0,
    failed: counts.failed || 0,
    delayed: counts.delayed || 0,
  };
}

/**
 * Listen to queue events for monitoring
 */
export function setupQueueEventListener(queue: Queue<JobData>): QueueEvents {
  const queueEvents = new QueueEvents(queue.name, {
    connection: {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
    } as any,
  });

  queueEvents.on('completed', ({ jobId }) => {
    console.log(`[bullmq-events] Job ${jobId} completed`);
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`[bullmq-events] Job ${jobId} failed: ${failedReason}`);
  });

  queueEvents.on('error', (error) => {
    console.error('[bullmq-events] Error:', error);
  });

  return queueEvents;
}

/**
 * Gracefully shutdown BullMQ worker and queue
 */
export async function shutdownBullMQ(
  worker: Worker,
  queue: Queue,
  queueEvents: QueueEvents
): Promise<void> {
  console.log('[bullmq] Shutting down...');
  
  try {
    await worker.close();
    await queueEvents.close();
    await queue.close();
    console.log('[bullmq] Shutdown complete');
  } catch (error) {
    console.error('[bullmq] Error during shutdown:', error);
  }
}
