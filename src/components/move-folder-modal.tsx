'use client';

import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMediaStore } from '@/store/use-media-store';
import { useAuthStore } from '@/store/use-auth-store';
import { DriveFolder } from '@/lib/indexed-db';
import { fetchAllFoldersUnderRoot, moveDriveFiles } from '@/lib/client-drive';
import {
  FolderInput,
  Folder,
  X,
  Loader2,
  Check,
  HardDrive,
  ArrowRight,
} from 'lucide-react';

export function MoveFolderModal() {
  const queryClient = useQueryClient();
  const {
    isMoveModalOpen,
    setIsMoveModalOpen,
    selectedFileIds,
    clearSelection,
  } = useMediaStore();

  const { accessToken, rootFolder, currentFolder } = useAuthStore();

  const [availableFolders, setAvailableFolders] = useState<DriveFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    if (!isMoveModalOpen || !accessToken || !rootFolder) return;

    const loadFolders = async () => {
      try {
        setIsLoadingFolders(true);
        const folders = await fetchAllFoldersUnderRoot(
          rootFolder.id,
          rootFolder.name,
          accessToken
        );
        // Exclude current folder
        const targetable = folders.filter((f) => f.id !== currentFolder?.id);
        setAvailableFolders(targetable);
        if (targetable.length > 0) {
          setSelectedFolderId(targetable[0].id);
        }
      } catch (err) {
        console.error('[MoveModal] Error loading folders:', err);
      } finally {
        setIsLoadingFolders(false);
      }
    };

    loadFolders();
  }, [isMoveModalOpen, accessToken, rootFolder, currentFolder]);

  if (!isMoveModalOpen) return null;

  const handleConfirmMove = async () => {
    if (!selectedFolderId || !currentFolder || !accessToken) return;

    try {
      setIsMoving(true);
      const res = await moveDriveFiles(
        selectedFileIds,
        currentFolder.id,
        selectedFolderId,
        accessToken
      );

      const targetFolderObj = availableFolders.find((f) => f.id === selectedFolderId);
      alert(`Đã di chuyển thành công ${res.success} mục vào thư mục "${targetFolderObj?.name || 'mục tiêu'}"!`);

      clearSelection();
      setIsMoveModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['files'] });
    } catch (err: any) {
      alert(`Lỗi khi di chuyển: ${err.message}`);
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl bg-[#141414] border border-[#2a2a2a] p-4 sm:p-6 shadow-2xl text-white max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#262626]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <FolderInput className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Di chuyển ảnh & video</h3>
              <p className="text-xs text-neutral-400">
                Đang chọn <b>{selectedFileIds.length}</b> mục từ &ldquo;{currentFolder?.name}&rdquo;
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsMoveModalOpen(false)}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content: List of Destination Folders */}
        <div className="mt-5">
          <label className="block text-xs font-medium text-neutral-300 mb-2">
            Chọn thư mục đích đến:
          </label>

          {isLoadingFolders ? (
            <div className="py-8 flex flex-col items-center justify-center text-neutral-500 text-xs gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              <span>Đang tải danh sách thư mục...</span>
            </div>
          ) : availableFolders.length === 0 ? (
            <div className="py-6 text-center text-xs text-neutral-400 bg-neutral-900/50 rounded-xl border border-neutral-800 p-4">
              Không có thư mục nào khác để di chuyển tới. Hãy tạo thêm thư mục con trước!
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
              {availableFolders.map((folder) => {
                const isSelected = selectedFolderId === folder.id;
                return (
                  <button
                    key={folder.id}
                    onClick={() => setSelectedFolderId(folder.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-blue-600/15 border-blue-500/60 text-white'
                        : 'bg-[#181818] border-[#262626] text-neutral-300 hover:bg-neutral-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Folder
                        className={`w-4 h-4 shrink-0 ${
                          isSelected ? 'text-blue-400 fill-blue-400/20' : 'text-amber-400'
                        }`}
                      />
                      <span className="text-xs font-medium truncate">{folder.name}</span>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-sm">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-[#262626]">
          <button
            type="button"
            onClick={() => setIsMoveModalOpen(false)}
            className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-300 transition-colors"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleConfirmMove}
            disabled={isMoving || !selectedFolderId || availableFolders.length === 0}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white transition-all shadow-lg shadow-blue-600/20 active:scale-95"
          >
            {isMoving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang di chuyển...</span>
              </>
            ) : (
              <>
                <span>Xác nhận di chuyển</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
