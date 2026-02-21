import { Request, Response, NextFunction } from 'express';
const jwt: any = require('jsonwebtoken');
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

export interface AuthRequest extends Request {
  user?: any;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<any> {
  try {
    const authHeader = req.headers.authorization || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    
    // Also check query parameter for OAuth flows
    if (!token && req.query.token) {
      token = req.query.token as string;
    }
    
    if (!token) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    let payload: any;
    try {
      payload = jwt.verify(token, JWT_SECRET) as any;
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (!payload || !payload.userId) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    return next();
  } catch (error) {
    console.error('[auth] middleware error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return next();

  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload && payload.userId) {
      // attach minimal info
      req.user = { id: payload.userId };
    }
  } catch (err) {
    // ignore invalid token for optional auth
  }
  return next();
}
