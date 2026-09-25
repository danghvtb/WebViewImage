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
  isSyncing: boolean;

  setColumnDensity: (density: ColumnDensity) => void;
  setFilter: (filter: MediaFilter) => void;
  setSearchQuery: (query: string) => void;
  setLightboxIndex: (index: number | null) => void;
  setUploadModalOpen: (isOpen: boolean) => void;
  setIsSyncing: (isSyncing: boolean) => void;
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

export const useMediaStore = create<MediaState>((set) => ({
  columnDensity: 'normal',
  columnsCount: 4,
  filter: 'all',
  searchQuery: '',
  lightboxIndex: null,
  isUploadModalOpen: false,
  isSyncing: false,

  setColumnDensity: (density) =>
    set({
      columnDensity: density,
      columnsCount: getColumnCountFromDensity(density),
    }),
  setFilter: (filter) => set({ filter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setLightboxIndex: (lightboxIndex) => set({ lightboxIndex }),
  setUploadModalOpen: (isUploadModalOpen) => set({ isUploadModalOpen }),
  setIsSyncing: (isSyncing) => set({ isSyncing }),
}));
