'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { HeaderBar } from '@/components/header-bar';
import { FolderNav } from '@/components/folder-nav';
import { MediaGrid } from '@/components/media-grid';
import { TimelineScrubber } from '@/components/timeline-scrubber';
import { LightboxModal } from '@/components/lightbox-modal';
import { UploaderModal } from '@/components/uploader';
import { GoogleLoginModal } from '@/components/google-login-modal';
import { BatchActionsBar } from '@/components/batch-actions-bar';
import { MoveFolderModal } from '@/components/move-folder-modal';
import { useMediaStore } from '@/store/use-media-store';
import { useAuthStore } from '@/store/use-auth-store';
import { DriveMediaItem } from '@/lib/types';
import {
  getSavedAccessToken,
  getSavedUserProfile,
} from '@/lib/google-auth';
import {
  getOrCreateAppRootFolder,
  listDriveSubFolders,
} from '@/lib/client-drive';

export default function HomePage() {
  const queryClient = useQueryClient();
  const { lightboxIndex, setLightboxIndex } = useMediaStore();
  const {
    isLoggedIn,
    setAuth,
    setRootFolder,
    currentFolder,
    setSubFolders,
  } = useAuthStore();

  const [loadedItems, setLoadedItems] = useState<DriveMediaItem[]>([]);

  // Automatically restore session and load folder on mount
  useEffect(() => {
    const initSession = async () => {
      const token = getSavedAccessToken();
      const user = getSavedUserProfile();

      if (token && user) {
        setAuth(token, user);
        try {
          // Find or create dedicated root folder
          const rootFolder = await getOrCreateAppRootFolder(token);
          setRootFolder(rootFolder);

          // Fetch subfolders
          const subs = await listDriveSubFolders(rootFolder.id, token);
          setSubFolders(subs);
        } catch (err) {
          console.warn('[SessionInit] Could not load Google Drive folder:', err);
        }
      }
    };

    initSession();
  }, [setAuth, setRootFolder, setSubFolders]);

  const handleOpenLightbox = useCallback(
    (index: number) => {
      setLightboxIndex(index);
    },
    [setLightboxIndex]
  );

  const handleItemsLoaded = useCallback((items: DriveMediaItem[]) => {
    setLoadedItems(items);
  }, []);

  const handleJumpToIndex = useCallback((index: number) => {
    const targetElement = document.querySelector(`[data-index="${Math.floor(index / 4)}"]`);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const handleFolderChanged = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['files'] });
  }, [queryClient]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0a0a0a]">
      {/* Top Navbar */}
      <HeaderBar />

      {/* Folder Hierarchy Breadcrumbs & Subfolders */}
      <FolderNav onFolderChanged={handleFolderChanged} />

      {/* Main Viewport: Media Grid + Timeline Scrubber */}
      <main className="flex-1 flex overflow-hidden relative">
        <MediaGrid
          onOpenLightbox={handleOpenLightbox}
          onItemsLoaded={handleItemsLoaded}
        />

        {/* Right Sidebar Timeline Scrubber */}
        <TimelineScrubber
          items={loadedItems}
          onJumpToIndex={handleJumpToIndex}
        />
      </main>

      {/* Fullscreen HD Lightbox Modal */}
      <LightboxModal
        items={loadedItems}
        currentIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />

      {/* Direct Resumable Chunked Uploader Modal */}
      <UploaderModal />

      {/* Google OAuth Login & Client ID Setup Modal */}
      <GoogleLoginModal onSuccess={handleFolderChanged} />

      {/* Smart Multi-Select Batch Actions Toolbar */}
      <BatchActionsBar
        totalItemsCount={loadedItems.length}
        allItemIds={loadedItems.map((i) => i.id)}
      />

      {/* Batch Move Folder Selection Modal */}
      <MoveFolderModal />
    </div>
  );
}
