'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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
  ExternalLink,
  Loader2,
  Film,
  Zap,
  Tv,
  AlertCircle,
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
 * True edge-to-edge cinema video player slide supporting progressive HTTP 206 streaming
 * with native HTML5 controls on mobile/desktop, auto-hiding overlay, zero blur obscuration,
 * and seamless Google Drive player fallback.
 */
function DriveVideoSlide({
  slide,
  accessToken,
  isMobile,
}: {
  slide: VideoSlideData;
  accessToken: string | null;
  isMobile: boolean;
}) {
  // Always default to 'stream' (clean HTML5 video player with progressive stream)
  const [mode, setMode] = useState<'stream' | 'drive'>('stream');
  const [isBuffering, setIsBuffering] = useState(false);
  const [isIframeLoading, setIsIframeLoading] = useState(true);
  const [hasStreamError, setHasStreamError] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  const scheduleHideOverlay = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShowOverlay(false);
      }
    }, 3000);
  }, []);

  const handleUserInteraction = useCallback(() => {
    setShowOverlay(true);
    scheduleHideOverlay();
  }, [scheduleHideOverlay]);

  const toggleOverlay = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // If target is an interactive element (button or link), let it pass
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.closest('button') || target.tagName === 'A') {
      return;
    }
    setShowOverlay((prev) => {
      const next = !prev;
      if (next) {
        scheduleHideOverlay();
      }
      return next;
    });
  }, [scheduleHideOverlay]);

  const handleOpenGoogleDrive = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    window.open(`https://drive.google.com/file/d/${slide.fileId}/view`, '_blank');
  }, [slide.fileId]);

  const handleStreamError = useCallback(() => {
    console.warn('[VideoPlayer] Stream error occurred, showing recovery card');
    setHasStreamError(true);
    setIsBuffering(false);
  }, []);

  return (
    <div
      className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden select-none"
      onClick={toggleOverlay}
      onMouseMove={handleUserInteraction}
      onTouchStart={handleUserInteraction}
    >
      {/* Floating Top Header - Sleek, non-overlapping, auto-hiding */}
      <div
        className={`absolute top-0 inset-x-0 z-30 flex items-center justify-between gap-2 p-2.5 sm:p-4 bg-gradient-to-b from-black/85 via-black/40 to-transparent transition-all duration-300 pointer-events-auto pr-24 sm:pr-40 ${
          showOverlay ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: Video details */}
        <div className="flex items-center gap-2 min-w-0">
          <Film className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="font-medium text-xs sm:text-sm text-white truncate max-w-[130px] sm:max-w-xs md:max-w-md">
            {slide.name}
          </span>
          <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-neutral-300 shrink-0">
            {formatBytes(slide.size)}
          </span>
          {slide.durationMillis && (
            <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-medium shrink-0">
              {formatDuration(slide.durationMillis)}
            </span>
          )}
        </div>

        {/* Right: Quick actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Mode Switcher */}
          {mode === 'stream' ? (
            <button
              type="button"
              onClick={() => {
                setHasStreamError(false);
                setMode('drive');
              }}
              title="Chuyển sang Google Player"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/30 text-neutral-200 transition-colors text-[11px]"
            >
              <Tv className="w-3.5 h-3.5 text-neutral-300" />
              <span className="hidden md:inline">Google Player</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setHasStreamError(false);
                setMode('stream');
              }}
              title="Chuyển sang Phát trực tiếp"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/90 hover:bg-blue-600 active:bg-blue-700 text-white transition-colors text-[11px]"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span className="hidden md:inline">Phát trực tiếp</span>
            </button>
          )}

          {/* Open Google Drive in new tab */}
          <button
            type="button"
            onClick={handleOpenGoogleDrive}
            title="Mở trên Google Drive"
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/30 text-neutral-200 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Video Viewport - 100% full screen edge-to-edge */}
      <div className="w-full h-full flex items-center justify-center overflow-hidden">
        {mode === 'stream' ? (
          <>
            {/* Non-blur, clean buffering indicator */}
            {isBuffering && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-black/75 border border-white/10 text-white shadow-2xl">
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                  <span className="text-xs font-medium">Đang tải video...</span>
                </div>
              </div>
            )}

            {/* Error recovery card */}
            {hasStreamError && (
              <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/85 z-20 pointer-events-auto">
                <div className="max-w-sm w-full p-5 rounded-2xl bg-neutral-900 border border-white/10 text-center space-y-3.5 shadow-2xl">
                  <div className="w-11 h-11 rounded-full bg-amber-500/15 text-amber-400 mx-auto flex items-center justify-center">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Không thể phát trực tiếp</h3>
                    <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                      Trình duyệt chưa hỗ trợ codec video này. Bạn có thể xem ngay bằng Google Player.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setHasStreamError(false);
                        setMode('drive');
                      }}
                      className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Tv className="w-3.5 h-3.5" />
                      <span>Xem bằng Google Player</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenGoogleDrive()}
                      className="w-full py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-neutral-200 text-xs font-medium transition-colors"
                    >
                      Mở trên Google Drive
                    </button>
                  </div>
                </div>
              </div>
            )}

            <video
              ref={videoRef}
              src={progressiveStreamUrl}
              poster={slide.poster}
              controls
              playsInline
              webkit-playsinline="true"
              x5-playsinline="true"
              preload="metadata"
              onWaiting={() => setIsBuffering(true)}
              onCanPlay={() => {
                setIsBuffering(false);
                setHasStreamError(false);
              }}
              onLoadedData={() => setIsBuffering(false)}
              onPlaying={() => {
                setIsBuffering(false);
                setHasStreamError(false);
                scheduleHideOverlay();
              }}
              onPause={() => setShowOverlay(true)}
              onError={handleStreamError}
              className="w-full h-full max-h-[100dvh] max-w-[100vw] object-contain bg-black outline-none"
            />
          </>
        ) : (
          /* Google Drive Embedded Player */
          <div className="w-full h-full relative flex items-center justify-center bg-black">
            {isIframeLoading && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-black/75 border border-white/10 text-white shadow-2xl">
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                  <span className="text-xs font-medium">Đang khởi chạy Google Player...</span>
                </div>
              </div>
            )}

            <iframe
              src={`https://drive.google.com/file/d/${slide.fileId}/preview`}
              title={slide.name}
              className="w-full h-full max-h-[100dvh] max-w-[100vw] border-0 bg-black"
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              allowFullScreen
              onLoad={() => setIsIframeLoading(false)}
            />
          </div>
        )}
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

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const updateMobile = () => {
      setIsMobile(
        typeof window !== 'undefined' &&
          (window.innerWidth < 768 ||
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent))
      );
    };
    updateMobile();
    window.addEventListener('resize', updateMobile);
    return () => window.removeEventListener('resize', updateMobile);
  }, []);

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
        // On mobile, hide navigation chevrons to prevent accidental clicks and screen clutter
        buttonPrev: isMobile ? () => null : undefined,
        buttonNext: isMobile ? () => null : undefined,
        slide: ({ slide, offset }) => {
          if ((slide as any).type === 'drive-video') {
            const videoSlide = slide as unknown as VideoSlideData;
            if (offset !== 0) {
              // Preload preview poster for adjacent slides without firing multiple network streams
              return (
                <div className="relative w-full h-full flex items-center justify-center bg-black">
                  <img
                    src={videoSlide.poster}
                    alt={videoSlide.name}
                    className="w-full h-full max-h-[100dvh] max-w-[100vw] object-contain opacity-70 pointer-events-none select-none"
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-14 h-14 rounded-full bg-blue-600/80 flex items-center justify-center shadow-xl shadow-blue-600/40 border border-white/20">
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
                isMobile={isMobile}
              />
            );
          }
          return undefined; // default image slide renderer
        },
      }}
      carousel={{
        padding: 0,
        spacing: 0,
      }}
      zoom={{
        maxZoomPixelRatio: 3,
        zoomInMultiplier: 1.5,
      }}
      thumbnails={{
        position: 'bottom',
        hidden: isMobile, // On mobile, keep hidden by default to maximize video viewport
        showToggle: true,
        width: isMobile ? 70 : 100,
        height: isMobile ? 45 : 60,
        border: 2,
        borderRadius: 6,
        padding: 2,
        gap: 6,
      }}
      animation={{
        fade: 200,
        swipe: 250,
      }}
      styles={{
        container: { backgroundColor: 'rgba(5, 5, 5, 0.98)' },
        thumbnailsContainer: { backgroundColor: 'rgba(10, 10, 10, 0.9)' },
        slide: { padding: 0 },
      }}
    />
  );
}
