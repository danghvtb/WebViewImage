import { NextRequest, NextResponse } from 'next/server';
import { createResumableUploadSession, getTargetFolderId } from '@/lib/drive';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileName, fileSize, mimeType, folderId } = body;

    if (!fileName || !fileSize || !mimeType) {
      return NextResponse.json(
        { error: 'Missing required fields: fileName, fileSize, mimeType' },
        { status: 400 }
      );
    }

    const targetFolder = folderId || getTargetFolderId();

    const uploadUrl = await createResumableUploadSession({
      fileName,
      fileSize: Number(fileSize),
      mimeType,
      folderId: targetFolder,
    });

    return NextResponse.json({
      uploadUrl,
      fileName,
      fileSize: Number(fileSize),
      mimeType,
      folderId: targetFolder,
    });
  } catch (error: any) {
    console.error('[UploadInitAPI] Error initiating upload session:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to initiate resumable upload session' },
      { status: 500 }
    );
  }
}
