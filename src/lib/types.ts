export interface DriveMediaItem {
  id: string;
  name: string;
  mimeType: string;
  size: number; // Serialized from BigInt
  thumbnailUrl: string | null;
  createdTime: string; // ISO date string
  modifiedTime: string;
  width: number | null;
  height: number | null;
  durationMillis: number | null;
  isTrash: boolean;
  driveFolderId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedFilesResponse {
  items: DriveMediaItem[];
  nextCursor?: string | null;
  totalCount: number;
}

export interface SyncResult {
  success: boolean;
  message: string;
  filesAddedOrUpdated: number;
  filesDeleted: number;
  newStartPageToken?: string | null;
  syncedAt: string;
}

export interface UploadSessionResponse {
  uploadUrl: string;
  fileId?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface TimelineGroup {
  yearMonth: string; // Format: "YYYY-MM"
  label: string;     // e.g. "Tháng 09, 2026"
  count: number;
  firstIndex: number;
}
