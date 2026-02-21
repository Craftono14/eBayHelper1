import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import oauthRoutes from './routes/oauth';
import searchRoutes from './routes/search.routes';
import authRoutes from './routes/auth.routes';
import { createSearchesRouter } from './routes/searches.routes';
import ebayLinkRoutes from './routes/ebay-link.routes';
import ebayWatchlistRoutes from './routes/ebay-watchlist.routes';
import ebaySyncRoutes from './routes/ebay-sync.routes';
import ebayAccountDeletionRoutes from './routes/ebay-account-deletion.routes';
import syncRoutes from './routes/sync.routes';
import { createPriceMonitoringRouter } from './routes/prices.routes';
import { requireAuth } from './middleware/auth.middleware';
import { initializeWorkers, mountWorkerRoutes } from './workers/express-integration';

// Load environment variables
dotenv.config();

// Initialize Express app
const app: Express = express();
const port = parseInt(process.env.PORT || '3000', 10);

// Initialize Prisma Client
const prisma = new PrismaClient();

// Middleware
app.use(helmet()); // Security headers
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests from localhost (development) and your production domain
      const allowedOrigins = [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000',
      ];
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Allow all origins in development
      }
    },
    credentials: true, // Allow credentials (cookies, authorization headers)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200,
  })
); // Enable CORS with credentials
app.use(morgan('dev')); // Logging

// Log all incoming requests to help debug OAuth callback
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.path.includes('ebay') || req.path.includes('callback')) {
    console.log('[DEBUG] Incoming request:', {
      method: req.method,
      path: req.path,
      url: req.url,
      query: req.query,
      headers: {
        host: req.headers.host,
        referer: req.headers.referer,
      }
    });
  }
  next();
});
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Root endpoint
app.get('/', (_req: Request, res: Response): void => {
  res.json({
    message: 'Welcome to eBay Helper API',
    status: 'running',
    endpoints: {
      health: '/health',
      api: '/api',
      auth: '/api/auth',
      oauth: '/api/oauth',
      search: '/api/search',
      searches: '/api/searches',
      ebay: '/api/ebay',
      prices: '/api/prices',
    },
  });
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response): void => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Basic API endpoint
app.get('/api', (_req: Request, res: Response): void => {
  res.json({ message: 'Welcome to EbayHelper API' });
});

// OAuth routes
app.use('/api/oauth', oauthRoutes);

// Search routes
app.use('/api/search', searchRoutes);

// Searches dashboard routes
app.use('/api/searches', createSearchesRouter());

// Auth routes
app.use('/api/auth', authRoutes);

// eBay OAuth link routes
app.use('/api/ebay', ebayLinkRoutes);

// eBay Watchlist routes
app.use('/api/ebay-watchlist', ebayWatchlistRoutes);

// eBay Sync routes
app.use('/api/ebay-sync', ebaySyncRoutes);

// eBay Account Deletion Notification routes (for eBay compliance)
app.use('/api/ebay/account-deletion', ebayAccountDeletionRoutes);

// Sync routes
app.use('/api/sync', syncRoutes);

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Catch any unhandled eBay-related routes before 404
app.all('*ebay*', (req: Request, _res: Response, next: NextFunction): void => {
  console.log('[DEBUG] Unmatched eBay route:', {
    method: req.method,
    path: req.path,
    url: req.url,
    query: req.query,
  });
  next();
});

// 404 handler
app.use((_req: Request, res: Response): void => {
  res.status(404).json({ error: 'Not Found', message: `Route ${_req.path} not found` });
});

// Start server
const startServer = async (): Promise<void> => {
  try {
    // Run database migrations on startup
    try {
      console.log('Running database migrations...');
      const { execSync } = require('child_process');
      execSync('npx prisma migrate deploy', { stdio: 'inherit' });
      console.log('✓ Migrations completed successfully');
    } catch (error) {
      console.error('⚠️  Migration warning (may be normal if already migrated):', error);
      // Don't exit here - migrations might already be applied
    }

    // Initialize background workers
    const accessToken = process.env.EBAY_ACCESS_TOKEN;
    if (!accessToken) {
      console.warn('⚠️  EBAY_ACCESS_TOKEN not set - background workers disabled');
    } else {
      try {
        const { router: workerRouter, cleanup: workerCleanup } = await initializeWorkers(
          app,
          prisma,
          accessToken,
          {
            useBullMQ: process.env.USE_BULLMQ === 'true', // Set to 'true' to use BullMQ instead of node-cron
            cronSchedule: process.env.WORKER_SCHEDULE || '*/5 * * * *', // Default: every 5 minutes
            sandbox: process.env.EBAY_SANDBOX === 'true',
            redisUrl: process.env.REDIS_URL,
          }
        );

        mountWorkerRoutes(app, workerRouter, '/api/workers');

        // Store cleanup function for graceful shutdown
        if (workerCleanup) {
          process.on('SIGINT', async () => {
            console.log('Cleaning up workers...');
            await workerCleanup();
          });
        }
      } catch (error) {
        console.error('Failed to initialize workers:', error);
      }
      // Mount price monitoring routes (protected) when access token available
      try {
        app.use('/api/prices', requireAuth, createPriceMonitoringRouter(prisma, accessToken));
      } catch (err) {
        console.error('Failed to mount price monitoring routes:', err);
      }
    }

    app.listen(port, '0.0.0.0', (): void => {
      console.log(`✓ Server is running on port ${port}`);
      console.log(`✓ OAuth routes available at /api/oauth`);
      console.log(`✓ Search routes available at /api/search`);
      console.log(`✓ Worker routes available at /api/workers`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async (): Promise<void> => {
  console.log('Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

startServer();
