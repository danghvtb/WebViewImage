'use client';

import React, { useState } from 'react';
import { useAuthStore } from '@/store/use-auth-store';
import { createDriveSubFolder, deleteDriveFile } from '@/lib/client-drive';
import {
  Folder,
  FolderPlus,
  ChevronRight,
  HardDrive,
  Loader2,
  FolderOpen,
  Trash2,
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
    setSubFolders,
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
    <div className="w-full border-b border-[#222] bg-[#0d0d0d] px-3 sm:px-6 py-2 sm:py-2.5">
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        {/* Breadcrumb Trail (Smooth single-line scroll on mobile) */}
        <div className="flex items-center overflow-x-auto no-scrollbar whitespace-nowrap scroll-smooth flex-1 min-w-0 gap-1 sm:gap-1.5 text-xs py-0.5">
          <HardDrive className="w-3.5 h-3.5 text-blue-400 mr-0.5 shrink-0" />
          {folderBreadcrumbs.map((crumb, idx) => {
            const isLast = idx === folderBreadcrumbs.length - 1;
            return (
              <React.Fragment key={crumb.id}>
                <button
                  onClick={() => {
                    navigateToBreadcrumb(idx);
                    onFolderChanged();
                  }}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors shrink-0 ${
                    isLast
                      ? 'bg-neutral-800 text-white font-semibold'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
                  }`}
                >
                  <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate max-w-[120px] sm:max-w-none">{crumb.name}</span>
                </button>
                {!isLast && <ChevronRight className="w-3 h-3 text-neutral-600 shrink-0" />}
              </React.Fragment>
            );
          })}
        </div>

        {/* Action: Create New Subfolder */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!isCreatingFolder ? (
            <button
              onClick={() => setIsCreatingFolder(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-medium transition-colors border border-neutral-700"
            >
              <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Tạo thư mục con</span>
              <span className="sm:hidden">Thư mục mới</span>
            </button>
          ) : (
            <form onSubmit={handleCreateFolder} className="flex items-center gap-1.5">
              <input
                type="text"
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Tên thư mục..."
                className="w-28 sm:w-auto px-2.5 py-1 rounded-lg bg-[#1a1a1a] border border-blue-500/50 text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
        <div className="flex items-center gap-2 overflow-x-auto pt-2 pb-1 custom-scrollbar">
          <span className="text-[10px] sm:text-[11px] text-neutral-500 uppercase tracking-wider shrink-0 flex items-center gap-1">
            <FolderOpen className="w-3 h-3" />
            Thư mục ({subFolders.length}):
          </span>
          {subFolders.map((sub) => (
            <div
              key={sub.id}
              className="flex items-center rounded-lg bg-[#171717] hover:bg-[#202020] border border-[#2a2a2a] hover:border-neutral-600 transition-all shrink-0 group overflow-hidden"
            >
              <button
                onClick={() => {
                  setCurrentFolder(sub);
                  onFolderChanged();
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-neutral-300 hover:text-white transition-colors"
              >
                <Folder className="w-3.5 h-3.5 text-amber-400 group-hover:fill-amber-400/20" />
                <span>{sub.name}</span>
              </button>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!confirm(`Bạn có chắc muốn xóa thư mục "${sub.name}" khỏi Google Drive?`)) return;
                  try {
                    if (accessToken) await deleteDriveFile(sub.id, accessToken);
                    setSubFolders(subFolders.filter((f) => f.id !== sub.id));
                  } catch (err: any) {
                    alert(`Xóa thư mục thất bại: ${err.message}`);
                  }
                }}
                title="Xóa thư mục con này"
                className="px-1.5 py-1 text-neutral-500 hover:text-red-400 hover:bg-neutral-800 transition-colors opacity-70 sm:opacity-0 sm:group-hover:opacity-100"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
