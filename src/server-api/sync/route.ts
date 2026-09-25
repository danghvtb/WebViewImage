import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getGoogleDriveClient, getTargetFolderId } from '@/lib/drive';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const folderId = getTargetFolderId();
    const drive = await getGoogleDriveClient();

    // Check if client requested a force full resync
    const { searchParams } = new URL(request.url);
    const forceFullSync = searchParams.get('force') === 'true';

    // 1. Check existing SyncState
    const syncState = await prisma.syncState.findFirst({
      orderBy: { id: 'desc' },
    });

    let filesAddedOrUpdated = 0;
    let filesDeleted = 0;
    let newStartToken: string | null = null;

    if (!syncState?.startPageToken || forceFullSync) {
      // FULL INITIAL SYNC: Scan the entire Google Drive Folder
      console.log(`[SyncAPI] Performing full initial sync for folder: ${folderId}`);
      let pageToken: string | undefined = undefined;

      do {
        const res: any = await drive.files.list({
          q: `'${folderId}' in parents and trashed = false`,
          fields:
            'nextPageToken, files(id, name, mimeType, size, thumbnailLink, createdTime, modifiedTime, imageMediaMetadata, videoMediaMetadata, trashed, parents)',
          pageSize: 100,
          pageToken,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });

        const files = res.data.files || [];
        for (const file of files) {
          if (!file.id || !file.name) continue;

          const createdTime = file.createdTime ? new Date(file.createdTime) : new Date();
          const modifiedTime = file.modifiedTime ? new Date(file.modifiedTime) : new Date();
          const width =
            file.imageMediaMetadata?.width || file.videoMediaMetadata?.width || null;
          const height =
            file.imageMediaMetadata?.height || file.videoMediaMetadata?.height || null;
          const durationMillis = file.videoMediaMetadata?.durationMillis
            ? BigInt(file.videoMediaMetadata.durationMillis)
            : null;

          await prisma.driveFile.upsert({
            where: { id: file.id },
            create: {
              id: file.id,
              name: file.name,
              mimeType: file.mimeType || 'application/octet-stream',
              size: BigInt(file.size || 0),
              thumbnailUrl: file.thumbnailLink || null,
              createdTime,
              modifiedTime,
              width,
              height,
              durationMillis,
              isTrash: false,
              driveFolderId: folderId,
            },
            update: {
              name: file.name,
              mimeType: file.mimeType || 'application/octet-stream',
              size: BigInt(file.size || 0),
              thumbnailUrl: file.thumbnailLink || undefined,
              modifiedTime,
              width,
              height,
              durationMillis,
              isTrash: false,
            },
          });
          filesAddedOrUpdated++;
        }

        pageToken = res.data.nextPageToken || undefined;
      } while (pageToken);

      // Fetch and save startPageToken for subsequent delta syncs
      const tokenRes = await drive.changes.getStartPageToken({
        supportsAllDrives: true,
      });
      newStartToken = tokenRes.data.startPageToken || null;

      if (syncState) {
        await prisma.syncState.update({
          where: { id: syncState.id },
          data: {
            startPageToken: newStartToken,
            lastSyncAt: new Date(),
          },
        });
      } else {
        await prisma.syncState.create({
          data: {
            startPageToken: newStartToken,
            lastSyncAt: new Date(),
          },
        });
      }
    } else {
      // DELTA SYNC: Using drive.changes.list
      console.log(`[SyncAPI] Performing delta sync with token: ${syncState.startPageToken}`);
      let pageToken: string | undefined = syncState.startPageToken;

      while (pageToken) {
        const res: any = await drive.changes.list({
          pageToken,
          fields:
            'nextPageToken, newStartPageToken, changes(fileId, removed, file(id, name, mimeType, size, thumbnailLink, createdTime, modifiedTime, imageMediaMetadata, videoMediaMetadata, trashed, parents))',
          pageSize: 100,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });

        const changes = res.data.changes || [];
        for (const change of changes) {
          const fileId = change.fileId;
          if (!fileId) continue;

          // If removed or moved to trash
          if (change.removed || change.file?.trashed) {
            await prisma.driveFile.updateMany({
              where: { id: fileId },
              data: { isTrash: true },
            });
            filesDeleted++;
            continue;
          }

          const file = change.file;
          if (!file || !file.name) continue;

          // Check if file is in target folder
          const inTargetFolder = file.parents && file.parents.includes(folderId);
          if (!inTargetFolder) {
            // File might have been moved out of folder
            await prisma.driveFile.updateMany({
              where: { id: fileId },
              data: { isTrash: true },
            });
            continue;
          }

          const createdTime = file.createdTime ? new Date(file.createdTime) : new Date();
          const modifiedTime = file.modifiedTime ? new Date(file.modifiedTime) : new Date();
          const width =
            file.imageMediaMetadata?.width || file.videoMediaMetadata?.width || null;
          const height =
            file.imageMediaMetadata?.height || file.videoMediaMetadata?.height || null;
          const durationMillis = file.videoMediaMetadata?.durationMillis
            ? BigInt(file.videoMediaMetadata.durationMillis)
            : null;

          await prisma.driveFile.upsert({
            where: { id: fileId },
            create: {
              id: fileId,
              name: file.name,
              mimeType: file.mimeType || 'application/octet-stream',
              size: BigInt(file.size || 0),
              thumbnailUrl: file.thumbnailLink || null,
              createdTime,
              modifiedTime,
              width,
              height,
              durationMillis,
              isTrash: false,
              driveFolderId: folderId,
            },
            update: {
              name: file.name,
              mimeType: file.mimeType || 'application/octet-stream',
              size: BigInt(file.size || 0),
              thumbnailUrl: file.thumbnailLink || undefined,
              modifiedTime,
              width,
              height,
              durationMillis,
              isTrash: false,
            },
          });
          filesAddedOrUpdated++;
        }

        if (res.data.newStartPageToken) {
          newStartToken = res.data.newStartPageToken;
          break;
        }

        pageToken = res.data.nextPageToken || undefined;
      }

      if (newStartToken) {
        await prisma.syncState.update({
          where: { id: syncState.id },
          data: {
            startPageToken: newStartToken,
            lastSyncAt: new Date(),
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Synchronization finished successfully',
      filesAddedOrUpdated,
      filesDeleted,
      newStartPageToken: newStartToken,
      syncedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[SyncAPI] Sync error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to sync with Google Drive',
      },
      { status: 500 }
    );
  }
}
