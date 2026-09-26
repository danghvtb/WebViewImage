'use client';

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMediaStore } from '@/store/use-media-store';
import { useAuthStore } from '@/store/use-auth-store';
import { batchDeleteDriveFiles } from '@/lib/client-drive';
import {
  CheckSquare,
  FolderInput,
  Trash2,
  X,
  Loader2,
  Layers,
} from 'lucide-react';

interface BatchActionsBarProps {
  totalItemsCount: number;
  allItemIds: string[];
}

export function BatchActionsBar({ totalItemsCount, allItemIds }: BatchActionsBarProps) {
  const queryClient = useQueryClient();
  const {
    selectedFileIds,
    clearSelection,
    selectAll,
    setIsMoveModalOpen,
  } = useMediaStore();

  const { accessToken } = useAuthStore();
  const [isDeleting, setIsDeleting] = useState(false);

  const selectedCount = selectedFileIds.length;
  if (selectedCount === 0) return null;

  const isAllSelected = selectedCount === totalItemsCount && totalItemsCount > 0;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      clearSelection();
    } else {
      selectAll(allItemIds);
    }
  };

  const handleBatchDelete = async () => {
    if (!confirm(`Bạn có chắc chắn muốn xóa ${selectedCount} mục đã chọn khỏi Google Drive?`)) {
      return;
    }

    try {
      setIsDeleting(true);
      if (accessToken) {
        const res = await batchDeleteDriveFiles(selectedFileIds, accessToken);
        alert(`Đã xóa thành công ${res.success} mục khỏi Google Drive!`);
      } else {
        alert('Vui lòng đăng nhập Google để thực hiện xóa');
      }
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['files'] });
    } catch (err: any) {
      alert(`Lỗi khi xóa hàng loạt: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-5 duration-300">
      <div className="flex items-center gap-2 sm:gap-3 px-4 py-2.5 rounded-2xl bg-[#141414]/95 border border-[#333] backdrop-blur-2xl shadow-2xl text-white">
        {/* Count Badge */}
        <div className="flex items-center gap-2 pr-2 border-r border-neutral-700/60">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-xs font-bold text-white shadow-md">
            {selectedCount}
          </span>
          <span className="text-xs font-medium text-neutral-300 hidden sm:inline">
            mục đã chọn
          </span>
        </div>

        {/* Select All Toggle */}
        <button
          onClick={handleToggleSelectAll}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors"
        >
          <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
          <span className="hidden md:inline">
            {isAllSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
          </span>
        </button>

        {/* Move Button */}
        <button
          onClick={() => setIsMoveModalOpen(true)}
          disabled={isDeleting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white text-xs font-semibold border border-neutral-700 transition-all active:scale-95"
        >
          <FolderInput className="w-3.5 h-3.5 text-amber-400" />
          <span>Di chuyển</span>
        </button>

        {/* Batch Delete Button */}
        <button
          onClick={handleBatchDelete}
          disabled={isDeleting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-300 hover:text-red-200 text-xs font-semibold border border-red-800/40 transition-all active:scale-95 disabled:opacity-50"
        >
          {isDeleting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
          <span>Xóa ({selectedCount})</span>
        </button>

        {/* Cancel / Clear Button */}
        <button
          onClick={clearSelection}
          title="Bỏ chọn (Esc)"
          className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors ml-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
