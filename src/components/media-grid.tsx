'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMediaStore } from '@/store/use-media-store';
import { useAuthStore } from '@/store/use-auth-store';
import { DriveMediaItem } from '@/lib/types';
import { localDB } from '@/lib/indexed-db';
import { listDriveFolderMedia } from '@/lib/client-drive';
import { MediaCard } from './media-card';
import { Loader2, Upload, Sparkles, LogIn, FolderOpen, ZoomIn, ZoomOut } from 'lucide-react';

interface MediaGridProps {
  onOpenLightbox: (index: number) => void;
  onItemsLoaded?: (items: DriveMediaItem[]) => void;
}

export function MediaGrid({ onOpenLightbox, onItemsLoaded }: MediaGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const {
    columnsCount,
    columnDensity,
    mobileColumnsCount,
    setMobileColumnsCount,
    selectedFileIds,
    filter,
    searchQuery,
    setUploadModalOpen,
  } = useMediaStore();
  const { isLoggedIn, accessToken, currentFolder, login, setIsConfigModalOpen } = useAuthStore();

  const [windowWidth, setWindowWidth] = useState<number>(1200);
  const [pinchFeedback, setPinchFeedback] = useState<string | null>(null);
  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const initialDistanceRef = useRef<number | null>(null);
  const pinchTriggeredRef = useRef<boolean>(false);

  useEffect(() => {
    setWindowWidth(window.innerWidth);
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showPinchToast = useCallback((text: string) => {
    setPinchFeedback(text);
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => {
      setPinchFeedback(null);
    }, 1200);
  }, []);

  // Pinch-to-zoom gesture on touch devices to adjust columns without browser zoom conflict
  useEffect(() => {
    // 1. iOS Safari WebKit gesture events (completely intercepts native page viewport zoom)
    const handleGestureStart = (e: any) => {
      e.preventDefault();
      pinchTriggeredRef.current = false;
    };

    const handleGestureChange = (e: any) => {
      e.preventDefault();
      if (pinchTriggeredRef.current) return;

      const scale = e.scale;
      if (scale > 1.15) {
        // Pinch OUT -> Zoom IN -> Fewer columns (1 or 2)
        pinchTriggeredRef.current = true;
        setMobileColumnsCount((prev) => {
          const next = Math.max(1, prev - 1);
          showPinchToast(`Phóng to: ${next} cột`);
          return next;
        });
        setTimeout(() => {
          pinchTriggeredRef.current = false;
        }, 280);
      } else if (scale < 0.85) {
        // Pinch IN -> Zoom OUT -> More columns (3 or 4)
        pinchTriggeredRef.current = true;
        setMobileColumnsCount((prev) => {
          const next = Math.min(4, prev + 1);
          showPinchToast(`Thu nhỏ: ${next} cột`);
          return next;
        });
        setTimeout(() => {
          pinchTriggeredRef.current = false;
        }, 280);
      }
    };

    const handleGestureEnd = (e: any) => {
      e.preventDefault();
      pinchTriggeredRef.current = false;
    };

    // 2. Android Chrome & Standard Multi-Touch Handling (Attached to window)
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        initialDistanceRef.current = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        pinchTriggeredRef.current = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        // Always prevent default native browser zoom when 2+ fingers move
        if (e.cancelable) {
          e.preventDefault();
        }

        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

        // If distance was not captured on touchstart, initialize it now
        if (initialDistanceRef.current === null) {
          initialDistanceRef.current = currentDist;
          return;
        }

        const delta = currentDist - initialDistanceRef.current;
        const THRESHOLD = 22; // Responsive and smooth on all Android screen densities

        if (Math.abs(delta) > THRESHOLD && !pinchTriggeredRef.current) {
          pinchTriggeredRef.current = true;

          if (delta > 0) {
            // Fingers moving apart -> Zoom IN -> Fewer columns
            setMobileColumnsCount((prev) => {
              const next = Math.max(1, prev - 1);
              showPinchToast(`Phóng to: ${next} cột`);
              return next;
            });
          } else {
            // Fingers moving together -> Zoom OUT -> More columns
            setMobileColumnsCount((prev) => {
              const next = Math.min(4, prev + 1);
              showPinchToast(`Thu nhỏ: ${next} cột`);
              return next;
            });
          }

          initialDistanceRef.current = currentDist;
          setTimeout(() => {
            pinchTriggeredRef.current = false;
          }, 280);
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        initialDistanceRef.current = null;
        pinchTriggeredRef.current = false;
      }
    };

    // Attach to window so touches on any part of screen (images, cards, gaps) are captured
    window.addEventListener('gesturestart', handleGestureStart as any, { passive: false });
    window.addEventListener('gesturechange', handleGestureChange as any, { passive: false });
    window.addEventListener('gestureend', handleGestureEnd as any, { passive: false });

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('gesturestart', handleGestureStart as any);
      window.removeEventListener('gesturechange', handleGestureChange as any);
      window.removeEventListener('gestureend', handleGestureEnd as any);

      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [setMobileColumnsCount, showPinchToast]);

  // Responsive column count (mobile: custom mobileColumnsCount from pinch/toggle, tablet: 3, desktop: 4+)
  const activeColumns = useMemo(() => {
    if (windowWidth < 640) {
      return mobileColumnsCount;
    }
    if (windowWidth < 1024) {
      if (columnDensity === 'large') return 2;
      if (columnDensity === 'compact') return 4;
      return 3;
    }
    return columnsCount;
  }, [windowWidth, mobileColumnsCount, columnDensity, columnsCount]);

  // Query media items using Cache-First strategy:
  // 1. Read from IndexedDB immediately (instant 60fps)
  // 2. Fetch fresh items from Google Drive API if online
  const { data: allItems = [], isLoading, isError, error, refetch } = useQuery<DriveMediaItem[]>({
    queryKey: ['files', currentFolder?.id, isLoggedIn],
    queryFn: async () => {
      if (!isLoggedIn || !accessToken || !currentFolder) {
        // Fallback to local cached files or demo
        return localDB.getCachedFiles('demo-folder');
      }

      // Step 1: Read fast from local IndexedDB
      const cached = await localDB.getCachedFiles(currentFolder.id);

      // Step 2: Fetch fresh from Google Drive API in background
      try {
        const fresh = await listDriveFolderMedia(currentFolder.id, accessToken);
        return fresh.length > 0 ? fresh : cached;
      } catch (err) {
        console.warn('[MediaGrid] Could not fetch fresh media, using cache:', err);
        return cached;
      }
    },
  });

  // Client-side filtering and search
  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      // Type filter
      if (filter === 'image' && !item.mimeType.startsWith('image/')) return false;
      if (filter === 'video' && !item.mimeType.startsWith('video/')) return false;

      // Search query
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim();
        return item.name.toLowerCase().includes(q);
      }

      return true;
    });
  }, [allItems, filter, searchQuery]);

  // Compute allItemIds for multi-selection at top level (Rules of Hooks)
  const allItemIds = useMemo(() => filteredItems.map((item) => item.id), [filteredItems]);

  // Notify parent of total items for timeline scrubber
  useEffect(() => {
    if (onItemsLoaded && filteredItems.length > 0) {
      onItemsLoaded(filteredItems);
    }
  }, [filteredItems, onItemsLoaded]);

  // Group items into rows according to current responsive column count
  const rowCount = Math.ceil(filteredItems.length / activeColumns);

  // TanStack Virtualizer for 60fps virtualization
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => {
      if (!parentRef.current) return 220;
      const isMobile = windowWidth < 640;
      const padding = isMobile ? 20 : 48;
      const gap = isMobile ? 10 : 16;
      const width = parentRef.current.clientWidth - padding;
      const itemWidth = width / activeColumns;
      return itemWidth + gap;
    },
    overscan: 4,
  });

  const handleOpenItem = useCallback(
    (index: number) => {
      onOpenLightbox(index);
    },
    [onOpenLightbox]
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[500px] text-neutral-400">
        <Loader2 className="w-10 h-10 animate-spin text-neutral-500 mb-3" />
        <p className="text-sm font-medium">Đang nạp dữ liệu từ Google Drive & IndexedDB...</p>
      </div>
    );
  }

  // Not Logged In State
  if (!isLoggedIn) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[500px] text-neutral-400 p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#171717] border border-[#262626] flex items-center justify-center mb-4 text-blue-400 shadow-inner">
          <LogIn className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-1">Kết nối Google Drive</h3>
        <p className="text-xs text-neutral-500 max-w-md mb-6 leading-relaxed">
          Đăng nhập bằng tài khoản Google để tự động tạo một thư mục riêng <b>DriveStream Media</b>. Bạn có thể tự do tạo nhiều thư mục con, xem ảnh 60fps và tải video dung lượng lớn không giới hạn.
        </p>
        <button
          onClick={login}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-600/25 active:scale-95"
        >
          <LogIn className="w-4 h-4" />
          <span>Đăng nhập tài khoản Google</span>
        </button>
      </div>
    );
  }

  // Empty Folder State
  if (filteredItems.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[500px] text-neutral-400 p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#171717] border border-[#262626] flex items-center justify-center mb-4 text-amber-400 shadow-inner">
          <FolderOpen className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-1">
          Thư mục &ldquo;{currentFolder?.name}&rdquo; đang trống
        </h3>
        <p className="text-xs text-neutral-500 max-w-md mb-6 leading-relaxed">
          Chưa có tệp hình ảnh hoặc video nào trong thư mục này. Bạn có thể tải tệp mới lên ngay hoặc tạo thêm các thư mục con.
        </p>
        <button
          onClick={() => setUploadModalOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-white text-black hover:bg-neutral-200 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-white/5 active:scale-95"
        >
          <Upload className="w-4 h-4" />
          <span>Tải file mới vào thư mục này</span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      style={{ touchAction: 'pan-y' }}
      className="flex-1 h-full overflow-y-auto px-2.5 sm:px-6 py-3 sm:py-6 custom-scrollbar"
    >
      <div
        className="w-full relative"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * activeColumns;
          const rowItems = filteredItems.slice(startIndex, startIndex + activeColumns);

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="absolute top-0 left-0 w-full pb-2.5 sm:pb-4"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                className="grid gap-2.5 sm:gap-4 w-full"
                style={{
                  gridTemplateColumns: `repeat(${activeColumns}, minmax(0, 1fr))`,
                }}
              >
                {rowItems.map((item, colIndex) => {
                  const itemIndex = startIndex + colIndex;
                  return (
                    <MediaCard
                      key={item.id}
                      item={item}
                      index={itemIndex}
                      allItemIds={allItemIds}
                      onOpenLightbox={handleOpenItem}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pinch Gesture Feedback Toast */}
      {pinchFeedback && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-black/90 backdrop-blur-xl border border-white/20 text-white text-xs font-semibold shadow-2xl flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200 pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span>{pinchFeedback}</span>
        </div>
      )}

      {/* Mobile Column Quick Switcher (Tap or Pinch) */}
      {windowWidth < 640 && selectedFileIds.length === 0 && (
        <div className="fixed bottom-5 right-3 z-30 flex items-center bg-[#141414]/90 border border-neutral-700/80 backdrop-blur-xl rounded-full p-1 shadow-2xl animate-in fade-in">
          {[1, 2, 3, 4].map((col) => (
            <button
              key={col}
              onClick={() => {
                setMobileColumnsCount(col);
                showPinchToast(`Chia ${col} cột`);
              }}
              title={`${col} cột`}
              className={`w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center transition-all ${
                activeColumns === col
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/40 scale-105'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {col}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
