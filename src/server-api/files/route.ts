import { NextRequest, NextResponse } from 'next/server';
import { prisma, serializeDriveFile } from '@/lib/prisma';
import { PaginatedFilesResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 100);
    const cursor = searchParams.get('cursor');
    const filter = searchParams.get('filter') || 'all'; // 'all' | 'image' | 'video'
    const search = searchParams.get('search') || '';

    // Build Prisma query condition
    const where: any = {
      isTrash: false,
    };

    if (filter === 'image') {
      where.mimeType = { startsWith: 'image/' };
    } else if (filter === 'video') {
      where.mimeType = { startsWith: 'video/' };
    }

    if (search.trim() !== '') {
      where.name = {
        contains: search.trim(),
      };
    }

    // Total count for stats
    const totalCount = await prisma.driveFile.count({ where });

    // Fetch items with cursor pagination
    const items = await prisma.driveFile.findMany({
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      where,
      orderBy: { createdTime: 'desc' },
    });

    let nextCursor: string | null = null;
    if (items.length > limit) {
      const nextItem = items.pop();
      nextCursor = nextItem?.id || null;
    }

    const serializedItems = items.map(serializeDriveFile);

    const response: PaginatedFilesResponse = {
      items: serializedItems,
      nextCursor,
      totalCount,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[FilesAPI] Error listing files:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list media files' },
      { status: 500 }
    );
  }
}
