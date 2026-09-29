import { DriveMediaItem } from './types';
import { DriveFolder, localDB } from './indexed-db';

const APP_ROOT_FOLDER_NAME = 'DriveStream Media';

/**
 * Searches for or creates the dedicated root folder in user's Google Drive.
 * "Sau khi đăng nhập sẽ tạo 1 folder riêng để đẩy ảnh lên, tài khoản tạo rồi thì sẽ k cần tạo lại."
 */
export async function getOrCreateAppRootFolder(accessToken: string): Promise<DriveFolder> {
  // 1. Check local cache first
  const cachedRootId = await localDB.getMetadata<string>('app_root_folder_id');
  if (cachedRootId) {
    try {
      const verifyRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${cachedRootId}?fields=id,name,trashed`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (verifyRes.ok) {
        const data = await verifyRes.json();
        if (!data.trashed) {
          return { id: data.id, name: data.name, parentId: 'root' };
        }
      }
    } catch {
      // Continue to query
    }
  }

  // 2. Query Google Drive for existing root folder
  const query = encodeURIComponent(
    `name = '${APP_ROOT_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and 'root' in parents`
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&spaces=drive`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!searchRes.ok) {
    const errText = await searchRes.text();
    throw new Error(`Failed to query Google Drive folder: ${searchRes.status} ${errText}`);
  }

  const searchData = await searchRes.json();
  const existingFolder = searchData.files?.[0];

  if (existingFolder) {
    await localDB.setMetadata('app_root_folder_id', existingFolder.id);
    return {
      id: existingFolder.id,
      name: existingFolder.name,
      parentId: 'root',
    };
  }

  // 3. Create new root folder if not exists
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: APP_ROOT_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['root'],
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create root folder: ${createRes.status} ${errText}`);
  }

  const createdData = await createRes.json();
  await localDB.setMetadata('app_root_folder_id', createdData.id);

  return {
    id: createdData.id,
    name: createdData.name,
    parentId: 'root',
  };
}

/**
 * Creates a subfolder inside a given parent folder
 */
export async function createDriveSubFolder(
  name: string,
  parentId: string,
  accessToken: string
): Promise<DriveFolder> {
  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: name.trim(),
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create subfolder: ${res.status} ${errText}`);
  }

  const folderData = await res.json();
  const folder: DriveFolder = {
    id: folderData.id,
    name: folderData.name,
    parentId,
    createdTime: folderData.createdTime || new Date().toISOString(),
  };

  await localDB.saveFolders([folder]);
  return folder;
}

/**
 * Lists subfolders inside a given folder
 */
export async function listDriveSubFolders(
  parentId: string,
  accessToken: string
): Promise<DriveFolder[]> {
  const query = encodeURIComponent(
    `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,createdTime)&orderBy=name`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    throw new Error(`Failed to list subfolders: ${res.statusText}`);
  }

  const data = await res.json();
  const folders: DriveFolder[] = (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    parentId,
    createdTime: f.createdTime,
  }));

  await localDB.saveFolders(folders);
  return folders;
}

/**
 * Lists media files inside a given folder with caching into IndexedDB
 */
export async function listDriveFolderMedia(
  folderId: string,
  accessToken: string
): Promise<DriveMediaItem[]> {
  const query = encodeURIComponent(
    `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`
  );

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,size,thumbnailLink,createdTime,modifiedTime,imageMediaMetadata,videoMediaMetadata)&pageSize=100&orderBy=createdTime desc`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch media files: ${res.statusText}`);
  }

  const data = await res.json();
  const files: DriveMediaItem[] = (data.files || []).map((file: any) => ({
    id: file.id,
    name: file.name,
    mimeType: file.mimeType || 'application/octet-stream',
    size: Number(file.size || 0),
    thumbnailUrl: file.thumbnailLink || null,
    createdTime: file.createdTime || new Date().toISOString(),
    modifiedTime: file.modifiedTime || new Date().toISOString(),
    width: file.imageMediaMetadata?.width || file.videoMediaMetadata?.width || null,
    height: file.imageMediaMetadata?.height || file.videoMediaMetadata?.height || null,
    durationMillis: file.videoMediaMetadata?.durationMillis
      ? Number(file.videoMediaMetadata.durationMillis)
      : null,
    isTrash: false,
    driveFolderId: folderId,
    createdAt: file.createdTime || new Date().toISOString(),
    updatedAt: file.modifiedTime || new Date().toISOString(),
  }));

  await localDB.saveFiles(files);
  return files;
}

/**
 * Initiate Resumable Upload Session directly from browser with Google Drive API
 */
export async function initClientResumableUpload(
  fileName: string,
  fileSize: number,
  mimeType: string,
  folderId: string,
  accessToken: string
): Promise<string> {
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(fileSize),
      },
      body: JSON.stringify({
        name: fileName,
        parents: [folderId],
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to start upload session: ${res.status} ${errText}`);
  }

  const uploadUrl = res.headers.get('location');
  if (!uploadUrl) {
    throw new Error('Google Drive API did not return location header for resumable upload');
  }

  return uploadUrl;
}

/**
 * Delete file from Google Drive and local IndexedDB cache
 */
export async function deleteDriveFile(fileId: string, accessToken: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok && res.status !== 404) {
    const errText = await res.text();
    throw new Error(`Xóa file thất bại (${res.status}): ${errText}`);
  }

  // Remove from local IndexedDB
  await localDB.deleteFile(fileId);
}

/**
 * Move multiple files from source folder to target folder in Google Drive and IndexedDB
 */
export async function moveDriveFiles(
  fileIds: string[],
  sourceFolderId: string,
  targetFolderId: string,
  accessToken: string
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const fileId of fileIds) {
    try {
      const url = `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${targetFolderId}&removeParents=${sourceFolderId}&enforceSingleParent=true`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (res.ok) {
        success++;
        // Update local IndexedDB cache: change driveFolderId
        try {
          const cachedFiles = await localDB.getCachedFiles(sourceFolderId);
          const targetItem = cachedFiles.find((f) => f.id === fileId);
          if (targetItem) {
            await localDB.deleteFile(fileId);
            await localDB.saveFiles([{ ...targetItem, driveFolderId: targetFolderId }]);
          }
        } catch {
          // ignore cache error
        }
      } else {
        failed++;
        console.error(`Failed to move file ${fileId}:`, await res.text());
      }
    } catch (err) {
      failed++;
      console.error(`Error moving file ${fileId}:`, err);
    }
  }

  return { success, failed };
}

/**
 * Batch delete multiple files from Google Drive and local IndexedDB
 */
export async function batchDeleteDriveFiles(
  fileIds: string[],
  accessToken: string
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const fileId of fileIds) {
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (res.ok || res.status === 404) {
        success++;
        await localDB.deleteFile(fileId);
      } else {
        failed++;
        console.error(`Failed to delete file ${fileId}:`, await res.text());
      }
    } catch (err) {
      failed++;
      console.error(`Error deleting file ${fileId}:`, err);
    }
  }

  return { success, failed };
}

/**
 * Recursively fetch all subfolders under root folder to display in folder destination picker
 */
export async function fetchAllFoldersUnderRoot(
  rootFolderId: string,
  rootFolderName: string,
  accessToken: string
): Promise<DriveFolder[]> {
  const folders: DriveFolder[] = [
    { id: rootFolderId, name: rootFolderName, parentId: 'root' },
  ];

  async function crawl(parentId: string) {
    const subs = await listDriveSubFolders(parentId, accessToken);
    for (const sub of subs) {
      folders.push(sub);
      await crawl(sub.id);
    }
  }

  try {
    await crawl(rootFolderId);
  } catch (err) {
    console.warn('[FetchFolders] Crawl error:', err);
  }

  return folders;
}

/**
 * Ensures a file or folder has reader permission for anyone with link,
 * enabling seamless Google Drive preview iframe streaming without cookie blocks.
 */
export async function makeFolderOrFilePublic(
  fileId: string,
  accessToken: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone',
        }),
      }
    );
    return res.ok;
  } catch (err) {
    console.warn('[Permissions] Failed to set public reader permission:', err);
    return false;
  }
}

/**
 * Downloads a file directly via authenticated Google Drive API (alt=media)
 * or falls back to Google Drive direct download URL.
 */
export async function downloadDriveFile(
  fileId: string,
  fileName: string,
  accessToken?: string | null
): Promise<void> {
  if (accessToken) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 15000);
        return;
      }
    } catch (err) {
      console.warn('[Download] Direct API download failed, falling back to export link:', err);
    }
  }

  // Fallback direct download link
  const link = document.createElement('a');
  link.href = `https://drive.google.com/uc?export=download&id=${fileId}`;
  link.target = '_blank';
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

