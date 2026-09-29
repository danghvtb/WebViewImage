'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen';
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails';
import Download from 'yet-another-react-lightbox/plugins/download';

import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/thumbnails.css';

import { DriveMediaItem } from '@/lib/types';
import {
  getLightboxPreviewUrl,
  getOriginalDownloadUrl,
  formatBytes,
  formatDuration,
} from '@/lib/thumbnail';
import { downloadDriveFile, makeFolderOrFilePublic } from '@/lib/client-drive';
import { useAuthStore } from '@/store/use-auth-store';
import {
  Play,
  Download as DownloadIcon,
  ExternalLink,
  Loader2,
  Film,
  Sparkles,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface LightboxModalProps {
  items: DriveMediaItem[];
  currentIndex: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

interface VideoSlideData {
  type: 'drive-video';
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  durationMillis: number | null;
  poster: string;
  thumbnail: string;
  src: string;
  download: {
    url: string;
    filename: string;
  };
}

/**
 * Custom cinema video player slide supporting both Google Drive Preview stream
 * and client-side buffered HTML5 video playback with token authentication.
 */
function DriveVideoSlide({
  slide,
  accessToken,
}: {
  slide: VideoSlideData;
  accessToken: string | null;
}) {
  const [mode, setMode] = useState<'drive' | 'html5'>('drive');
  const [isIframeLoading, setIsIframeLoading] = useState(true);
  const [isHtml5Loading, setIsHtml5Loading] = useState(false);
  const [bufferProgress, setBufferProgress] = useState(0);
  const [bufferedBytes, setBufferedBytes] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [html5Error, setHtml5Error] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Silently ensure file has reader permission for anyone with link
  useEffect(() => {
    if (accessToken && slide.fileId) {
      makeFolderOrFilePublic(slide.fileId, accessToken).catch(() => {});
    }
  }, [slide.fileId, accessToken]);

  // Clean up buffered blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [blobUrl]);

  // Start buffering video for HTML5 native playback
  const handleStartHtml5 = async () => {
    setMode('html5');
    if (blobUrl) return; // Already cached in memory

    try {
      setIsHtml5Loading(true);
      setHtml5Error(null);
      setBufferProgress(0);
      setBufferedBytes(0);

      abortControllerRef.current = new AbortController();

      const headers: HeadersInit = {};
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${slide.fileId}?alt=media`,
        {
          headers,
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        throw new Error(`Google API trả về mã lỗi: ${response.status}`);
      }

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : slide.size || 0;

      if (!response.body) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setIsHtml5Loading(false);
        return;
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let receivedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedBytes += value.length;
        setBufferedBytes(receivedBytes);
        if (total > 0) {
          setBufferProgress(Math.min(100, Math.round((receivedBytes / total) * 100)));
        }
      }

      const blob = new Blob(chunks as any[], { type: slide.mimeType || 'video/mp4' });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('[HTML5Player] Buffer error:', err);
        setHtml5Error(err.message || 'Không thể tải video vào bộ nhớ đệm');
      }
    } finally {
      setIsHtml5Loading(false);
    }
  };

  const handleCancelBuffer = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsHtml5Loading(false);
    setMode('drive');
  };

  const handleDownload = () => {
    downloadDriveFile(slide.fileId, slide.name, accessToken);
  };

  const handleOpenGoogleDrive = () => {
    window.open(`https://drive.google.com/file/d/${slide.fileId}/view`, '_blank');
  };

  return (
    <div className="relative flex flex-col items-center justify-center w-full h-full max-w-5xl mx-auto px-2 sm:px-6 py-2 select-none">
      {/* Top Header Control Strip */}
      <div className="w-full flex flex-wrap items-center justify-between gap-2 mb-2 px-3 py-2 bg-neutral-900/80 backdrop-blur-md rounded-xl border border-white/10 text-white text-xs z-30">
        <div className="flex items-center gap-2 min-w-0">
          <Film className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="font-medium truncate max-w-[200px] sm:max-w-xs md:max-w-md">
            {slide.name}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-neutral-300 shrink-0">
            {formatBytes(slide.size)}
          </span>
          {slide.durationMillis && (
            <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] shrink-0">
              {formatDuration(slide.durationMillis)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          {/* Mode Switcher */}
          {mode === 'drive' ? (
            <button
              type="button"
              onClick={handleStartHtml5}
              title="Chuyển sang trình phát HTML5 tải trực tiếp vào bộ đệm"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-200 transition-colors text-[11px]"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Phát HTML5</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMode('drive')}
              title="Quay lại trình phát Google Drive"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white transition-colors text-[11px]"
            >
              <Film className="w-3 h-3" />
              <span>Phát Drive</span>
            </button>
          )}

          {/* Open in Drive tab */}
          <button
            type="button"
            onClick={handleOpenGoogleDrive}
            title="Mở video trong tab Google Drive mới"
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>

          {/* Download button */}
          <button
            type="button"
            onClick={handleDownload}
            title="Tải video về máy"
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white transition-colors"
          >
            <DownloadIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Player Display Area */}
      <div className="relative w-full aspect-video max-h-[72vh] sm:max-h-[76vh] flex items-center justify-center rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl">
        {mode === 'drive' ? (
          <>
            {/* Loading Indicator for Iframe */}
            {isIframeLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-10 space-y-3">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <span className="text-xs text-neutral-400">Đang khởi chạy trình phát Google Drive...</span>
              </div>
            )}

            <iframe
              src={`https://drive.google.com/file/d/${slide.fileId}/preview`}
              title={slide.name}
              className="w-full h-full border-0"
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              allowFullScreen
              onLoad={() => setIsIframeLoading(false)}
            />
          </>
        ) : (
          /* HTML5 Mode */
          <div className="w-full h-full flex flex-col items-center justify-center p-4">
            {isHtml5Loading ? (
              <div className="flex flex-col items-center justify-center p-6 bg-neutral-900/95 rounded-2xl border border-white/10 max-w-sm w-full text-center space-y-3 shadow-xl">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <div>
                  <h4 className="text-sm font-semibold text-white">Đang tải video vào bộ nhớ đệm</h4>
                  <p className="text-xs text-neutral-400 mt-0.5 truncate max-w-[260px]">{slide.name}</p>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-neutral-800 rounded-full h-2 overflow-hidden border border-white/5">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-200"
                    style={{ width: `${bufferProgress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between w-full text-[11px] text-neutral-400 font-mono">
                  <span>{bufferProgress}%</span>
                  <span>
                    {formatBytes(bufferedBytes)} / {formatBytes(slide.size)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCancelBuffer}
                  className="text-xs text-neutral-400 hover:text-white underline pt-1"
                >
                  Hủy & quay lại Google Player
                </button>
              </div>
            ) : html5Error ? (
              <div className="flex flex-col items-center justify-center p-6 bg-neutral-900/95 rounded-2xl border border-red-500/20 max-w-sm w-full text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-red-400" />
                <div>
                  <h4 className="text-sm font-semibold text-white">Tải video không thành công</h4>
                  <p className="text-xs text-red-300 mt-1">{html5Error}</p>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleStartHtml5}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Thử lại</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('drive')}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-300 text-xs"
                  >
                    Google Player
                  </button>
                </div>
              </div>
            ) : blobUrl ? (
              <video
                src={blobUrl}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain rounded-xl"
              />
            ) : null}
          </div>
        )}
      </div>

      {/* Mobile Friendly Helper Note */}
      <div className="mt-2 text-[11px] text-neutral-400 text-center flex items-center justify-center gap-2">
        <span>Gặp sự cố phát?</span>
        <button
          type="button"
          onClick={handleStartHtml5}
          className="text-blue-400 hover:underline inline-flex items-center gap-0.5"
        >
          <Sparkles className="w-3 h-3 inline" />
          <span>Thử phát HTML5</span>
        </button>
        <span>•</span>
        <button
          type="button"
          onClick={handleOpenGoogleDrive}
          className="text-neutral-300 hover:text-white hover:underline inline-flex items-center gap-0.5"
        >
          <ExternalLink className="w-3 h-3 inline" />
          <span>Mở trên Google Drive</span>
        </button>
      </div>
    </div>
  );
}

export function LightboxModal({
  items,
  currentIndex,
  onClose,
  onIndexChange,
}: LightboxModalProps) {
  const isOpen = currentIndex !== null && currentIndex >= 0;
  const { accessToken } = useAuthStore();

  // Convert DriveMediaItems to yet-another-react-lightbox Slide format
  const slides = useMemo(() => {
    return items.map((item) => {
      const isVideo = item.mimeType.startsWith('video/');
      const previewUrl = getLightboxPreviewUrl(item.thumbnailUrl, item.id, 2048);
      const downloadUrl = getOriginalDownloadUrl(item.id);

      if (isVideo) {
        return {
          type: 'drive-video' as const,
          fileId: item.id,
          name: item.name,
          size: item.size,
          mimeType: item.mimeType,
          durationMillis: item.durationMillis,
          poster: previewUrl,
          thumbnail: previewUrl,
          src: previewUrl,
          download: {
            url: downloadUrl,
            filename: item.name,
          },
        };
      }

      return {
        type: 'image' as const,
        src: previewUrl,
        thumbnail: previewUrl,
        alt: item.name,
        width: item.width || 2048,
        height: item.height || 1536,
        title: item.name,
        download: {
          url: downloadUrl,
          filename: item.name,
        },
      };
    });
  }, [items]);

  // Global Keyboard Navigation (Space for play/pause, F for Fullscreen, Esc handled by lightbox)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Space: Play/Pause video if HTML5 video is currently active
      if (e.code === 'Space') {
        const videoEl = document.querySelector('.yarl__slide_current video') as HTMLVideoElement;
        if (videoEl) {
          e.preventDefault();
          if (videoEl.paused) {
            videoEl.play();
          } else {
            videoEl.pause();
          }
        }
      }

      // F key: Toggle Fullscreen
      if (e.key === 'f' || e.key === 'F') {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <Lightbox
      open={isOpen}
      close={onClose}
      index={currentIndex}
      slides={slides as any}
      plugins={[Zoom, Fullscreen, Thumbnails, Download]}
      on={{
        view: ({ index }) => onIndexChange(index),
      }}
      render={{
        slide: ({ slide, offset }) => {
          if ((slide as any).type === 'drive-video') {
            const videoSlide = slide as unknown as VideoSlideData;
            if (offset !== 0) {
              // Preload preview poster for adjacent slides without firing multiple iframes
              return (
                <div className="relative w-full h-full flex items-center justify-center p-4">
                  <img
                    src={videoSlide.poster}
                    alt={videoSlide.name}
                    className="max-w-full max-h-[75vh] object-contain rounded-xl opacity-60 pointer-events-none select-none"
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-14 h-14 rounded-full bg-blue-600/80 backdrop-blur-md flex items-center justify-center shadow-xl shadow-blue-600/40 border border-white/20">
                      <Play className="w-7 h-7 fill-white ml-0.5 text-white" />
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <DriveVideoSlide
                slide={videoSlide}
                accessToken={accessToken}
              />
            );
          }
          return undefined; // default image slide renderer
        },
      }}
      zoom={{
        maxZoomPixelRatio: 3,
        zoomInMultiplier: 1.5,
      }}
      thumbnails={{
        position: 'bottom',
        width: 100,
        height: 60,
        border: 2,
        borderRadius: 6,
        padding: 4,
        gap: 8,
      }}
      animation={{
        fade: 250,
        swipe: 300,
      }}
      styles={{
        container: { backgroundColor: 'rgba(5, 5, 5, 0.96)' },
        thumbnailsContainer: { backgroundColor: 'rgba(10, 10, 10, 0.85)' },
      }}
    />
  );
}
