import { Router, Request, Response } from 'express';
import { verifyPublicResultsToken } from '../utils/public-results-token';

const router = Router();

// GET /api/public/new-results/:token - Public endpoint for shareable multi-item notification links
router.get('/new-results/:token', (req: Request, res: Response): void => {
  try {
    const token = req.params.token;
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
