/**
 * Service Worker for Progressive Video Streaming
 * Intercepts /api-stream/:fileId requests and proxies HTTP 206 Partial Content Range requests
 * directly to Google Drive API with OAuth Bearer token.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.includes('/api-stream/')) {
    event.respondWith(handleVideoStream(event.request, url));
  }
});

async function handleVideoStream(request, url) {
  try {
    const match = url.pathname.match(/\/api-stream\/([^/?#]+)/);
    const fileId = match ? decodeURIComponent(match[1]) : null;

    if (!fileId) {
      return new Response('Missing file ID', { status: 400 });
    }

    const token = url.searchParams.get('token');
    const mimeType = url.searchParams.get('mime') || 'video/mp4';

    if (!token) {
      return new Response('Missing access token', { status: 401 });
    }

    const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    const driveHeaders = new Headers();
    driveHeaders.set('Authorization', `Bearer ${token}`);

    // Always ensure a Range header is sent so Google Drive responds with 206 Partial Content
    const clientRange = request.headers.get('range') || 'bytes=0-';
    driveHeaders.set('Range', clientRange);

    const googleRes = await fetch(driveUrl, {
      method: 'GET',
      headers: driveHeaders,
    });

    if (!googleRes.ok && googleRes.status !== 206) {
      return new Response(`Google Drive Error (${googleRes.status}): ${googleRes.statusText}`, {
        status: googleRes.status,
        statusText: googleRes.statusText,
      });
    }

    // Construct response headers for the browser video player
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', googleRes.headers.get('content-type') || mimeType);
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    const contentLength = googleRes.headers.get('content-length');
    if (contentLength) {
      responseHeaders.set('Content-Length', contentLength);
    }

    let contentRange = googleRes.headers.get('content-range');
    let finalStatus = googleRes.status;

    // Strict 206 Partial Content enforcement for mobile browsers
    if (!contentRange && contentLength) {
      contentRange = `bytes 0-${parseInt(contentLength, 10) - 1}/${contentLength}`;
      finalStatus = 206;
    }

    if (contentRange) {
      responseHeaders.set('Content-Range', contentRange);
    }

    return new Response(googleRes.body, {
      status: finalStatus === 200 ? 206 : finalStatus,
      statusText: 'Partial Content',
      headers: responseHeaders,
    });
  } catch (err) {
    console.error('[SW] Stream error:', err);
    return new Response(`Stream Error: ${err.message}`, { status: 500 });
  }
}
