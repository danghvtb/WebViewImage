import { PrismaClient } from '@prisma/client';
import { DriveMediaItem } from './types';

// Monkey patch BigInt for JSON.stringify safety across all Next.js API responses
declare global {
  interface BigInt {
    toJSON(): number;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (!(BigInt.prototype as any).toJSON) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (BigInt.prototype as any).toJSON = function () {
    return Number(this);
  };
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Safely serialize Prisma DriveFile model to client-safe DriveMediaItem
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeDriveFile(file: any): DriveMediaItem {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: Number(file.size ?? 0),
    thumbnailUrl: file.thumbnailUrl,
    createdTime: file.createdTime instanceof Date ? file.createdTime.toISOString() : String(file.createdTime),
    modifiedTime: file.modifiedTime instanceof Date ? file.modifiedTime.toISOString() : String(file.modifiedTime),
    width: file.width ?? null,
    height: file.height ?? null,
    durationMillis: file.durationMillis ? Number(file.durationMillis) : null,
    isTrash: Boolean(file.isTrash),
    driveFolderId: file.driveFolderId,
    createdAt: file.createdAt instanceof Date ? file.createdAt.toISOString() : String(file.createdAt),
    updatedAt: file.updatedAt instanceof Date ? file.updatedAt.toISOString() : String(file.updatedAt),
  };
}
