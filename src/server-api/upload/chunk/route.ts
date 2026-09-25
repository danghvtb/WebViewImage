import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Disable default bodyParser for raw chunk stream forwarding
export const maxDuration = 60;

export async function PUT(request: NextRequest) {
  try {
    const uploadUrl = request.nextUrl.searchParams.get('uploadUrl');
    if (!uploadUrl) {
      return NextResponse.json({ error: 'Missing uploadUrl query parameter' }, { status: 400 });
    }

    const contentRange = request.headers.get('content-range');
    const contentLength = request.headers.get('content-length');
    const contentType = request.headers.get('content-type') || 'application/octet-stream';

    const headers: Record<string, string> = {
      'Content-Type': contentType,
    };
    if (contentRange) headers['Content-Range'] = contentRange;
    if (contentLength) headers['Content-Length'] = contentLength;

    const arrayBuffer = await request.arrayBuffer();

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers,
      body: arrayBuffer,
    });

    const responseText = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((val, key) => {
      responseHeaders[key] = val;
    });

    return new Response(responseText, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        Range: response.headers.get('range') || '',
      },
    });
  } catch (error: any) {
    console.error('[UploadChunkProxy] Error forwarding chunk:', error);
    return NextResponse.json({ error: error.message || 'Chunk forward failed' }, { status: 500 });
  }
}
