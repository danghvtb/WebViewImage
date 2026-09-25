'use client';

import React, { useState } from 'react';
import { useAuthStore } from '@/store/use-auth-store';
import { createDriveSubFolder } from '@/lib/client-drive';
import {
  Folder,
  FolderPlus,
  ChevronRight,
  HardDrive,
  Loader2,
  FolderOpen,
} from 'lucide-react';

interface FolderNavProps {
  onFolderChanged: () => void;
}

export function FolderNav({ onFolderChanged }: FolderNavProps) {
  const {
    accessToken,
    currentFolder,
    folderBreadcrumbs,
    navigateToBreadcrumb,
    subFolders,
    setCurrentFolder,
    addSubFolder,
    isLoggedIn,
  } = useAuthStore();

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isLoggedIn || !currentFolder) return null;

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !accessToken || !currentFolder) return;

    try {
      setIsSubmitting(true);
      const newFolder = await createDriveSubFolder(
        newFolderName.trim(),
        currentFolder.id,
        accessToken
      );
      addSubFolder(newFolder);
      setNewFolderName('');
      setIsCreatingFolder(false);
      onFolderChanged();
    } catch (err: any) {
      alert(`Lỗi tạo thư mục: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full border-b border-[#222] bg-[#0d0d0d] px-4 sm:px-6 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Breadcrumb Trail */}
        <div className="flex items-center flex-wrap gap-1.5 text-xs">
          <HardDrive className="w-3.5 h-3.5 text-blue-400 mr-1" />
          {folderBreadcrumbs.map((crumb, idx) => {
            const isLast = idx === folderBreadcrumbs.length - 1;
            return (
              <React.Fragment key={crumb.id}>
                <button
                  onClick={() => {
                    navigateToBreadcrumb(idx);
                    onFolderChanged();
                  }}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
                    isLast
                      ? 'bg-neutral-800 text-white font-semibold'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
                  }`}
                >
                  <Folder className="w-3.5 h-3.5 text-amber-400" />
                  <span>{crumb.name}</span>
                </button>
                {!isLast && <ChevronRight className="w-3.5 h-3.5 text-neutral-600" />}
              </React.Fragment>
            );
          })}
        </div>

        {/* Action: Create New Subfolder */}
        <div className="flex items-center gap-2">
          {!isCreatingFolder ? (
            <button
              onClick={() => setIsCreatingFolder(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-medium transition-colors border border-neutral-700"
            >
              <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
              <span>Tạo thư mục con</span>
            </button>
          ) : (
            <form onSubmit={handleCreateFolder} className="flex items-center gap-1.5">
              <input
                type="text"
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Tên thư mục mới..."
                className="px-2.5 py-1 rounded-lg bg-[#1a1a1a] border border-blue-500/50 text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={isSubmitting || !newFolderName.trim()}
                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium transition-colors flex items-center gap-1"
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Tạo'}
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingFolder(false)}
                className="px-2 py-1 rounded-lg text-neutral-400 hover:text-white text-xs"
              >
                Hủy
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Subfolders Quick Chips */}
      {subFolders.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pt-2.5 pb-1 custom-scrollbar">
          <span className="text-[11px] text-neutral-500 uppercase tracking-wider shrink-0 flex items-center gap-1">
            <FolderOpen className="w-3 h-3" />
            Thư mục con ({subFolders.length}):
          </span>
          {subFolders.map((sub) => (
            <button
              key={sub.id}
              onClick={() => {
                setCurrentFolder(sub);
                onFolderChanged();
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#171717] hover:bg-[#222] border border-[#2a2a2a] hover:border-neutral-600 text-xs text-neutral-300 hover:text-white transition-all shrink-0 active:scale-95 group"
            >
              <Folder className="w-3.5 h-3.5 text-amber-400 group-hover:fill-amber-400/20" />
              <span>{sub.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
