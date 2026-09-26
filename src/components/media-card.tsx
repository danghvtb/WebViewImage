'use client';

import React, { useState, useRef, useEffect } from 'react';
import { DriveMediaItem } from '@/lib/types';
import {
  getGridThumbnailUrl,
  getVideoStreamingUrl,
  getOriginalDownloadUrl,
  formatBytes,
  formatDuration,
} from '@/lib/thumbnail';
import { Play, Download, Eye, Film, Image as ImageIcon, Trash2, Loader2, Check } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/use-auth-store';
import { useMediaStore } from '@/store/use-media-store';
import { deleteDriveFile } from '@/lib/client-drive';
import { localDB } from '@/lib/indexed-db';

interface MediaCardProps {
  item: DriveMediaItem;
  index: number;
  allItemIds?: string[];
  onOpenLightbox: (index: number) => void;
}

export const MediaCard = React.memo(function MediaCard({
  item,
  index,
  allItemIds,
  onOpenLightbox,
}: MediaCardProps) {
  const queryClient = useQueryClient();
  const { accessToken } = useAuthStore();
  const { selectedFileIds, toggleSelect, selectRange } = useMediaStore();

  const isSelected = selectedFileIds.includes(item.id);
  const isSelectionActive = selectedFileIds.length > 0;

  const [imageLoaded, setImageLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isVideo = item.mimeType.startsWith('video/');
  const thumbnailUrl = getGridThumbnailUrl(item.thumbnailUrl, item.id, 500, 500);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Bạn có chắc chắn muốn xóa "${item.name}" khỏi Google Drive?`)) {
      return;
    }

    try {
      setIsDeleting(true);
      if (accessToken) {
        await deleteDriveFile(item.id, accessToken);
      } else {
        await localDB.deleteFile(item.id);
      }
      queryClient.invalidateQueries({ queryKey: ['files'] });
    } catch (err: any) {
      alert(`Xóa file thất bại: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle video hover preview with small debounce to prevent unnecessary stream requests
  useEffect(() => {
    if (!isVideo) return;

    if (isHovered) {
      hoverTimeoutRef.current = setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
          videoRef.current.play().catch(() => {
            // Autoplay policy or abort
          });
        }
      }, 250);
    } else {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }

    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, [isHovered, isVideo]);

  const handleCardClick = (e: React.MouseEvent) => {
    // If Shift key is pressed and item list available: select range
    if (e.shiftKey && allItemIds) {
      e.preventDefault();
      selectRange(index, allItemIds);
      return;
    }

    // If Ctrl/Cmd is pressed or multi-select is already active: toggle selection
    if (e.ctrlKey || e.metaKey || isSelectionActive) {
      e.preventDefault();
      toggleSelect(item.id, index);
      return;
    }

    // Normal click: open Lightbox HD viewer
    onOpenLightbox(index);
  };

  return (
    <div
      className={`group relative aspect-square w-full overflow-hidden rounded-xl bg-[#171717] border transition-all duration-200 select-none cursor-pointer ${
        isSelected
          ? 'border-blue-500 ring-2 ring-blue-500/50 shadow-xl shadow-blue-500/20 scale-[0.98]'
          : 'border-[#262626] hover:border-neutral-500/50 hover:shadow-xl hover:shadow-black/50'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleCardClick}
    >
      {/* Smart Selection Checkbox Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (e.shiftKey && allItemIds) {
            selectRange(index, allItemIds);
          } else {
            toggleSelect(item.id, index);
          }
        }}
        title={isSelected ? 'Bỏ chọn' : 'Chọn mục này'}
        className={`absolute top-2 left-2 z-30 w-7 h-7 sm:w-6 sm:h-6 rounded-lg flex items-center justify-center transition-all ${
          isSelected
            ? 'bg-blue-600 text-white shadow-md shadow-blue-600/50 ring-2 ring-white/50 scale-105'
            : isSelectionActive
            ? 'bg-black/80 text-white border border-white/50 shadow-md'
            : 'bg-black/50 text-white/70 border border-white/30 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 hover:border-white hover:text-white'
        }`}
      >
        {isSelected ? (
          <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5 stroke-[3]" />
        ) : (
          <div className="w-2 h-2 sm:w-1.5 sm:h-1.5 rounded-full bg-white/60 group-hover:bg-white" />
        )}
      </button>

      {/* Skeleton Loading & Blur Placeholder */}
      {!imageLoaded && !imageError && (
        <div className="absolute inset-0 bg-neutral-900 animate-pulse flex items-center justify-center">
          {isVideo ? (
            <Film className="w-8 h-8 text-neutral-700 animate-pulse" />
          ) : (
            <ImageIcon className="w-8 h-8 text-neutral-700 animate-pulse" />
          )}
        </div>
      )}

      {/* Main Thumbnail Image */}
      {!imageError ? (
        <img
          src={thumbnailUrl}
          alt={item.name}
          loading="lazy"
          decoding="async"
          onLoad={() => setImageLoaded(true)}
          onError={() => {
            setImageError(true);
            setImageLoaded(true);
          }}
          className={`h-full w-full object-cover transition-all duration-500 group-hover:scale-105 ${
            imageLoaded ? 'opacity-100 filter-none' : 'opacity-0 blur-md'
          }`}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 text-neutral-500 p-4 text-center">
          {isVideo ? <Film className="w-10 h-10 mb-2" /> : <ImageIcon className="w-10 h-10 mb-2" />}
          <span className="text-xs line-clamp-2">{item.name}</span>
        </div>
      )}

      {/* Video Hover Preview (HTTP 206 stream muted) */}
      {isVideo && (
        <video
          ref={videoRef}
          src={getVideoStreamingUrl(item.id)}
          muted
          playsInline
          loop
          preload="none"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 pointer-events-none ${
            isHovered ? 'opacity-100 z-10' : 'opacity-0 -z-10'
          }`}
        />
      )}

      {/* Gradient Vignette Overlay on Hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 flex flex-col justify-between p-3">
        {/* Top Info Bar */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-black/60 backdrop-blur-md text-neutral-300 border border-white/10">
            {formatBytes(item.size)}
          </span>

          <div className="flex items-center gap-1.5">
            <a
              href={getOriginalDownloadUrl(item.id)}
              download={item.name}
              onClick={(e) => e.stopPropagation()}
              title="Tải file gốc"
              className="p-1.5 rounded-full bg-black/60 backdrop-blur-md text-white/90 hover:text-white hover:bg-black/90 transition-colors border border-white/10"
            >
              <Download className="w-3.5 h-3.5" />
            </a>

            <button
              onClick={handleDelete}
              disabled={isDeleting}
              title="Xóa tệp khỏi Google Drive"
              className="p-1.5 rounded-full bg-black/60 backdrop-blur-md text-neutral-300 hover:text-red-400 hover:bg-red-950/70 transition-colors border border-white/10 disabled:opacity-50"
            >
              {isDeleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Bottom Title Bar */}
        <div>
          <p className="text-xs font-medium text-white truncate drop-shadow-md mb-1">
            {item.name}
          </p>
          <div className="flex items-center gap-2 text-[10px] text-neutral-400">
            {item.width && item.height && (
              <span>
                {item.width} × {item.height}
              </span>
            )}
            <span>•</span>
            <span>{new Date(item.createdTime).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Video Badge (Always visible on video items when not hovered) */}
      {isVideo && (
        <div
          className={`absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur-md text-[11px] font-medium text-white flex items-center gap-1 border border-white/10 z-20 transition-opacity duration-200 ${
            isHovered ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <Play className="w-3 h-3 fill-white" />
          <span>{formatDuration(item.durationMillis) || 'VIDEO'}</span>
        </div>
      )}
    </div>
  );
});
