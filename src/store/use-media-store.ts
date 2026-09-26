import { create } from 'zustand';

export type ColumnDensity = 'compact' | 'normal' | 'large';
export type MediaFilter = 'all' | 'image' | 'video';

interface MediaState {
  columnDensity: ColumnDensity;
  columnsCount: number;
  filter: MediaFilter;
  searchQuery: string;
  lightboxIndex: number | null;
  isUploadModalOpen: boolean;
  isMoveModalOpen: boolean;
  isSyncing: boolean;

  selectedFileIds: string[];
  lastSelectedIndex: number | null;

  setColumnDensity: (density: ColumnDensity) => void;
  setFilter: (filter: MediaFilter) => void;
  setSearchQuery: (query: string) => void;
  setLightboxIndex: (index: number | null) => void;
  setUploadModalOpen: (isOpen: boolean) => void;
  setIsMoveModalOpen: (isOpen: boolean) => void;
  setIsSyncing: (isSyncing: boolean) => void;

  toggleSelect: (id: string, index?: number) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  selectRange: (toIndex: number, allIds: string[]) => void;
}

const getColumnCountFromDensity = (density: ColumnDensity): number => {
  switch (density) {
    case 'compact':
      return 6;
    case 'large':
      return 2;
    case 'normal':
    default:
      return 4;
  }
};

export const useMediaStore = create<MediaState>((set, get) => ({
  columnDensity: 'normal',
  columnsCount: 4,
  filter: 'all',
  searchQuery: '',
  lightboxIndex: null,
  isUploadModalOpen: false,
  isMoveModalOpen: false,
  isSyncing: false,

  selectedFileIds: [],
  lastSelectedIndex: null,

  setColumnDensity: (density) =>
    set({
      columnDensity: density,
      columnsCount: getColumnCountFromDensity(density),
    }),
  setFilter: (filter) => set({ filter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setLightboxIndex: (lightboxIndex) => set({ lightboxIndex }),
  setUploadModalOpen: (isUploadModalOpen) => set({ isUploadModalOpen }),
  setIsMoveModalOpen: (isMoveModalOpen) => set({ isMoveModalOpen }),
  setIsSyncing: (isSyncing) => set({ isSyncing }),

  toggleSelect: (id, index) => {
    const { selectedFileIds } = get();
    const exists = selectedFileIds.includes(id);
    const newSelected = exists
      ? selectedFileIds.filter((item) => item !== id)
      : [...selectedFileIds, id];

    set({
      selectedFileIds: newSelected,
      lastSelectedIndex: typeof index === 'number' ? index : null,
    });
  },

  selectAll: (ids) => {
    set({
      selectedFileIds: ids,
      lastSelectedIndex: null,
    });
  },

  clearSelection: () => {
    set({
      selectedFileIds: [],
      lastSelectedIndex: null,
    });
  },

  selectRange: (toIndex, allIds) => {
    const { lastSelectedIndex, selectedFileIds } = get();
    if (lastSelectedIndex === null || lastSelectedIndex === toIndex) {
      const targetId = allIds[toIndex];
      if (targetId) {
        get().toggleSelect(targetId, toIndex);
      }
      return;
    }

    const start = Math.min(lastSelectedIndex, toIndex);
    const end = Math.max(lastSelectedIndex, toIndex);
    const rangeIds = allIds.slice(start, end + 1);

    const merged = Array.from(new Set([...selectedFileIds, ...rangeIds]));
    set({
      selectedFileIds: merged,
      lastSelectedIndex: toIndex,
    });
  },
}));
