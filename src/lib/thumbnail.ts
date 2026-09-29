/**
 * Dynamic Thumbnail CDN utility for Google Drive media
 * Optimizes thumbnail loading directly via Google's lh3.googleusercontent.com CDN
 * completely bypassing Google Drive API download quotas.
 */

export function transformGoogleThumbnail(
  originalUrl: string | null | undefined,
  fileId: string,
  params: string
): string {
  if (!originalUrl || originalUrl.trim() === '') {
    // Fallback to Google CDN direct fileId link
    return `https://lh3.googleusercontent.com/d/${fileId}=${params}`;
  }

  // If the URL contains Google parameter like =s220, =s0, replace it
  if (originalUrl.includes('=')) {
    return originalUrl.replace(/=[^=]*$/, `=${params}`);
  }

  return `${originalUrl}=${params}`;
}

/**
 * Returns optimized thumbnail for Grid view (e.g. 400x400 cropped)
 */
export function getGridThumbnailUrl(
  originalUrl: string | null | undefined,
  fileId: string,
  width = 400,
  height = 400
): string {
  return transformGoogleThumbnail(originalUrl, fileId, `w${width}-h${height}-c`);
}

/**
 * Returns high-resolution preview URL for Lightbox (e.g. max width 2048px)
 */
export function getLightboxPreviewUrl(
  originalUrl: string | null | undefined,
  fileId: string,
  maxWidth = 2048
): string {
  return transformGoogleThumbnail(originalUrl, fileId, `w${maxWidth}`);
}

/**
 * Returns Google Drive preview embed URL for video streaming in iframe
 */
export function getVideoStreamingUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

/**
 * Returns direct download URL for original file from Google Drive
 */
export function getOriginalDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

/**
 * Returns Google Drive web view URL
 */
export function getGoogleDriveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/**
 * Format bytes to readable string (e.g., 14.5 MB)
 */
export function formatBytes(bytes: number | bigint, decimals = 1): string {
  const num = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (!+num) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(num) / Math.log(k));
  return `${parseFloat((num / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Format milliseconds to duration (MM:SS or HH:MM:SS)
 */
export function formatDuration(durationMillis: number | bigint | null | undefined): string {
  if (!durationMillis) return '';
  const totalSeconds = Math.floor((typeof durationMillis === 'bigint' ? Number(durationMillis) : durationMillis) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
