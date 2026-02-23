import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import oauthRoutes from './routes/oauth';
import searchRoutes from './routes/search.routes';
import authRoutes from './routes/auth.routes';
import { createSearchesRouter } from './routes/searches.routes';
import browseRoutes from './routes/browse.routes';
import feedRoutes from './routes/feed.routes';
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

console.log('\n═══════════════════════════════════════════════════');
console.log('  eBay Helper Server Starting');
console.log('═══════════════════════════════════════════════════\n');

// Initialize Express app
const app: Express = express();
const port: number = parseInt(process.env.PORT || '10000', 10);

// Prisma will be initialized in startServer to avoid blocking
let prisma: PrismaClient;

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https://thumbs*.ebayimg.com', 'https://*.ebayimg.com', 'https://ebay.com', 'https://*.ebay.com'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", 'https://api.ebay.com', 'https://api.sandbox.ebay.com'],
      },
    },
  })
); // Security headers with CSP for external images
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

// Serve frontend static files
const frontendPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendPath));

// Root endpoint - check if requesting API or frontend
app.get('/', (_req: Request, res: Response): void => {
  // If requesting JSON (Accept header), return API info
  if (_req.accepts('application/json')) {
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
  } else {
    // Otherwise serve the frontend index.html
    res.sendFile(path.join(frontendPath, 'index.html'));
  }
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

// Browse API routes (item search)
app.use('/api/browse', browseRoutes);

// Feed routes (combined search results)
app.use('/api/feed', feedRoutes);

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

// 404 handler - serve SPA for non-API routes
app.use((req: Request, res: Response): void => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Not Found', message: `Route ${req.path} not found` });
    return;
  }

  const indexPath = path.join(frontendPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).json({ error: 'Not Found', message: `Route ${req.path} not found` });
    }
  });
});

// Start server
const startServer = async (): Promise<void> => {
  try {
    // Initialize Prisma Client
    console.log('[STARTUP] Initializing Prisma Client...');
    prisma = new PrismaClient();
    console.log('[STARTUP] Prisma Client initialized');

    // Bind to port immediately - migrations should have already run via preDeployCommand
    console.log(`[STARTUP] Attempting to bind to 0.0.0.0:${port}`);
    const server = app.listen(port, '0.0.0.0', (): void => {
      console.log(`\n✓✓✓ SERVER LISTENING ON PORT ${port} ✓✓✓`);
      console.log(`✓ Ready to accept requests on 0.0.0.0:${port}`);
      console.log(`✓ Frontend served from /`);
      console.log(`✓ API available at /api\n`);
    });

    console.log(`[STARTUP] Port binding successful`);

    // Set a timeout for any startup operations
    server.requestTimeout = 30000;

    // Initialize background workers asynchronously
    setImmediate(async () => {
      console.log('[STARTUP] Running background initialization tasks...');
      
      // Initialize background workers
      const accessToken = process.env.EBAY_ACCESS_TOKEN;
      if (!accessToken) {
        console.warn('  ⚠️  EBAY_ACCESS_TOKEN not set - background workers disabled');
      } else {
        try {
          console.log('  → Initializing background workers...');
          const { router: workerRouter, cleanup: workerCleanup } = await initializeWorkers(
            app,
            prisma,
            accessToken,
            {
              useBullMQ: process.env.USE_BULLMQ === 'true',
              cronSchedule: process.env.WORKER_SCHEDULE || '*/5 * * * *',
              sandbox: process.env.EBAY_SANDBOX === 'true',
              redisUrl: process.env.REDIS_URL,
            }
          );

          mountWorkerRoutes(app, workerRouter, '/api/workers');
          console.log('  ✓ Background workers initialized');

          if (workerCleanup) {
            process.on('SIGINT', async () => {
              console.log('Cleaning up workers...');
              await workerCleanup();
            });
          }
        } catch (error) {
          console.error('  ✗ Worker initialization failed:', error instanceof Error ? error.message : String(error));
        }
      }

      // Mount price monitoring routes
      try {
        if (process.env.EBAY_ACCESS_TOKEN) {
          app.use('/api/prices', requireAuth, createPriceMonitoringRouter(prisma, process.env.EBAY_ACCESS_TOKEN));
          console.log('  ✓ Price monitoring routes mounted');
        }
      } catch (err) {
        console.error('  ✗ Price monitoring routes failed:', err instanceof Error ? err.message : String(err));
      }

      console.log('[STARTUP] Background initialization complete');
    });

  } catch (error) {
    console.error('\n✗✗✗ CRITICAL ERROR DURING STARTUP ✗✗✗');
    console.error(error instanceof Error ? error.message : String(error));
    console.error('Stack:', error instanceof Error ? error.stack : '');
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async (): Promise<void> => {
  console.log('Shutting down gracefully...');
  if (prisma) {
    await prisma.$disconnect();
  }
  process.exit(0);
});

startServer();
