import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PublicResultItem } from './public-results-token';

interface PublicResultsSnapshot {
  searchName: string;
  items: PublicResultItem[];
  createdAt: Date;
  expiresAt: Date;
}

const snapshots = new Map<string, PublicResultsSnapshot>();

function cleanupExpiredSnapshots(): void {
  const now = Date.now();
  for (const [id, snapshot] of snapshots.entries()) {
    if (snapshot.expiresAt.getTime() <= now) {
      snapshots.delete(id);
    }
  }
}

function generateSnapshotId(): string {
  return crypto.randomBytes(9).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function createPublicResultsSnapshot(
  prisma: PrismaClient,
  input: {
  searchName: string;
  items: PublicResultItem[];
  ttlSeconds?: number;
}
): Promise<string> {
  cleanupExpiredSnapshots();

  const now = new Date();
  const ttlMs = (input.ttlSeconds ?? 60 * 60 * 24 * 7) * 1000;
  const expiresAt = new Date(now.getTime() + ttlMs);
  const id = generateSnapshotId();

  const snapshot = {
    searchName: input.searchName,
    items: input.items,
    createdAt: now,
    expiresAt,
  };

  try {
    await (prisma as any).publicResultsSnapshot.create({
      data: {
        id,
        searchName: snapshot.searchName,
        items: snapshot.items,
        expiresAt: snapshot.expiresAt,
      },
    });
  } catch (error) {
    // Fallback keeps behavior working if migration isn't applied yet.
    console.warn('[publicResultsStore] Failed to persist snapshot to database, using in-memory fallback', error);
    snapshots.set(id, snapshot);
  }

  return id;
}

export async function getPublicResultsSnapshot(
  prisma: PrismaClient,
  id: string
): Promise<PublicResultsSnapshot | null> {
  cleanupExpiredSnapshots();

  try {
    const dbSnapshot = await (prisma as any).publicResultsSnapshot.findUnique({
      where: { id },
    });

    if (dbSnapshot) {
      const expiresAt = new Date(dbSnapshot.expiresAt);
      if (expiresAt.getTime() <= Date.now()) {
        await (prisma as any).publicResultsSnapshot.delete({ where: { id } }).catch(() => undefined);
        return null;
      }

      return {
        searchName: dbSnapshot.searchName,
        items: dbSnapshot.items as PublicResultItem[],
        createdAt: new Date(dbSnapshot.createdAt),
        expiresAt,
      };
    }
  } catch {
    // Ignore and check in-memory fallback.
  }

  const snapshot = snapshots.get(id);
  if (!snapshot) {
    return null;
  }

  if (snapshot.expiresAt.getTime() <= Date.now()) {
    snapshots.delete(id);
    return null;
  }

  return snapshot;
}
