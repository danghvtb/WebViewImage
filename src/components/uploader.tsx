'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMediaStore } from '@/store/use-media-store';
import { useAuthStore } from '@/store/use-auth-store';
import { formatBytes } from '@/lib/thumbnail';
import { initClientResumableUpload } from '@/lib/client-drive';
import { localDB } from '@/lib/indexed-db';
import { DriveMediaItem } from '@/lib/types';
import {
  Upload,
  X,
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  FileVideo,
  FileImage,
  Folder,
} from 'lucide-react';

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks

export function UploaderModal() {
  const { isUploadModalOpen, setUploadModalOpen } = useMediaStore();
  const { accessToken, currentFolder, isLoggedIn, setIsConfigModalOpen } = useAuthStore();
  const queryClient = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<
    'idle' | 'initializing' | 'uploading' | 'paused' | 'completed' | 'error'
  >('idle');
  const [progress, setProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [speedMBs, setSpeedMBs] = useState<number>(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadUrlRef = useRef<string | null>(null);
  const isPausedRef = useRef<boolean>(false);
  const uploadedBytesRef = useRef<number>(0);

  const resetState = () => {
    setFile(null);
    setStatus('idle');
    setProgress(0);
    setUploadedBytes(0);
    setSpeedMBs(0);
    setEtaSeconds(null);
    setErrorMessage('');
    uploadUrlRef.current = null;
    uploadedBytesRef.current = 0;
    isPausedRef.current = false;
  };

  const handleClose = () => {
    if (status === 'uploading') {
      if (!confirm('Quá trình tải lên đang diễn ra. Bạn có chắc muốn hủy?')) {
        return;
      }
      abortControllerRef.current?.abort();
    }
    resetState();
    setUploadModalOpen(false);
  };

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setStatus('idle');
    setProgress(0);
    setUploadedBytes(0);
    setSpeedMBs(0);
    setErrorMessage('');
    uploadUrlRef.current = null;
    uploadedBytesRef.current = 0;
  };

  // Perform Resumable Upload in 10MB Chunks
  const uploadChunks = useCallback(
    async (targetFile: File, sessionUrl: string, startFromByte = 0) => {
      const totalSize = targetFile.size;
      let currentStart = startFromByte;
      uploadedBytesRef.current = currentStart;
      isPausedRef.current = false;
      setStatus('uploading');

      try {
        while (currentStart < totalSize) {
          if (isPausedRef.current) {
            setStatus('paused');
            return;
          }

          const currentEnd = Math.min(currentStart + CHUNK_SIZE, totalSize);
          const chunkBlob = targetFile.slice(currentStart, currentEnd);
          const chunkLength = chunkBlob.size;

          const controller = new AbortController();
          abortControllerRef.current = controller;

          const chunkStartTime = performance.now();

          // Direct browser upload to Google Drive resumable session URL
          let response: Response;
          try {
            response = await fetch(sessionUrl, {
              method: 'PUT',
              headers: {
                'Content-Range': `bytes ${currentStart}-${currentEnd - 1}/${totalSize}`,
              },
              body: chunkBlob,
              signal: controller.signal,
            });
          } catch (fetchErr: any) {
            if (fetchErr.name === 'AbortError') {
              setStatus('paused');
              return;
            }
            throw fetchErr;
          }

          const chunkDurationSec = (performance.now() - chunkStartTime) / 1000;
          const currentSpeed =
            chunkDurationSec > 0 ? chunkLength / (1024 * 1024) / chunkDurationSec : 0;
          setSpeedMBs(parseFloat(currentSpeed.toFixed(2)));

          if (response.status === 308) {
            // 308 Resume Incomplete
            const rangeHeader = response.headers.get('Range');
            if (rangeHeader) {
              const match = rangeHeader.match(/bytes=0-(\d+)/);
              if (match) {
                currentStart = parseInt(match[1], 10) + 1;
              } else {
                currentStart = currentEnd;
              }
            } else {
              currentStart = currentEnd;
            }

            uploadedBytesRef.current = currentStart;
            setUploadedBytes(currentStart);
            const currentProgress = Math.min(100, Math.round((currentStart / totalSize) * 100));
            setProgress(currentProgress);

            const remainingBytes = totalSize - currentStart;
            if (currentSpeed > 0) {
              setEtaSeconds(Math.round(remainingBytes / (currentSpeed * 1024 * 1024)));
            }
          } else if (response.status === 200 || response.status === 201) {
            // Upload Completed
            const responseData = await response.json().catch(() => ({}));
            const fileId = responseData.id || `up-${Date.now()}`;

            setUploadedBytes(totalSize);
            setProgress(100);
            setStatus('completed');
            setSpeedMBs(0);
            setEtaSeconds(0);

            // Save to client IndexedDB cache
            const newMediaItem: DriveMediaItem = {
              id: fileId,
              name: targetFile.name,
              mimeType: targetFile.type || 'application/octet-stream',
              size: totalSize,
              thumbnailUrl: responseData.thumbnailLink || null,
              createdTime: new Date().toISOString(),
              modifiedTime: new Date().toISOString(),
              width: responseData.imageMediaMetadata?.width || null,
              height: responseData.imageMediaMetadata?.height || null,
              durationMillis: responseData.videoMediaMetadata?.durationMillis
                ? Number(responseData.videoMediaMetadata.durationMillis)
                : null,
              isTrash: false,
              driveFolderId: currentFolder?.id || 'root',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            await localDB.saveFiles([newMediaItem]);

            // Invalidate React Query cache to re-render grid
            queryClient.invalidateQueries({ queryKey: ['files'] });
            return;
          } else {
            const errText = await response.text();
            throw new Error(`Google Drive upload error (${response.status}): ${errText}`);
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setStatus('paused');
        } else {
          console.error('[Uploader] Chunk error:', err);
          setStatus('error');
          setErrorMessage(err.message || 'Lỗi trong quá trình truyền dữ liệu');
        }
      }
    },
    [currentFolder, queryClient]
  );

  // Initialize and start upload
  const startUpload = async () => {
    if (!file) return;

    if (!isLoggedIn || !accessToken || !currentFolder) {
      setIsConfigModalOpen(true);
      return;
    }

    try {
      setStatus('initializing');
      setErrorMessage('');

      // Step 1: Initialize Resumable Upload Session directly with Google Drive API
      const uploadUrl = await initClientResumableUpload(
        file.name,
        file.size,
        file.type || 'application/octet-stream',
        currentFolder.id,
        accessToken
      );

      uploadUrlRef.current = uploadUrl;

      // Step 2: Start Chunk Upload Loop
      await uploadChunks(file, uploadUrl, 0);
    } catch (err: any) {
      console.error('[Uploader] Init error:', err);
      setStatus('error');
      setErrorMessage(err.message || 'Không thể bắt đầu upload');
    }
  };

  const handlePause = () => {
    isPausedRef.current = true;
    abortControllerRef.current?.abort();
    setStatus('paused');
  };

  const handleResume = () => {
    if (!file || !uploadUrlRef.current) return;
    uploadChunks(file, uploadUrlRef.current, uploadedBytesRef.current);
  };

  if (!isUploadModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-[#141414] border border-[#262626] p-6 shadow-2xl text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#262626]">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Tải lên Google Drive</h3>
              <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                <Folder className="w-3.5 h-3.5 text-amber-400" />
                <span>Thư mục: <b>{currentFolder?.name || 'Chưa chọn'}</b></span>
              </div>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Not Logged In Warning */}
        {!isLoggedIn && (
          <div className="mt-4 p-3 rounded-xl bg-amber-950/40 border border-amber-800/50 flex items-center justify-between gap-3 text-xs text-amber-300">
            <span>Bạn cần đăng nhập tài khoản Google để tải file lên.</span>
            <button
              onClick={() => setIsConfigModalOpen(true)}
              className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium shrink-0"
            >
              Đăng nhập
            </button>
          </div>
        )}

        {/* Dropzone / File Area */}
        <div className="mt-5">
          {!file ? (
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileSelect(e.dataTransfer.files[0]);
                }
              }}
              className="flex flex-col items-center justify-center border-2 border-dashed border-[#333] hover:border-blue-500/60 rounded-xl p-8 cursor-pointer bg-[#181818]/50 hover:bg-[#181818] transition-all group"
            >
              <div className="p-4 rounded-full bg-neutral-800/60 group-hover:bg-blue-500/10 text-neutral-400 group-hover:text-blue-400 mb-3 transition-colors">
                <Upload className="w-7 h-7" />
              </div>
              <p className="text-sm font-medium text-white mb-1">
                Kéo thả ảnh hoặc video vào đây
              </p>
              <p className="text-xs text-neutral-500 mb-4">hoặc nhấp để chọn tệp từ máy tính</p>
              <span className="px-3 py-1.5 rounded-lg bg-neutral-800 text-neutral-300 text-xs font-medium border border-neutral-700">
                Chọn file media
              </span>
              <input
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />
            </label>
          ) : (
            <div className="p-4 rounded-xl bg-[#1c1c1c] border border-[#2a2a2a]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-neutral-800 text-blue-400">
                  {file.type.startsWith('video/') ? (
                    <FileVideo className="w-6 h-6" />
                  ) : (
                    <FileImage className="w-6 h-6" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{file.name}</p>
                  <p className="text-xs text-neutral-400">{formatBytes(file.size)}</p>
                </div>
                {status === 'idle' && (
                  <button
                    onClick={() => setFile(null)}
                    className="text-xs text-neutral-400 hover:text-white p-1"
                  >
                    Đổi file
                  </button>
                )}
              </div>

              {/* Progress and Stats */}
              {status !== 'idle' && (
                <div className="mt-4 pt-4 border-t border-[#2a2a2a] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-400 font-medium">
                      {status === 'initializing' && 'Đang tạo phiên upload trực tiếp...'}
                      {status === 'uploading' && 'Đang tải lên từng chunk 10MB...'}
                      {status === 'paused' && 'Đã tạm dừng'}
                      {status === 'completed' && 'Hoàn thành xuất sắc!'}
                      {status === 'error' && 'Gặp lỗi trong quá trình upload'}
                    </span>
                    <span className="text-white font-semibold">{progress}%</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        status === 'completed'
                          ? 'bg-emerald-500'
                          : status === 'error'
                          ? 'bg-red-500'
                          : 'bg-blue-500'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  {/* Realtime Stats: Speed MB/s, ETA, Uploaded Bytes */}
                  <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1">
                    <span>
                      {formatBytes(uploadedBytes)} / {formatBytes(file.size)}
                    </span>
                    {status === 'uploading' && (
                      <span className="text-blue-400 font-medium">{speedMBs} MB/s</span>
                    )}
                    {etaSeconds !== null && etaSeconds > 0 && status === 'uploading' && (
                      <span>Còn khoảng ~{etaSeconds}s</span>
                    )}
                  </div>
                </div>
              )}

              {/* Error Message */}
              {status === 'error' && errorMessage && (
                <div className="mt-3 p-3 rounded-lg bg-red-950/40 border border-red-800/50 flex items-start gap-2 text-xs text-red-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Success Badge */}
              {status === 'completed' && (
                <div className="mt-3 p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/50 flex items-center gap-2 text-xs text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>File đã được tải lên trực tiếp vào Google Drive & bộ nhớ đệm!</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-300 transition-colors"
          >
            {status === 'completed' ? 'Đóng' : 'Hủy'}
          </button>

          {file && status === 'idle' && (
            <button
              onClick={startUpload}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-colors shadow-lg shadow-blue-600/20"
            >
              <Upload className="w-4 h-4" />
              <span>Bắt đầu tải lên</span>
            </button>
          )}

          {status === 'uploading' && (
            <button
              onClick={handlePause}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white transition-colors"
            >
              <Pause className="w-4 h-4" />
              <span>Tạm dừng</span>
            </button>
          )}

          {status === 'paused' && (
            <button
              onClick={handleResume}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Tiếp tục</span>
            </button>
          )}

          {status === 'completed' && (
            <button
              onClick={resetState}
              className="px-4 py-2 rounded-lg bg-white text-black hover:bg-neutral-200 text-xs font-semibold transition-colors"
            >
              Tải file khác
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
