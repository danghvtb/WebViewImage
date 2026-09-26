'use client';

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMediaStore } from '@/store/use-media-store';
import { useAuthStore } from '@/store/use-auth-store';
import { DriveMediaItem } from '@/lib/types';
import { localDB } from '@/lib/indexed-db';
import { listDriveFolderMedia } from '@/lib/client-drive';
import { MediaCard } from './media-card';
import { Loader2, Upload, Sparkles, LogIn, FolderOpen } from 'lucide-react';

interface MediaGridProps {
  onOpenLightbox: (index: number) => void;
  onItemsLoaded?: (items: DriveMediaItem[]) => void;
}

export function MediaGrid({ onOpenLightbox, onItemsLoaded }: MediaGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const { columnsCount, filter, searchQuery, setUploadModalOpen } = useMediaStore();
  const { isLoggedIn, accessToken, currentFolder, login, setIsConfigModalOpen } = useAuthStore();

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

  // Notify parent of total items for timeline scrubber
  useEffect(() => {
    if (onItemsLoaded && filteredItems.length > 0) {
      onItemsLoaded(filteredItems);
    }
  }, [filteredItems, onItemsLoaded]);

  // Group items into rows according to current column count
  const rowCount = Math.ceil(filteredItems.length / columnsCount);

  // TanStack Virtualizer for 60fps virtualization
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => {
      if (!parentRef.current) return 260;
      const width = parentRef.current.clientWidth - 48;
      const itemWidth = width / columnsCount;
      return itemWidth + 16;
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
      className="flex-1 h-full overflow-y-auto px-4 sm:px-6 py-6 custom-scrollbar"
    >
      <div
        className="w-full relative"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * columnsCount;
          const rowItems = filteredItems.slice(startIndex, startIndex + columnsCount);

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="absolute top-0 left-0 w-full pb-4"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                className="grid gap-4 w-full"
                style={{
                  gridTemplateColumns: `repeat(${columnsCount}, minmax(0, 1fr))`,
                }}
              >
                {rowItems.map((item, colIndex) => {
                  const itemIndex = startIndex + colIndex;
                  return (
                    <MediaCard
                      key={item.id}
                      item={item}
                      index={itemIndex}
                      onOpenLightbox={handleOpenItem}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
