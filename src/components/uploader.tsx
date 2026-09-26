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
  Plus,
  Trash2,
  RefreshCw,
  Layers,
} from 'lucide-react';

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunk for Google Drive resumable upload

export interface QueueItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'completed' | 'error' | 'paused';
  progress: number;
  uploadedBytes: number;
  speedMBs: number;
  etaSeconds: number | null;
  errorMessage?: string;
}

export function UploaderModal() {
  const { isUploadModalOpen, setUploadModalOpen } = useMediaStore();
  const { accessToken, currentFolder, isLoggedIn, setIsConfigModalOpen } = useAuthStore();
  const queryClient = useQueryClient();

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [isQueuePaused, setIsQueuePaused] = useState(false);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isPausedRef = useRef<boolean>(false);
  const activeUploadUrlRef = useRef<string | null>(null);
  const activeUploadedBytesRef = useRef<number>(0);

  // Overall batch statistics
  const totalFiles = queue.length;
  const completedFiles = queue.filter((item) => item.status === 'completed').length;
  const errorFiles = queue.filter((item) => item.status === 'error').length;
  const totalBytes = queue.reduce((sum, item) => sum + item.file.size, 0);
  const totalUploadedBytes = queue.reduce((sum, item) => sum + item.uploadedBytes, 0);
  const overallProgress = totalBytes > 0 ? Math.round((totalUploadedBytes / totalBytes) * 100) : 0;

  const resetAll = () => {
    if (isProcessingQueue) {
      abortControllerRef.current?.abort();
    }
    setQueue([]);
    setIsProcessingQueue(false);
    setIsQueuePaused(false);
    setActiveItemId(null);
    isPausedRef.current = false;
    activeUploadUrlRef.current = null;
    activeUploadedBytesRef.current = 0;
  };

  const handleClose = () => {
    if (isProcessingQueue) {
      if (!confirm('Quá trình tải lên các file đang diễn ra. Bạn có chắc muốn đóng và hủy?')) {
        return;
      }
      abortControllerRef.current?.abort();
    }
    resetAll();
    setUploadModalOpen(false);
  };

  // Add multiple files to upload queue
  const handleAddFiles = (incomingFiles: FileList | File[]) => {
    const validFiles = Array.from(incomingFiles).filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
    );

    if (validFiles.length === 0) {
      alert('Vui lòng chọn các file hình ảnh hoặc video hợp lệ.');
      return;
    }

    setQueue((prevQueue) => {
      const existingNames = new Set(prevQueue.map((item) => `${item.file.name}_${item.file.size}`));
      const newItems: QueueItem[] = [];

      for (const file of validFiles) {
        const key = `${file.name}_${file.size}`;
        if (!existingNames.has(key)) {
          existingNames.add(key);
          newItems.push({
            id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            file,
            status: 'pending',
            progress: 0,
            uploadedBytes: 0,
            speedMBs: 0,
            etaSeconds: null,
          });
        }
      }

      return [...prevQueue, ...newItems];
    });
  };

  // Remove individual pending file from queue
  const handleRemoveItem = (id: string) => {
    if (activeItemId === id && isProcessingQueue) {
      alert('Không thể xóa tệp đang trong quá trình tải lên.');
      return;
    }
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  // Upload chunks for one single file
  const uploadSingleFileChunks = useCallback(
    async (
      targetFile: File,
      sessionUrl: string,
      itemId: string,
      startFromByte = 0
    ): Promise<boolean> => {
      const totalSize = targetFile.size;
      let currentStart = startFromByte;
      activeUploadedBytesRef.current = currentStart;

      while (currentStart < totalSize) {
        if (isPausedRef.current) {
          setQueue((prev) =>
            prev.map((i) => (i.id === itemId ? { ...i, status: 'paused' } : i))
          );
          return false;
        }

        const currentEnd = Math.min(currentStart + CHUNK_SIZE, totalSize);
        const chunkBlob = targetFile.slice(currentStart, currentEnd);
        const chunkLength = chunkBlob.size;

        const controller = new AbortController();
        abortControllerRef.current = controller;
        const chunkStartTime = performance.now();

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
            return false;
          }
          throw fetchErr;
        }

        const chunkDurationSec = (performance.now() - chunkStartTime) / 1000;
        const currentSpeed =
          chunkDurationSec > 0
            ? parseFloat((chunkLength / (1024 * 1024) / chunkDurationSec).toFixed(2))
            : 0;

        if (response.status === 308) {
          // 308 Incomplete, next chunk
          const rangeHeader = response.headers.get('Range');
          if (rangeHeader) {
            const match = rangeHeader.match(/bytes=0-(\d+)/);
            currentStart = match ? parseInt(match[1], 10) + 1 : currentEnd;
          } else {
            currentStart = currentEnd;
          }

          activeUploadedBytesRef.current = currentStart;
          const fileProg = Math.min(100, Math.round((currentStart / totalSize) * 100));
          const remainingBytes = totalSize - currentStart;
          const eta = currentSpeed > 0 ? Math.round(remainingBytes / (currentSpeed * 1024 * 1024)) : null;

          setQueue((prev) =>
            prev.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    progress: fileProg,
                    uploadedBytes: currentStart,
                    speedMBs: currentSpeed,
                    etaSeconds: eta,
                  }
                : item
            )
          );
        } else if (response.status === 200 || response.status === 201) {
          // File completed
          const responseData = await response.json().catch(() => ({}));
          const fileId = responseData.id || `up-${Date.now()}`;

          setQueue((prev) =>
            prev.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    status: 'completed',
                    progress: 100,
                    uploadedBytes: totalSize,
                    speedMBs: 0,
                    etaSeconds: 0,
                  }
                : item
            )
          );

          // Save to local IndexedDB for instant UI rendering
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
          queryClient.invalidateQueries({ queryKey: ['files'] });
          return true;
        } else {
          const errText = await response.text();
          throw new Error(`Lỗi Google Drive (${response.status}): ${errText}`);
        }
      }

      return true;
    },
    [currentFolder, queryClient]
  );

  // Process queue sequentially
  const startQueueUpload = async () => {
    if (!isLoggedIn || !accessToken || !currentFolder) {
      setIsConfigModalOpen(true);
      return;
    }

    setIsProcessingQueue(true);
    setIsQueuePaused(false);
    isPausedRef.current = false;

    // Find pending or paused items to upload
    const currentQueue = queue;
    for (let i = 0; i < currentQueue.length; i++) {
      const item = currentQueue[i];
      if (item.status === 'completed') continue;

      if (isPausedRef.current) {
        break;
      }

      setActiveItemId(item.id);
      setQueue((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: 'uploading' } : it))
      );

      try {
        // Step 1: Initiate or resume upload session
        let sessionUrl = activeUploadUrlRef.current;
        let startFrom = 0;

        if (!sessionUrl || item.id !== activeItemId) {
          sessionUrl = await initClientResumableUpload(
            item.file.name,
            item.file.size,
            item.file.type || 'application/octet-stream',
            currentFolder.id,
            accessToken
          );
          activeUploadUrlRef.current = sessionUrl;
          startFrom = 0;
        } else {
          startFrom = activeUploadedBytesRef.current;
        }

        // Step 2: Upload chunks
        const success = await uploadSingleFileChunks(item.file, sessionUrl, item.id, startFrom);

        if (!success) {
          // Was paused or aborted
          break;
        } else {
          // Reset current upload URL for next file
          activeUploadUrlRef.current = null;
          activeUploadedBytesRef.current = 0;
        }
      } catch (err: any) {
        console.error(`[Uploader] Failed to upload ${item.file.name}:`, err);
        setQueue((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  status: 'error',
                  errorMessage: err.message || 'Lỗi tải lên',
                }
              : it
          )
        );
        activeUploadUrlRef.current = null;
        activeUploadedBytesRef.current = 0;
      }
    }

    setActiveItemId(null);
    setIsProcessingQueue(false);
  };

  const handlePause = () => {
    isPausedRef.current = true;
    setIsQueuePaused(true);
    abortControllerRef.current?.abort();
  };

  const handleResume = () => {
    isPausedRef.current = false;
    setIsQueuePaused(false);
    startQueueUpload();
  };

  if (!isUploadModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-2xl bg-[#141414] border border-[#262626] p-4 sm:p-6 shadow-2xl text-white flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#262626]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Tải lên hàng loạt Google Drive</h3>
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <Folder className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  Thư mục đích: <b className="text-neutral-200">{currentFolder?.name || 'DriveStream Media'}</b>
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Not Logged In Warning */}
        {!isLoggedIn && (
          <div className="mt-4 p-3 rounded-xl bg-amber-950/40 border border-amber-800/50 flex items-center justify-between gap-3 text-xs text-amber-300">
            <span>Bạn cần kết nối tài khoản Google để tải ảnh & video lên Google Drive.</span>
            <button
              onClick={() => setIsConfigModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium shrink-0"
            >
              Đăng nhập ngay
            </button>
          </div>
        )}

        {/* Hidden Multi-file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleAddFiles(e.target.files);
              e.target.value = ''; // Reset input so same files can be re-added if desired
            }
          }}
        />

        {/* Dropzone Area (Visible when queue is empty) */}
        {queue.length === 0 ? (
          <div className="mt-6 flex-1 flex flex-col">
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  handleAddFiles(e.dataTransfer.files);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 min-h-[260px] flex flex-col items-center justify-center border-2 border-dashed border-[#333] hover:border-blue-500/60 rounded-2xl p-8 cursor-pointer bg-[#181818]/40 hover:bg-[#181818]/80 transition-all group"
            >
              <div className="p-4 rounded-2xl bg-neutral-800/80 group-hover:bg-blue-500/10 text-neutral-400 group-hover:text-blue-400 mb-3 transition-colors shadow-lg">
                <Upload className="w-8 h-8" />
              </div>
              <p className="text-base font-medium text-white mb-1">
                Kéo thả nhiều ảnh hoặc video vào đây
              </p>
              <p className="text-xs text-neutral-400 mb-4 text-center max-w-sm">
                Hỗ trợ chọn nhiều ảnh JPG, PNG, GIF và video MP4, MOV cùng một lúc mà không bị giới hạn số lượng.
              </p>
              <span className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all group-hover:scale-105">
                <Plus className="w-4 h-4" />
                <span>Chọn nhiều ảnh & video từ thiết bị</span>
              </span>
            </label>
          </div>
        ) : (
          /* File List & Progress View */
          <div className="mt-4 flex-1 flex flex-col min-h-0">
            {/* Batch Overview Banner */}
            <div className="p-3.5 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] mb-3">
              <div className="flex items-center justify-between text-xs mb-2">
                <div className="flex items-center gap-2 font-medium">
                  <Layers className="w-4 h-4 text-blue-400" />
                  <span>
                    Tổng cộng: <b>{totalFiles}</b> tệp ({formatBytes(totalBytes)})
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-emerald-400 font-medium">
                    ✓ Đã xong: {completedFiles}/{totalFiles}
                  </span>
                  {errorFiles > 0 && (
                    <span className="text-red-400 font-medium">
                      ✕ Lỗi: {errorFiles}
                    </span>
                  )}
                  <span className="text-white font-semibold">{overallProgress}%</span>
                </div>
              </div>

              {/* Overall Progress Bar */}
              <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    completedFiles === totalFiles && totalFiles > 0
                      ? 'bg-emerald-500'
                      : errorFiles > 0
                      ? 'bg-amber-500'
                      : 'bg-gradient-to-r from-blue-500 to-indigo-500'
                  }`}
                  style={{ width: `${overallProgress}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-neutral-400 mt-2">
                <span>
                  Đã tải: {formatBytes(totalUploadedBytes)} / {formatBytes(totalBytes)}
                </span>
                {!isProcessingQueue && completedFiles < totalFiles && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm tệp khác</span>
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable File Items List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar max-h-[320px]">
              {queue.map((item, index) => {
                const isVideo = item.file.type.startsWith('video/');
                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border transition-all ${
                      item.status === 'uploading'
                        ? 'bg-[#181f2a] border-blue-500/50 shadow-md shadow-blue-500/5'
                        : item.status === 'completed'
                        ? 'bg-[#141d17] border-emerald-500/30'
                        : item.status === 'error'
                        ? 'bg-[#211414] border-red-500/30'
                        : 'bg-[#181818] border-[#262626]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* File Format Icon */}
                      <div
                        className={`p-2 rounded-lg shrink-0 ${
                          isVideo
                            ? 'bg-purple-500/10 text-purple-400'
                            : 'bg-blue-500/10 text-blue-400'
                        }`}
                      >
                        {isVideo ? (
                          <FileVideo className="w-5 h-5" />
                        ) : (
                          <FileImage className="w-5 h-5" />
                        )}
                      </div>

                      {/* File Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-white truncate max-w-[280px] sm:max-w-md">
                            {item.file.name}
                          </p>
                          <span className="text-[11px] text-neutral-400 shrink-0">
                            {formatBytes(item.file.size)}
                          </span>
                        </div>

                        {/* Status / Speed / Error description */}
                        <div className="flex items-center justify-between text-[11px] text-neutral-400 mt-1">
                          <div>
                            {item.status === 'pending' && (
                              <span className="text-neutral-500">Chờ tải lên...</span>
                            )}
                            {item.status === 'uploading' && (
                              <span className="text-blue-400 font-medium flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                                Đang tải {item.progress}% • {item.speedMBs} MB/s
                                {item.etaSeconds ? ` • ~${item.etaSeconds}s` : ''}
                              </span>
                            )}
                            {item.status === 'paused' && (
                              <span className="text-amber-400 font-medium">Tạm dừng</span>
                            )}
                            {item.status === 'completed' && (
                              <span className="text-emerald-400 font-medium flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Hoàn thành
                              </span>
                            )}
                            {item.status === 'error' && (
                              <span className="text-red-400 font-medium flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5" />
                                {item.errorMessage || 'Lỗi tải lên'}
                              </span>
                            )}
                          </div>
                          {item.status === 'uploading' && (
                            <span className="text-neutral-300 font-semibold">{item.progress}%</span>
                          )}
                        </div>

                        {/* Single item progress bar when uploading */}
                        {item.status === 'uploading' && (
                          <div className="w-full h-1.5 rounded-full bg-neutral-800 overflow-hidden mt-1.5">
                            <div
                              className="h-full bg-blue-500 transition-all duration-200"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Remove item button (only when pending or error) */}
                      {(item.status === 'pending' || item.status === 'error') && !isProcessingQueue && (
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="p-1 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-neutral-800/80 transition-colors shrink-0"
                          title="Xóa khỏi danh sách"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-5 pt-4 border-t border-[#262626] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {queue.length > 0 && !isProcessingQueue && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800/80 hover:bg-neutral-800 text-xs font-medium text-neutral-300 hover:text-white border border-neutral-700/60 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm tệp</span>
              </button>
            )}

            {queue.length > 0 && !isProcessingQueue && completedFiles < totalFiles && (
              <button
                onClick={() => setQueue([])}
                className="px-3 py-1.5 rounded-lg text-neutral-400 hover:text-red-400 text-xs font-medium transition-colors"
              >
                Xóa tất cả
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-300 transition-colors"
            >
              {completedFiles === totalFiles && totalFiles > 0 ? 'Đóng' : 'Hủy'}
            </button>

            {queue.length > 0 && !isProcessingQueue && completedFiles < totalFiles && (
              <button
                onClick={startQueueUpload}
                disabled={!isLoggedIn}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white transition-all shadow-lg shadow-blue-600/25 active:scale-95"
              >
                <Upload className="w-4 h-4" />
                <span>
                  Bắt đầu tải lên ({totalFiles - completedFiles} tệp)
                </span>
              </button>
            )}

            {isProcessingQueue && !isQueuePaused && (
              <button
                onClick={handlePause}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white transition-colors"
              >
                <Pause className="w-4 h-4" />
                <span>Tạm dừng</span>
              </button>
            )}

            {isProcessingQueue && isQueuePaused && (
              <button
                onClick={handleResume}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Tiếp tục tải</span>
              </button>
            )}

            {completedFiles === totalFiles && totalFiles > 0 && (
              <button
                onClick={resetAll}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-semibold transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Tải lượt khác</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
