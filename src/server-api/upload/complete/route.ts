import { NextRequest, NextResponse } from 'next/server';
import { prisma, serializeDriveFile } from '@/lib/prisma';
import { getGoogleDriveClient, getTargetFolderId } from '@/lib/drive';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileId, fileName, fileSize, mimeType, folderId } = body;

    if (!fileId) {
      return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
    }

    const driveFolderId = folderId || getTargetFolderId();

    // Query Google Drive to get rich metadata (thumbnailLink, dimensions, duration)
    let driveFileMeta: any = null;
    try {
      const drive = await getGoogleDriveClient();
      const metaRes = await drive.files.get({
        fileId,
        fields:
          'id, name, mimeType, size, thumbnailLink, createdTime, modifiedTime, imageMediaMetadata, videoMediaMetadata, trashed, parents',
        supportsAllDrives: true,
      });
      driveFileMeta = metaRes.data;
    } catch (err: any) {
      console.warn('[UploadCompleteAPI] Warning: could not fetch drive file details:', err.message);
    }

    const now = new Date();
    const record = await prisma.driveFile.upsert({
      where: { id: fileId },
      create: {
        id: fileId,
        name: driveFileMeta?.name || fileName || 'Untitled',
        mimeType: driveFileMeta?.mimeType || mimeType || 'application/octet-stream',
        size: BigInt(driveFileMeta?.size || fileSize || 0),
        thumbnailUrl: driveFileMeta?.thumbnailLink || null,
        createdTime: driveFileMeta?.createdTime ? new Date(driveFileMeta.createdTime) : now,
        modifiedTime: driveFileMeta?.modifiedTime ? new Date(driveFileMeta.modifiedTime) : now,
        width: driveFileMeta?.imageMediaMetadata?.width || driveFileMeta?.videoMediaMetadata?.width || null,
        height: driveFileMeta?.imageMediaMetadata?.height || driveFileMeta?.videoMediaMetadata?.height || null,
        durationMillis: driveFileMeta?.videoMediaMetadata?.durationMillis
          ? BigInt(driveFileMeta.videoMediaMetadata.durationMillis)
          : null,
        isTrash: false,
        driveFolderId,
      },
      update: {
        name: driveFileMeta?.name || fileName || undefined,
        mimeType: driveFileMeta?.mimeType || mimeType || undefined,
        size: driveFileMeta?.size ? BigInt(driveFileMeta.size) : undefined,
        thumbnailUrl: driveFileMeta?.thumbnailLink || undefined,
        modifiedTime: now,
        width: driveFileMeta?.imageMediaMetadata?.width || driveFileMeta?.videoMediaMetadata?.width || undefined,
        height: driveFileMeta?.imageMediaMetadata?.height || driveFileMeta?.videoMediaMetadata?.height || undefined,
        durationMillis: driveFileMeta?.videoMediaMetadata?.durationMillis
          ? BigInt(driveFileMeta.videoMediaMetadata.durationMillis)
          : undefined,
        isTrash: false,
      },
    });

    return NextResponse.json({
      success: true,
      file: serializeDriveFile(record),
    });
  } catch (error: any) {
    console.error('[UploadCompleteAPI] Error registering completed upload:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to complete upload registration' },
      { status: 500 }
    );
  }
}
