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

    const fileRecord = await prisma.driveFile.findUnique({
      where: { id: fileId },
    });

    if (!fileRecord || fileRecord.isTrash) {
      return NextResponse.json({ error: 'File not found or trashed' }, { status: 404 });
    }

    const driveRes = await getDriveFileMediaStream(fileId);
    const nodeStream = driveRes.data as unknown as Readable;
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    const safeFilename = encodeURIComponent(fileRecord.name);

    return new Response(webStream, {
      status: 200,
      headers: {
        'Content-Type': fileRecord.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileRecord.name}"; filename*=UTF-8''${safeFilename}`,
        'Content-Length': String(Number(fileRecord.size)),
      },
    });
  } catch (error: any) {
    console.error('[DownloadAPI] Error downloading original file:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to download original file' },
      { status: 500 }
    );
  }
}
