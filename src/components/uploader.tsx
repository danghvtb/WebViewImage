'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMediaStore } from '@/store/use-media-store';
import { useAuthStore } from '@/store/use-auth-store';
import { formatBytes } from '@/lib/thumbnail';
import { uploadDriveFileAuto, makeFolderOrFilePublic } from '@/lib/client-drive';
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
  Sparkles,
  KeyRound,
} from 'lucide-react';

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
  const { accessToken, currentFolder, isLoggedIn, setIsConfigModalOpen, refreshToken } = useAuthStore();
  const queryClient = useQueryClient();

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [isQueuePaused, setIsQueuePaused] = useState(false);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [isRefreshingAuth, setIsRefreshingAuth] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isPausedRef = useRef<boolean>(false);

  // Overall batch statistics
  const totalFiles = queue.length;
  const completedFiles = queue.filter((item) => item.status === 'completed').length;
  const errorFiles = queue.filter((item) => item.status === 'error').length;
  const hasErrors = errorFiles > 0;
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

  // Remove individual file from queue
  const handleRemoveItem = (id: string) => {
    if (activeItemId === id && isProcessingQueue) {
      alert('Không thể xóa tệp đang trong quá trình tải lên.');
      return;
    }
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  // Core single file uploader
  const uploadSingleItem = async (item: QueueItem): Promise<boolean> => {
    let currentToken = accessToken || useAuthStore.getState().accessToken;
    const targetFolder = currentFolder || useAuthStore.getState().currentFolder;

    if (!currentToken || !targetFolder) {
      throw new Error('Chưa đăng nhập Google hoặc chưa chọn thư mục');
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const responseData = await uploadDriveFileAuto(
      item.file,
      targetFolder.id,
      currentToken,
      (progress, speedMBs, etaSeconds) => {
        setQueue((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  progress,
                  uploadedBytes: Math.round((progress / 100) * item.file.size),
                  speedMBs: speedMBs || it.speedMBs,
                  etaSeconds,
                }
              : it
          )
        );
      },
      controller.signal
    );

    const fileId = responseData?.id || `up-${Date.now()}`;

    setQueue((prev) =>
      prev.map((it) =>
        it.id === item.id
          ? {
              ...it,
              status: 'completed',
              progress: 100,
              uploadedBytes: item.file.size,
              speedMBs: 0,
              etaSeconds: 0,
            }
          : it
      )
    );

    // Save to local IndexedDB for instant UI rendering
    const newMediaItem: DriveMediaItem = {
      id: fileId,
      name: item.file.name,
      mimeType: item.file.type || 'application/octet-stream',
      size: item.file.size,
      thumbnailUrl: responseData?.thumbnailLink || null,
      createdTime: new Date().toISOString(),
      modifiedTime: new Date().toISOString(),
      width: responseData?.imageMediaMetadata?.width || responseData?.videoMediaMetadata?.width || null,
      height: responseData?.imageMediaMetadata?.height || responseData?.videoMediaMetadata?.height || null,
      durationMillis: responseData?.videoMediaMetadata?.durationMillis
        ? Number(responseData.videoMediaMetadata.durationMillis)
        : null,
      isTrash: false,
      driveFolderId: targetFolder.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await localDB.saveFiles([newMediaItem]);

    const activeToken = useAuthStore.getState().accessToken;
    if (activeToken) {
      makeFolderOrFilePublic(fileId, activeToken).catch(() => {});
    }
    queryClient.invalidateQueries({ queryKey: ['files'] });
    return true;
  };

  // Process queue sequentially
  const startQueueUpload = async () => {
    let currentToken = accessToken || useAuthStore.getState().accessToken;
    if (!isLoggedIn || !currentToken || !currentFolder) {
      setIsConfigModalOpen(true);
      return;
    }

    setIsProcessingQueue(true);
    setIsQueuePaused(false);
    isPausedRef.current = false;

    // Snapshot of items to process
    const itemsToUpload = queue.filter(
      (item) => item.status === 'pending' || item.status === 'error' || item.status === 'paused'
    );

    for (const item of itemsToUpload) {
      if (isPausedRef.current) break;

      setActiveItemId(item.id);
      setQueue((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, status: 'uploading', errorMessage: undefined } : it
        )
      );

      try {
        await uploadSingleItem(item);
      } catch (err: any) {
        if (err.message === 'Đã tạm dừng hoặc hủy tải lên' || isPausedRef.current) {
          setQueue((prev) =>
            prev.map((it) => (it.id === item.id ? { ...it, status: 'paused' } : it))
          );
          break;
        }

        const isAuthError =
          err.message?.includes('401') ||
          err.message?.includes('Invalid Credentials') ||
          err.message?.includes('invalid_grant') ||
          err.message?.includes('Chưa đăng nhập');

        console.error(`[Uploader] Failed to upload ${item.file.name}:`, err);
        setQueue((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  status: 'error',
                  errorMessage: isAuthError
                    ? 'Phiên đăng nhập hết hạn (401)'
                    : err.message || 'Lỗi kết nối tải lên',
                }
              : it
          )
        );

        if (isAuthError) {
          // Immediately stop queue processing so it doesn't loop through all remaining files
          isPausedRef.current = true;
          setIsQueuePaused(true);
          break;
        }
      }
    }

    setActiveItemId(null);
    setIsProcessingQueue(false);
  };

  // Clear all error items so user can exit cleanly
  const handleClearErrors = () => {
    setQueue((prev) => prev.filter((item) => item.status !== 'error'));
  };

  // Retry all error items
  const handleRetryAllErrors = () => {
    setQueue((prev) =>
      prev.map((it) =>
        it.status === 'error'
          ? { ...it, status: 'pending', progress: 0, speedMBs: 0, errorMessage: undefined }
          : it
      )
    );
    isPausedRef.current = false;
    setIsQueuePaused(false);
    startQueueUpload();
  };

  // Retry an individual failed item
  const handleRetryItem = async (itemId: string) => {
    const item = queue.find((it) => it.id === itemId);
    if (!item || isProcessingQueue) return;

    setIsProcessingQueue(true);
    setActiveItemId(item.id);
    setQueue((prev) =>
      prev.map((it) =>
        it.id === item.id
          ? { ...it, status: 'uploading', progress: 0, speedMBs: 0, errorMessage: undefined }
          : it
      )
    );

    try {
      await uploadSingleItem(item);
    } catch (err: any) {
      console.error(`[Uploader] Retry failed for ${item.file.name}:`, err);
      setQueue((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? {
                ...it,
                status: 'error',
                errorMessage: err.message || 'Lỗi kết nối khi thử lại',
              }
            : it
        )
      );
    } finally {
      setActiveItemId(null);
      setIsProcessingQueue(false);
    }
  };

  // Manual token refresh button
  const handleManualRefreshToken = async () => {
    try {
      setIsRefreshingAuth(true);
      await refreshToken();
      alert('Đã làm mới phiên đăng nhập Google thành công! Bạn có thể tiếp tục tải lên.');
    } catch (err: any) {
      alert(`Làm mới đăng nhập thất bại: ${err.message}`);
    } finally {
      setIsRefreshingAuth(false);
    }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-[#141414] border border-[#262626] shadow-2xl overflow-hidden p-4 sm:p-6 text-neutral-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#262626]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shadow-inner">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
                <span>Tải ảnh & video lên Google Drive</span>
                {totalFiles > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    {completedFiles}/{totalFiles}
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-1.5 text-xs text-neutral-400 mt-0.5">
                <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate max-w-[200px] sm:max-w-xs font-medium text-neutral-300">
                  {currentFolder ? currentFolder.name : 'Đang chọn thư mục...'}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            title="Đóng cửa sổ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Auth Notice if not logged in */}
        {!isLoggedIn && (
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 flex items-center justify-between gap-3">
            <span>Bạn cần kết nối tài khoản Google để tải ảnh & video lên Google Drive.</span>
            <button
              onClick={() => setIsConfigModalOpen(true)}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium shrink-0 transition-colors"
            >
              Đăng nhập ngay
            </button>
          </div>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleAddFiles(e.target.files);
              e.target.value = ''; // Reset input so same files can be re-selected if needed
            }
          }}
        />

        {/* Dropzone Area (Visible when queue is empty) */}
        {queue.length === 0 ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleAddFiles(e.dataTransfer.files);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 flex-1 min-h-[240px] border-2 border-dashed border-neutral-700/80 hover:border-blue-500/80 rounded-2xl flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all bg-neutral-900/30 hover:bg-neutral-900/60 group"
          >
            <div className="w-16 h-16 rounded-2xl bg-neutral-800/80 border border-white/5 flex items-center justify-center text-neutral-400 group-hover:text-blue-400 group-hover:scale-110 transition-all shadow-xl mb-4">
              <Layers className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">
              Kéo thả nhiều ảnh hoặc video vào đây
            </h3>
            <p className="text-xs text-neutral-400 max-w-sm mb-4">
              Hỗ trợ chọn nhiều ảnh JPG, PNG, GIF, WebP và video MP4, MOV cùng lúc.
            </p>
            <button
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-lg shadow-blue-600/25 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Chọn nhiều ảnh & video từ thiết bị</span>
            </button>
          </div>
        ) : (
          /* File Queue List Area */
          <div className="mt-4 flex-1 flex flex-col overflow-hidden min-h-[220px]">
            {/* Overall Batch Progress Header */}
            <div className="p-3 bg-neutral-900/80 rounded-xl border border-white/5 mb-3 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-neutral-300">
                  {completedFiles === totalFiles
                    ? 'Đã tải lên hoàn tất tất cả tệp!'
                    : isProcessingQueue
                    ? `Đang xử lý tải lên... (${completedFiles}/${totalFiles})`
                    : `Hàng đợi: ${totalFiles} tệp (${formatBytes(totalBytes)})`}
                </span>
                <span className="font-mono text-neutral-400">
                  {formatBytes(totalUploadedBytes)} / {formatBytes(totalBytes)} ({overallProgress}%)
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300 rounded-full"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>

            {/* Error Token Banner if errors exist */}
            {hasErrors && (
              <div className="mb-3 p-2.5 rounded-xl bg-red-950/40 border border-red-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-red-300 min-w-0">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span className="truncate">
                    Có {errorFiles} tệp gặp lỗi kết nối hoặc phiên đăng nhập hết hạn.
                  </span>
                </div>
                <div className="flex items-center gap-1.5 ml-auto">
                  <button
                    type="button"
                    onClick={handleManualRefreshToken}
                    disabled={isRefreshingAuth}
                    title="Đăng nhập lại để cập nhật phiên Google"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-800/70 hover:bg-red-700 text-white font-medium shrink-0 transition-colors text-[11px]"
                  >
                    <KeyRound className="w-3 h-3" />
                    <span>{isRefreshingAuth ? 'Đang làm mới...' : 'Làm mới phiên'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRetryAllErrors}
                    disabled={isProcessingQueue}
                    title="Thử lại các tệp bị lỗi"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white font-medium shrink-0 transition-colors text-[11px]"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Thử lại</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClearErrors}
                    title="Xóa các tệp lỗi khỏi hàng đợi để tiếp tục hoặc thoát"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-medium shrink-0 transition-colors text-[11px]"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Bỏ qua lỗi</span>
                  </button>
                </div>
              </div>
            )}

            {/* Scrollable File List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {queue.map((item) => {
                const isVideo = item.file.type.startsWith('video/');

                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border transition-all ${
                      item.status === 'uploading'
                        ? 'bg-blue-950/20 border-blue-500/40'
                        : item.status === 'completed'
                        ? 'bg-neutral-900/40 border-emerald-500/20'
                        : item.status === 'error'
                        ? 'bg-red-950/20 border-red-500/30'
                        : 'bg-neutral-900/50 border-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Icon */}
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
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
                          <p className="text-xs font-medium text-white truncate max-w-[240px] sm:max-w-md">
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
                                Đang tải {item.progress}%
                                {item.speedMBs > 0 ? ` • ${item.speedMBs} MB/s` : ''}
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

                      {/* Action buttons per item */}
                      {item.status === 'error' && !isProcessingQueue && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleRetryItem(item.id)}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-blue-300 text-[11px] font-medium transition-colors border border-blue-500/30"
                            title="Thử tải lại tệp này"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Thử lại</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="p-1 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-neutral-800/80 transition-colors"
                            title="Xóa khỏi danh sách"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}

                      {item.status === 'pending' && !isProcessingQueue && (
                        <button
                          type="button"
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
        <div className="mt-5 pt-4 border-t border-[#262626] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {queue.length > 0 && !isProcessingQueue && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800/80 hover:bg-neutral-800 text-xs font-medium text-neutral-300 hover:text-white border border-neutral-700/60 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm tệp</span>
              </button>
            )}

            {queue.length > 0 && !isProcessingQueue && completedFiles < totalFiles && (
              <button
                type="button"
                onClick={() => setQueue([])}
                className="px-3 py-1.5 rounded-lg text-neutral-400 hover:text-red-400 text-xs font-medium transition-colors"
              >
                Xóa tất cả
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {/* Retry All Failed Button */}
            {hasErrors && !isProcessingQueue && (
              <button
                type="button"
                onClick={startQueueUpload}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 hover:text-amber-300 border border-amber-500/30 text-xs font-semibold transition-all active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Thử lại các tệp lỗi ({errorFiles})</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-300 transition-colors"
            >
              {completedFiles === totalFiles && totalFiles > 0 ? 'Đóng' : 'Hủy'}
            </button>

            {queue.length > 0 && !isProcessingQueue && completedFiles < totalFiles && !hasErrors && (
              <button
                type="button"
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
                type="button"
                onClick={handlePause}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600/80 hover:bg-amber-600 text-xs font-semibold text-white transition-all shadow-lg shadow-amber-600/25 active:scale-95"
              >
                <Pause className="w-4 h-4" />
                <span>Tạm dừng</span>
              </button>
            )}

            {isProcessingQueue && isQueuePaused && (
              <button
                type="button"
                onClick={handleResume}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-all shadow-lg shadow-emerald-600/25 active:scale-95"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Tiếp tục</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
