'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen';
import Video from 'yet-another-react-lightbox/plugins/video';
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails';
import Download from 'yet-another-react-lightbox/plugins/download';

import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/thumbnails.css';

import { DriveMediaItem } from '@/lib/types';
import {
  getLightboxPreviewUrl,
  getVideoStreamingUrl,
  getOriginalDownloadUrl,
} from '@/lib/thumbnail';

interface LightboxModalProps {
  items: DriveMediaItem[];
  currentIndex: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

export function LightboxModal({
  items,
  currentIndex,
  onClose,
  onIndexChange,
}: LightboxModalProps) {
  const isOpen = currentIndex !== null && currentIndex >= 0;
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);

  // Convert DriveMediaItems to yet-another-react-lightbox Slide format
  const slides = useMemo(() => {
    return items.map((item) => {
      const isVideo = item.mimeType.startsWith('video/');
      const previewUrl = getLightboxPreviewUrl(item.thumbnailUrl, item.id, 2048);
      const downloadUrl = getOriginalDownloadUrl(item.id);

      if (isVideo) {
        return {
          type: 'video' as const,
          title: item.name,
          description: `${(item.size / (1024 * 1024)).toFixed(1)} MB`,
          poster: previewUrl,
          width: item.width || 1920,
          height: item.height || 1080,
          sources: [
            {
              src: getVideoStreamingUrl(item.id),
              type: item.mimeType || 'video/mp4',
            },
          ],
          download: {
            url: downloadUrl,
            filename: item.name,
          },
        };
      }

      return {
        type: 'image' as const,
        src: previewUrl,
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
      // Space: Play/Pause video if currently active
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
      slides={slides}
      plugins={[Zoom, Fullscreen, Video, Thumbnails, Download]}
      on={{
        view: ({ index }) => onIndexChange(index),
      }}
      video={{
        controls: true,
        playsInline: true,
        autoPlay: true,
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
