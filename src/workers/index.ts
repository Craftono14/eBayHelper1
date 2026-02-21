/**
 * Workers Module
 * Background job management for eBay periodic searches
 */

// Item matching and comparison
export {
  findNewItems,
  saveNewItems,
  recordPriceHistory,
  getSearchStatistics,
  MatchResult,
  SearchComparisonResult,
} from './item-matcher';

// Core worker service
export {
  SearchWorker,
  createSearchWorker,
  WorkerConfig,
  WorkerStats,
} from './search-worker';

// BullMQ implementation (recommended for production)
export {
  createSearchQueue,
  createBullMQWorker,
  schedulePeriodicSearches,
  triggerSearchNow,
  getQueueStats,
  setupQueueEventListener,
  shutdownBullMQ,
  JobData,
} from './bullmq-worker';

// Node-cron implementation (simpler, no Redis)
export {
  CronWorkerManager,
  createCronWorker,
  CRON_SCHEDULES,
  CronWorkerConfig,
} from './cron-worker';
