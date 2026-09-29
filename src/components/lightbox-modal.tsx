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
  Zap,
  AlertCircle,
  RefreshCw,
  Tv,
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
 * High-performance cinema video player slide supporting progressive HTTP 206 streaming
 * (starts playing immediately, buffering data as you watch) and Google Drive Preview fallback.
 */
function DriveVideoSlide({
  slide,
  accessToken,
}: {
  slide: VideoSlideData;
  accessToken: string | null;
}) {
  const [mode, setMode] = useState<'stream' | 'drive'>('stream');
  const [isStreamingLoading, setIsStreamingLoading] = useState(true);
  const [isIframeLoading, setIsIframeLoading] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const progressiveStreamUrl = useMemo(() => {
    return `${basePath}/api-stream/${slide.fileId}?token=${encodeURIComponent(
      accessToken || ''
    )}&mime=${encodeURIComponent(slide.mimeType || 'video/mp4')}`;
  }, [basePath, slide.fileId, accessToken, slide.mimeType]);

  // Ensure file has public reader permissions silently in the background
  useEffect(() => {
    if (accessToken && slide.fileId) {
      makeFolderOrFilePublic(slide.fileId, accessToken).catch(() => {});
    }
  }, [slide.fileId, accessToken]);

  const handleDownload = () => {
    downloadDriveFile(slide.fileId, slide.name, accessToken);
  };

  const handleOpenGoogleDrive = () => {
    window.open(`https://drive.google.com/file/d/${slide.fileId}/view`, '_blank');
  };

  const handleStreamError = () => {
    console.warn('[VideoPlayer] Progressive stream error, falling back to Google Drive embed player');
    setStreamError('Không thể nạp luồng phát trực tiếp, tự động chuyển sang Google Drive Player.');
    setMode('drive');
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
          {mode === 'stream' ? (
            <button
              type="button"
              onClick={() => setMode('drive')}
              title="Chuyển sang trình phát nhúng Google Drive"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-200 transition-colors text-[11px]"
            >
              <Tv className="w-3.5 h-3.5 text-neutral-300" />
              <span>Google Player</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setStreamError(null);
                setMode('stream');
              }}
              title="Chuyển sang trình phát trực tiếp tải đến đâu xem đến đấy"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white transition-colors text-[11px]"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Phát trực tiếp</span>
            </button>
          )}

          {/* Open in Google Drive tab */}
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

      {/* Main Video Viewport Area */}
      <div className="relative w-full aspect-video max-h-[72vh] sm:max-h-[76vh] flex items-center justify-center rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl">
        {mode === 'stream' ? (
          /* Progressive Stream Player (Loads and plays immediately, buffering chunks as you watch) */
          <>
            {isStreamingLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm z-10 pointer-events-none space-y-2">
                <Loader2 className="w-9 h-9 text-blue-500 animate-spin" />
                <span className="text-xs text-neutral-300 font-medium">Đang phát trực tiếp video...</span>
                <span className="text-[11px] text-neutral-500">Tải đến đâu xem luôn đến đấy</span>
              </div>
            )}

            <video
              ref={videoRef}
              src={progressiveStreamUrl}
              poster={slide.poster}
              controls
              autoPlay
              playsInline
              preload="auto"
              onLoadStart={() => setIsStreamingLoading(true)}
              onLoadedData={() => setIsStreamingLoading(false)}
              onCanPlay={() => setIsStreamingLoading(false)}
              onPlaying={() => setIsStreamingLoading(false)}
              onError={handleStreamError}
              className="w-full h-full object-contain bg-black"
            />
          </>
        ) : (
          /* Google Drive Iframe Player Fallback */
          <>
            {isIframeLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-10 space-y-2">
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
        )}
      </div>

      {/* Helper Footer Status */}
      <div className="mt-2 text-[11px] text-neutral-400 text-center flex flex-wrap items-center justify-center gap-2">
        {mode === 'stream' ? (
          <span className="inline-flex items-center gap-1 text-emerald-400">
            <Zap className="w-3 h-3 text-amber-400" />
            <span>Phát luồng trực tiếp (Xem ngay không cần chờ tải hết)</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-neutral-300">
            <Tv className="w-3 h-3 text-blue-400" />
            <span>Trình phát Google Drive</span>
          </span>
        )}
        <span>•</span>
        <button
          type="button"
          onClick={() => setMode(mode === 'stream' ? 'drive' : 'stream')}
          className="text-blue-400 hover:underline"
        >
          {mode === 'stream' ? 'Đổi sang Google Player' : 'Đổi sang Phát trực tiếp'}
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
              // Preload preview poster for adjacent slides without firing multiple network streams
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
