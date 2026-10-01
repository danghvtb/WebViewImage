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
  Loader2,
  Film,
  Zap,
  Tv,
  Download as DownloadIcon,
  X,
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
 * True edge-to-edge cinema video player slide.
 * - On Mobile: Defaults to Google Drive Embedded Player which supports 100% of video formats/codecs
 *   without CORS, WebKit Range restrictions, or 404 errors on static hosts.
 * - On Desktop: Supports progressive HTTP 206 stream with instant auto-fallback to Google Player if any stream issue arises.
 * - Screen size is 100% maximized edge-to-edge without padding or aspect-ratio caps.
 * - Top-left Close button: ergonomically placed on top-left (like YouTube/TikTok/Reels), eliminating all overlap
 *   with Google Drive's top-right pop-out button.
 * - Toolbar clutter eliminated: no overlapping zoom/duplicate icons.
 * - Overlays auto-hide so no buttons block the video while watching.
 */
function DriveVideoSlide({
  slide,
  accessToken,
  isMobile,
  onClose,
}: {
  slide: VideoSlideData;
  accessToken: string | null;
  isMobile: boolean;
  onClose: () => void;
}) {
  // Mobile devices reliably use Google Drive Player directly without CORS/Range/Codec issues on static host.
  // Desktop defaults to progressive stream, and auto-falls back to Google Player if stream fails.
  const [mode, setMode] = useState<'stream' | 'drive'>(() => {
    if (typeof window !== 'undefined') {
      const isMob =
        window.innerWidth < 768 ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      return isMob ? 'drive' : 'stream';
    }
    return 'drive';
  });

  const [isBuffering, setIsBuffering] = useState(false);
  const [isIframeLoading, setIsIframeLoading] = useState(true);
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

  // Clear iframe loading spinner automatically after 1.8s
  useEffect(() => {
    if (mode === 'drive') {
      setIsIframeLoading(true);
      const timer = setTimeout(() => setIsIframeLoading(false), 1800);
      return () => clearTimeout(timer);
    }
  }, [mode, slide.fileId]);

  const scheduleHideOverlay = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => {
      // In drive mode (iframe) or when HTML5 video is playing, auto-hide overlay so user can watch unobstructed
      if (mode === 'drive' || (videoRef.current && !videoRef.current.paused)) {
        setShowOverlay(false);
      }
    }, 3000);
  }, [mode]);

  useEffect(() => {
    // Auto-hide overlay after 3 seconds on mount
    scheduleHideOverlay();
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [scheduleHideOverlay]);

  const handleUserInteraction = useCallback(() => {
    setShowOverlay(true);
    scheduleHideOverlay();
  }, [scheduleHideOverlay]);

  const toggleOverlay = useCallback((e: React.MouseEvent | React.TouchEvent) => {
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

  const handleDownload = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      downloadDriveFile(slide.fileId, slide.name, accessToken);
    },
    [slide.fileId, slide.name, accessToken]
  );

  // If progressive stream throws error, automatically and silently fall back to Google Drive Player
  const handleStreamError = useCallback(() => {
    console.warn('[VideoPlayer] Progressive stream error, auto-fallback to Google Drive Player');
    setMode('drive');
    setIsBuffering(false);
  }, []);

  return (
    <div
      className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden select-none"
      onClick={toggleOverlay}
      onMouseMove={handleUserInteraction}
      onTouchStart={handleUserInteraction}
    >
      {/* Sleek Floating Top Header Overlay - Auto hides when watching */}
      <div
        className={`absolute top-0 inset-x-0 z-40 flex items-center justify-between gap-2 p-2.5 sm:p-3 bg-gradient-to-b from-black/85 via-black/45 to-transparent transition-all duration-300 pointer-events-auto ${
          showOverlay ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: Clearance for Top-Left Close Button (pl-14 sm:pl-16) + File Name & Duration */}
        <div className="flex items-center gap-2 min-w-0 pl-14 sm:pl-16 pr-2">
          <Film className="w-4 h-4 text-blue-400 shrink-0 hidden sm:inline" />
          <span className="font-medium text-xs sm:text-sm text-white truncate max-w-[140px] xs:max-w-[180px] sm:max-w-xs md:max-w-md">
            {slide.name}
          </span>
          {slide.durationMillis && (
            <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-mono shrink-0">
              {formatDuration(slide.durationMillis)}
            </span>
          )}
          <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-neutral-300 shrink-0">
            {formatBytes(slide.size)}
          </span>
        </div>

        {/* Right: Quick actions with 56px margin reserved so Google Drive's iframe popout button [↗] is never covered */}
        <div className="flex items-center gap-2 shrink-0 mr-14 sm:mr-16">
          {/* Mode Switcher - only shown on desktop */}
          {!isMobile && (
            mode === 'stream' ? (
              <button
                type="button"
                onClick={() => setMode('drive')}
                title="Chuyển sang Google Player"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-neutral-900/85 hover:bg-neutral-800 active:scale-95 border border-white/20 text-neutral-200 transition-all text-[11px] shadow-lg"
              >
                <Tv className="w-3.5 h-3.5 text-neutral-300" />
                <span className="hidden sm:inline">Google Player</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setMode('stream')}
                title="Thử phát trực tiếp qua HTML5"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-neutral-900/85 hover:bg-neutral-800 active:scale-95 border border-white/20 text-neutral-200 transition-all text-[11px] shadow-lg"
              >
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                <span className="hidden sm:inline">Phát trực tiếp</span>
              </button>
            )
          )}

          {/* Download button */}
          <button
            type="button"
            onClick={handleDownload}
            title="Tải video về máy"
            className="w-8 h-8 rounded-full bg-neutral-900/85 hover:bg-neutral-800 active:scale-95 border border-white/20 flex items-center justify-center text-white shadow-lg shrink-0 transition-all"
          >
            <DownloadIcon className="w-4 h-4 text-neutral-200" />
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
              onCanPlay={() => setIsBuffering(false)}
              onLoadedData={() => setIsBuffering(false)}
              onPlaying={() => {
                setIsBuffering(false);
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
                  <span className="text-xs font-medium">Đang mở trình phát...</span>
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

  // Determine if currently viewed slide is a video
  const currentItem = currentIndex !== null && currentIndex >= 0 ? items[currentIndex] : null;
  const isCurrentVideo = Boolean(currentItem?.mimeType?.startsWith('video/'));

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
      className={isCurrentVideo ? 'yarl-video-mode' : ''}
      plugins={[Zoom, Fullscreen, Thumbnails, Download]}
      on={{
        view: ({ index }) => onIndexChange(index),
      }}
      render={{
        // Reliable custom Close Button (on video mode, positioned at top-left via .yarl-video-mode CSS)
        buttonClose: () => (
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            title="Đóng (Esc)"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/80 hover:bg-black active:scale-90 border border-white/20 flex items-center justify-center text-white shadow-2xl transition-all"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        ),
        // On video slides, suppress unnecessary buttons to keep video view completely clean
        buttonZoom: isCurrentVideo ? () => null : undefined,
        buttonFullscreen: isCurrentVideo ? () => null : undefined,
        buttonDownload: isCurrentVideo ? () => null : undefined,
        buttonThumbnails: isCurrentVideo ? () => null : undefined,
        // On mobile or video, hide navigation chevrons to prevent accidental clicks
        buttonPrev: isMobile || isCurrentVideo ? () => null : undefined,
        buttonNext: isMobile || isCurrentVideo ? () => null : undefined,
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
                onClose={onClose}
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
        hidden: isMobile || isCurrentVideo,
        showToggle: !isCurrentVideo,
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
