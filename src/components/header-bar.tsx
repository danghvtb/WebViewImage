'use client';

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMediaStore } from '@/store/use-media-store';
import { useAuthStore } from '@/store/use-auth-store';
import { listDriveFolderMedia, listDriveSubFolders } from '@/lib/client-drive';
import {
  Upload,
  RefreshCw,
  Search,
  Grid3X3,
  LayoutGrid,
  Columns,
  Image as ImageIcon,
  Film,
  Layers,
  HardDrive,
  LogIn,
  LogOut,
  Folder,
} from 'lucide-react';

export function HeaderBar() {
  const queryClient = useQueryClient();
  const {
    columnDensity,
    setColumnDensity,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    setUploadModalOpen,
    isSyncing,
    setIsSyncing,
  } = useMediaStore();

  const {
    isLoggedIn,
    user,
    accessToken,
    currentFolder,
    logout,
    setIsConfigModalOpen,
    setSubFolders,
  } = useAuthStore();

  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const handleSync = async () => {
    if (!isLoggedIn || !accessToken || !currentFolder) {
      setIsConfigModalOpen(true);
      return;
    }

    try {
      setIsSyncing(true);
      setSyncMessage('Đang đồng bộ Google Drive...');

      // Sync folder media directly from Google Drive API
      const files = await listDriveFolderMedia(currentFolder.id, accessToken);
      // Sync subfolders
      const subs = await listDriveSubFolders(currentFolder.id, accessToken);
      setSubFolders(subs);

      queryClient.invalidateQueries({ queryKey: ['files'] });
      setSyncMessage(`Đồng bộ thành công (${files.length} tệp)!`);
      setTimeout(() => setSyncMessage(null), 3500);
    } catch (err: any) {
      console.error('[Sync] Error:', err);
      setSyncMessage(err.message || 'Lỗi đồng bộ');
      setTimeout(() => setSyncMessage(null), 4000);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#222] bg-[#0a0a0a]/90 backdrop-blur-xl px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
      {/* Brand & Logo */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
          <HardDrive className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-white tracking-tight">DriveStream</h1>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold tracking-wider">
              CLIENT SPA
            </span>
          </div>
          <p className="text-[11px] text-neutral-400">Google Drive 60fps Media Engine</p>
        </div>
      </div>

      {/* Search & Media Filter Tabs */}
      <div className="flex items-center gap-3 flex-1 max-w-md mx-auto">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm trong thư mục..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[#161616] border border-[#2a2a2a] text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center p-0.5 rounded-lg bg-[#161616] border border-[#2a2a2a] text-xs">
          <button
            onClick={() => setFilter('all')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
              filter === 'all'
                ? 'bg-neutral-800 text-white font-medium shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tất cả</span>
          </button>
          <button
            onClick={() => setFilter('image')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
              filter === 'image'
                ? 'bg-neutral-800 text-white font-medium shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ảnh</span>
          </button>
          <button
            onClick={() => setFilter('video')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
              filter === 'video'
                ? 'bg-neutral-800 text-white font-medium shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Video</span>
          </button>
        </div>
      </div>

      {/* Grid Density, Sync & Auth Actions */}
      <div className="flex items-center gap-2.5">
        {/* Sync Status Toast/Notification */}
        {syncMessage && (
          <span className="text-[11px] font-medium text-blue-400 bg-blue-950/40 px-2.5 py-1 rounded-md border border-blue-800/50 animate-in fade-in">
            {syncMessage}
          </span>
        )}

        {/* Grid Density Selector */}
        <div className="hidden md:flex items-center p-0.5 rounded-lg bg-[#161616] border border-[#2a2a2a]">
          <button
            onClick={() => setColumnDensity('compact')}
            title="Compact (6 cột)"
            className={`p-1.5 rounded-md transition-colors ${
              columnDensity === 'compact'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Grid3X3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setColumnDensity('normal')}
            title="Normal (4 cột)"
            className={`p-1.5 rounded-md transition-colors ${
              columnDensity === 'normal'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setColumnDensity('large')}
            title="Large (2 cột)"
            className={`p-1.5 rounded-md transition-colors ${
              columnDensity === 'large'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Sync Button */}
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#161616] hover:bg-neutral-800 text-neutral-300 hover:text-white text-xs font-medium border border-[#2a2a2a] transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-400' : ''}`} />
          <span className="hidden sm:inline">Đồng bộ</span>
        </button>

        {/* Upload Button */}
        <button
          onClick={() => {
            if (!isLoggedIn) {
              setIsConfigModalOpen(true);
            } else {
              setUploadModalOpen(true);
            }
          }}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition-all active:scale-95"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Tải lên</span>
        </button>

        {/* Google Auth Profile / Login Button */}
        {isLoggedIn && user ? (
          <div className="flex items-center gap-2 pl-1 border-l border-neutral-800">
            <div className="flex items-center gap-2 p-1 rounded-lg bg-[#161616] border border-[#2a2a2a]">
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">
                  {user.name.charAt(0)}
                </div>
              )}
              <span className="text-xs font-medium text-white max-w-[100px] truncate hidden xl:inline">
                {user.name}
              </span>
            </div>
            <button
              onClick={logout}
              title="Đăng xuất Google"
              className="p-1.5 rounded-lg bg-[#161616] hover:bg-red-950/40 text-neutral-400 hover:text-red-400 border border-[#2a2a2a] hover:border-red-800/40 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsConfigModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-medium border border-neutral-700 transition-colors active:scale-95"
          >
            <LogIn className="w-3.5 h-3.5 text-blue-400" />
            <span>Đăng nhập</span>
          </button>
        )}
      </div>
    </header>
  );
}
