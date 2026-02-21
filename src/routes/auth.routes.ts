import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.middleware';
const bcrypt: any = require('bcrypt');
const jwt: any = require('jsonwebtoken');

const prisma = new PrismaClient();
const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

interface RegisterBody {
  email: string;
  password: string;
  username?: string;
}

interface LoginBody {
  email: string;
  password: string;
}

function signToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response): Promise<any> => {
  try {
    const body = req.body as RegisterBody;
    if (!body.email || !body.password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const existing = await (prisma.user as any).findUnique({ where: { email: body.email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const hash = await bcrypt.hash(body.password, SALT_ROUNDS);

    const user = await (prisma.user as any).create({
      data: {
        email: body.email,
        passwordHash: hash,
        username: body.username,
      },
      select: { id: true, email: true, username: true },
    });

    const token = signToken({ userId: user.id });

    res.status(201).json({ token, user });
  } catch (error) {
    console.error('[auth] register error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<any> => {
  try {
    const body = req.body as LoginBody;
    if (!body.email || !body.password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await (prisma.user as any).findUnique({ where: { email: body.email } });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken({ userId: user.id });

    res.json({ token, user: { id: user.id, email: user.email, username: user.username } });
  } catch (error) {
    console.error('[auth] login error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me - get current user from token
router.get('/me', requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await (prisma.user as any).findUnique({
      where: { id: userId },
      select: { id: true, email: true, username: true, ebayAccessToken: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ 
      user: { 
        id: user.id, 
        email: user.email, 
        username: user.username,
        ebayLinked: !!user.ebayAccessToken 
      } 
    });
  } catch (error) {
    console.error('[auth] me error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
