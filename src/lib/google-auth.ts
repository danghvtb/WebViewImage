export interface GoogleUserProfile {
  id: string;
  name: string;
  email: string;
  picture: string;
}

declare global {
  interface Window {
    google?: any;
  }
}

const GIS_SCRIPT_ID = 'google-gis-script';
const STORAGE_ACCESS_TOKEN = 'drivestream_access_token';
const STORAGE_TOKEN_EXPIRES = 'drivestream_token_expires';
const STORAGE_USER_PROFILE = 'drivestream_user_profile';
const STORAGE_CLIENT_ID = 'drivestream_client_id';

/**
 * Loads the Google Identity Services JavaScript library
 */
export function loadGoogleGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return resolve();

    if (window.google?.accounts?.oauth2) {
      return resolve();
    }

    if (document.getElementById(GIS_SCRIPT_ID)) {
      const checkInterval = setInterval(() => {
        if (window.google?.accounts?.oauth2) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      return;
    }

    const script = document.createElement('script');
    script.id = GIS_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      resolve();
    };
    script.onerror = () => {
      reject(new Error('Failed to load Google Identity Services SDK'));
    };
    document.head.appendChild(script);
  });
}

export const DEFAULT_CLIENT_ID =
  '712903856977-dvhaqpv7ut13fvvp2srh0qfi4ej2nl8j.apps.googleusercontent.com';

/**
 * Get configured Google OAuth Client ID
 */
export function getSavedClientId(): string {
  if (typeof window === 'undefined') return DEFAULT_CLIENT_ID;
  return (
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    localStorage.getItem(STORAGE_CLIENT_ID) ||
    DEFAULT_CLIENT_ID
  );
}

/**
 * Save custom Client ID to localStorage
 */
export function saveClientId(clientId: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_CLIENT_ID, clientId.trim());
  }
}

/**
 * Get active valid Access Token
 */
export function getSavedAccessToken(): string | null {
  if (typeof window === 'undefined') return null;

  const token = localStorage.getItem(STORAGE_ACCESS_TOKEN);
  const expires = localStorage.getItem(STORAGE_TOKEN_EXPIRES);

  if (!token || !expires) return null;

  // Check if token has expired (with 60s buffer)
  if (Date.now() > parseInt(expires, 10) - 60000) {
    localStorage.removeItem(STORAGE_ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_TOKEN_EXPIRES);
    return null;
  }

  return token;
}

/**
 * Get saved User Profile
 */
export function getSavedUserProfile(): GoogleUserProfile | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_USER_PROFILE);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Fetch user info from Google OAuth2 userinfo endpoint
 */
export async function fetchGoogleUserProfile(accessToken: string): Promise<GoogleUserProfile> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch Google user profile');
  }

  const data = await res.json();
  const profile: GoogleUserProfile = {
    id: data.sub,
    name: data.name || data.email,
    email: data.email,
    picture: data.picture || '',
  };

  localStorage.setItem(STORAGE_USER_PROFILE, JSON.stringify(profile));
  return profile;
}

/**
 * Request Access Token via Google OAuth popup
 */
export async function requestGoogleAccessToken(clientId?: string): Promise<{
  accessToken: string;
  expiresIn: number;
  profile: GoogleUserProfile;
}> {
  await loadGoogleGisScript();

  const finalClientId = clientId || getSavedClientId();
  if (!finalClientId) {
    throw new Error('MISSING_CLIENT_ID');
  }

  return new Promise((resolve, reject) => {
    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: finalClientId,
        scope:
          'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
        callback: async (tokenResponse: any) => {
          if (tokenResponse.error) {
            return reject(new Error(tokenResponse.error_description || tokenResponse.error));
          }

          const accessToken = tokenResponse.access_token;
          const expiresIn = parseInt(tokenResponse.expires_in, 10) || 3599;
          const expiresAt = Date.now() + expiresIn * 1000;

          localStorage.setItem(STORAGE_ACCESS_TOKEN, accessToken);
          localStorage.setItem(STORAGE_TOKEN_EXPIRES, String(expiresAt));

          try {
            const profile = await fetchGoogleUserProfile(accessToken);
            resolve({ accessToken, expiresIn, profile });
          } catch (err: any) {
            reject(err);
          }
        },
      });

      tokenClient.requestAccessToken({ prompt: '' });
    } catch (err: any) {
      reject(err);
    }
  });
}

/**
 * Logout and clear session
 */
export function logoutGoogle(): void {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem(STORAGE_ACCESS_TOKEN);
    if (token && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(token, () => {});
    }
    localStorage.removeItem(STORAGE_ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_TOKEN_EXPIRES);
    localStorage.removeItem(STORAGE_USER_PROFILE);
  }
}
