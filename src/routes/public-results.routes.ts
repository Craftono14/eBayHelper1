import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { verifyPublicResultsToken } from '../utils/public-results-token';
import { getPublicResultsSnapshot } from '../utils/public-results-store';

const router = Router();
const prisma = new PrismaClient();

// GET /api/public/new-results/:token - Public endpoint for shareable multi-item notification links
router.get('/new-results/:token', async (req: Request, res: Response): Promise<void> => {
  const token = req.params.token;

  // Preferred path: short in-memory snapshot IDs for Pushover-safe URL length.
  const snapshot = await getPublicResultsSnapshot(prisma, token);
  if (snapshot) {
    res.json({
      searchName: snapshot.searchName,
      items: snapshot.items,
      createdAt: snapshot.createdAt.toISOString(),
      expiresAt: snapshot.expiresAt.toISOString(),
    });
    return;
  }

  // Backward compatibility: old signed token links.
  try {
    const payload = verifyPublicResultsToken(token);

    res.json({
      searchName: payload.searchName,
      items: payload.items,
      createdAt: new Date(payload.iat * 1000).toISOString(),
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid link';
    const statusCode = message.includes('expired') ? 410 : 400;

    res.status(statusCode).json({
      error: 'Invalid or expired results link',
      message,
    });
  }
});

export default router;
