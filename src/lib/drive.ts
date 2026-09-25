import { google, drive_v3 } from 'googleapis';
import { JWT, OAuth2Client } from 'google-auth-library';

let cachedDriveClient: drive_v3.Drive | null = null;
let cachedAuth: JWT | OAuth2Client | null = null;

/**
 * Initializes and returns an authenticated Google Drive API Client (v3)
 * Supports either Service Account credentials or OAuth2 Refresh Token.
 */
export async function getGoogleAuth(): Promise<JWT | OAuth2Client> {
  if (cachedAuth) {
    return cachedAuth;
  }

  // 1. Try Service Account Key
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountKey && serviceAccountKey.trim() !== '') {
    try {
      let parsedKey: any;
      const trimmed = serviceAccountKey.trim();
      if (trimmed.startsWith('{')) {
        parsedKey = JSON.parse(trimmed);
      } else {
        // Try decoding base64
        const decoded = Buffer.from(trimmed, 'base64').toString('utf-8');
        parsedKey = JSON.parse(decoded);
      }

      const jwtClient = new google.auth.JWT({
        email: parsedKey.client_email,
        key: parsedKey.private_key,
        scopes: [
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/drive.readonly',
        ],
      });

      await jwtClient.authorize();
      cachedAuth = jwtClient;
      return cachedAuth;
    } catch (err: any) {
      console.error('[GoogleAuth] Failed to parse Service Account Key:', err.message);
    }
  }

  // 2. Try OAuth2 Refresh Token
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (clientId && clientSecret && refreshToken) {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });
    cachedAuth = oauth2Client;
    return cachedAuth;
  }

  throw new Error(
    'Missing Google Drive credentials. Please provide GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN in your environment.'
  );
}

/**
 * Returns authenticated Google Drive v3 client singleton
 */
export async function getGoogleDriveClient(): Promise<drive_v3.Drive> {
  if (cachedDriveClient) {
    return cachedDriveClient;
  }

  const auth = await getGoogleAuth();
  cachedDriveClient = google.drive({ version: 'v3', auth });
  return cachedDriveClient;
}

/**
 * Get configured target folder ID
 */
export function getTargetFolderId(): string {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId || folderId.trim() === '') {
    throw new Error('GOOGLE_DRIVE_FOLDER_ID is not configured in environment.');
  }
  return folderId.trim();
}

/**
 * Initiate Resumable Upload Session directly with Google Drive API
 * Returns the resumable session URI (uploadUrl)
 */
export async function createResumableUploadSession(params: {
  fileName: string;
  fileSize: number;
  mimeType: string;
  folderId?: string;
}): Promise<string> {
  const auth = await getGoogleAuth();
  const tokenResponse = await auth.getAccessToken();
  const accessToken = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse.token;

  if (!accessToken) {
    throw new Error('Could not obtain Google Drive access token for upload session.');
  }

  const folderId = params.folderId || getTargetFolderId();

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': params.mimeType,
        'X-Upload-Content-Length': String(params.fileSize),
      },
      body: JSON.stringify({
        name: params.fileName,
        parents: [folderId],
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Drive Resumable Init failed: ${response.status} ${errorText}`);
  }

  const uploadUrl = response.headers.get('location');
  if (!uploadUrl) {
    throw new Error('Google Drive did not return a Location header for resumable upload.');
  }

  return uploadUrl;
}

/**
 * Fetch video/image media stream with optional HTTP Range header
 */
export async function getDriveFileMediaStream(fileId: string, range?: string) {
  const drive = await getGoogleDriveClient();
  const headers: Record<string, string> = {};
  if (range) {
    headers['Range'] = range;
  }

  const res = await drive.files.get(
    {
      fileId,
      alt: 'media',
      supportsAllDrives: true,
    },
    {
      responseType: 'stream',
      headers,
    }
  );

  return res;
}
