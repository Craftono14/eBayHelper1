/**
 * Worker Integration with Express Server
 * Sets up background search jobs and provides monitoring endpoints
 */

import express, { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  createCronWorker,
  createSearchQueue,
  createBullMQWorker,
  schedulePeriodicSearches,
  triggerSearchNow,
  getQueueStats,
  setupQueueEventListener,
  CRON_SCHEDULES,
} from './index';

/**
 * Initialize worker routes and set up background jobs
 * Choose either BullMQ (recommended) or node-cron based on environment
 */
export async function initializeWorkers(
  _app: express.Application,
  prisma: PrismaClient,
  accessToken: string,
  options?: {
    useBullMQ?: boolean;
    cronSchedule?: string;
    sandbox?: boolean;
    redisUrl?: string;
  }
): Promise<{ router: Router; cleanup?: () => Promise<void> }> {
  const useBullMQ = options?.useBullMQ ?? false; // Default to node-cron for simplicity
  const sandbox = options?.sandbox ?? false;
  const cronSchedule = options?.cronSchedule ?? '*/5 * * * *'; // Default: every 5 minutes

  console.log(`[workers] Initializing with ${useBullMQ ? 'BullMQ' : 'node-cron'}`);

  const router = Router();

  if (useBullMQ) {
    // ========================================
    // BullMQ Setup (Production-grade)
    // ========================================
    try {
      const queue = createSearchQueue(options?.redisUrl);
      const worker = createBullMQWorker(queue, prisma, accessToken, sandbox);
      const queueEvents = setupQueueEventListener(queue);

      // Schedule periodic searches
      await schedulePeriodicSearches(queue, 5 * 60 * 1000, accessToken); // 5 minutes

      // ========================================
      // BullMQ Endpoints
      // ========================================

      /**
       * GET /workers/status
       * Get current job queue status
       */
      router.get('/status', async (_req, res) => {
        try {
          const stats = await getQueueStats(queue);
          res.json({
            type: 'bullmq',
            queue: stats,
            timestamp: new Date(),
          });
        } catch (error) {
          res.status(500).json({ error: (error as Error).message });
        }
      });

      /**
       * POST /workers/trigger
       * Manually trigger a search job immediately
       */
      router.post('/trigger', async (_req, res) => {
        try {
          const jobId = await triggerSearchNow(queue, accessToken);
          res.json({
            success: true,
            jobId,
            message: 'Search job triggered',
          });
        } catch (error) {
          res.status(500).json({ error: (error as Error).message });
        }
      });

      /**
       * GET /workers/jobs/:jobId
       * Get details about a specific job
       */
      router.get('/jobs/:jobId', async (req, res) => {
        try {
          const job = await queue.getJob(req.params.jobId);
          if (!job) {
            return res.status(404).json({ error: 'Job not found' });
          }

          const state = await job.getState();

          return res.json({
            id: job.id,
            name: job.name,
            data: job.data,
            state,
            attempts: job.attemptsMade,
            maxAttempts: job.opts.attempts,
            stacktrace: job.stacktrace,
            failedReason: job.failedReason,
          });
        } catch (error) {
          return res.status(500).json({ error: (error as Error).message });
        }
      });

      // Cleanup function
      const cleanup = async () => {
        console.log('[workers] Cleaning up BullMQ resources...');
        await worker.close();
        await queueEvents.close();
        await queue.close();
      };

      return { router, cleanup };
    } catch (error) {
      console.error('[workers] Failed to initialize BullMQ:', error);
      console.log('[workers] Falling back to node-cron');
    }
  }

  // ========================================
  // Node-Cron Setup (Simple, No Redis)
  // ========================================
  const cronWorker = createCronWorker(prisma, {
    accessToken,
    sandbox,
    cronSchedule,
    enabled: true,
  });

  // Start the scheduler
  cronWorker.start();

  // ========================================
  // Node-Cron Endpoints
  // ========================================

  /**
   * GET /workers/status
   * Get current scheduler status
   */
  router.get('/status', (_req, res) => {
    const status = cronWorker.getStatus();
    res.json({
      type: 'node-cron',
      scheduler: status,
      timestamp: new Date(),
    });
  });

  /**
   * POST /workers/trigger
   * Manually trigger a search immediately
   */
  router.post('/trigger', async (_req, res) => {
    try {
      await cronWorker.triggerNow();
      return res.json({
        success: true,
        message: 'Search cycle triggered',
      });
    } catch (error) {
      return res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * POST /workers/start
   * Start the scheduler
   */
  router.post('/start', (_req, res) => {
    try {
      cronWorker.start();
      res.json({
        success: true,
        message: 'Scheduler started',
        status: cronWorker.getStatus(),
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * POST /workers/stop
   * Stop the scheduler
   */
  router.post('/stop', (_req, res) => {
    try {
      cronWorker.stop();
      res.json({
        success: true,
        message: 'Scheduler stopped',
        status: cronWorker.getStatus(),
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * PATCH /workers/schedule
   * Update the cron schedule
   * Body example: { cronSchedule: every 10 minutes pattern }
   */
  router.patch('/schedule', (req, res) => {
    const { cronSchedule } = req.body;

    if (!cronSchedule || typeof cronSchedule !== 'string') {
      return res.status(400).json({ error: 'cronSchedule is required and must be a string' });
    }

    // Validate cron expression (basic check)
    const cronParts = cronSchedule.split(' ');
    if (cronParts.length !== 5) {
      return res.status(400).json({
        error: 'Invalid cron expression. Must have 5 parts (minute hour day month weekday)',
      });
    }

    try {
      // Restart scheduler with new schedule
      cronWorker.stop();

      // Create new worker with updated schedule
      const newWorker = createCronWorker(prisma, {
        accessToken,
        sandbox,
        cronSchedule,
        enabled: true,
      });
      newWorker.start();

      return res.json({
        success: true,
        message: 'Schedule updated',
        newSchedule: cronSchedule,
        status: newWorker.getStatus(),
      });
    } catch (error) {
      return res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * GET /workers/schedules
   * Get available cron schedule presets
   */
  router.get('/schedules', (_req, res) => {
    res.json({
      presets: CRON_SCHEDULES,
      current: cronWorker.getStatus().schedule,
      examples: {
        every5Minutes: '*/5 * * * *',
        every15Minutes: '*/15 * * * *',
        hourly: '0 * * * *',
        dailyAt6am: '0 6 * * *',
        businessHours: '*/15 9-17 * * 1-5',
      },
    });
  });

  // Cleanup function (graceful shutdown)
  const cleanup = async () => {
    console.log('[workers] Cleaning up node-cron resources...');
    cronWorker.stop();
  };

  return { router, cleanup };
}

/**
 * Mount worker routes to Express app
 */
export function mountWorkerRoutes(
  app: express.Application,
  router: Router,
  basePath: string = '/api/workers'
): void {
  app.use(basePath, router);
  console.log(`[workers] Routes mounted at ${basePath}`);
}
