import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getDriveFileMediaStream } from '@/lib/drive';
import { Readable } from 'stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
  params: {
    fileId: string;
  };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const fileId = params.fileId;
    if (!fileId) {
      return NextResponse.json({ error: 'File ID is required' }, { status: 400 });
    }

    // 1. Retrieve file metadata from Prisma DB (Zero API quota for metadata check)
    const fileRecord = await prisma.driveFile.findUnique({
      where: { id: fileId },
    });

    if (!fileRecord || fileRecord.isTrash) {
      return NextResponse.json({ error: 'File not found or trashed' }, { status: 404 });
    }

    const fileSize = Number(fileRecord.size);
    const mimeType = fileRecord.mimeType || 'video/mp4';
    const rangeHeader = request.headers.get('range');

    // 2. Handle HTTP Range Request
    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      // If end is not specified, default to start + 5MB or EOF to avoid loading too much at once
      const end = parts[1]
        ? parseInt(parts[1], 10)
        : Math.min(start + 5 * 1024 * 1024 - 1, fileSize - 1);

      if (isNaN(start) || start >= fileSize || (parts[1] && end < start)) {
        return new NextResponse(null, {
          status: 416, // Range Not Satisfiable
          headers: {
            'Content-Range': `bytes */${fileSize}`,
          },
        });
      }

      const chunkSize = end - start + 1;
      const targetRange = `bytes=${start}-${end}`;

      // 3. Request partial stream from Google Drive
      const driveRes = await getDriveFileMediaStream(fileId, targetRange);
      const nodeStream = driveRes.data as unknown as Readable;

      // Convert Node.js stream to Web ReadableStream without buffering entire chunk in RAM
      const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

      return new Response(webStream, {
        status: 206, // HTTP 206 Partial Content
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // 3. Fallback: Full content request
    const driveRes = await getDriveFileMediaStream(fileId);
    const nodeStream = driveRes.data as unknown as Readable;
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    return new Response(webStream, {
      status: 200,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(fileSize),
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('[StreamAPI] Error streaming video:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to stream video' },
      { status: error.status || 500 }
    );
  }
}
