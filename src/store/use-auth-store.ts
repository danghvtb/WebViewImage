import { create } from 'zustand';
import {
  GoogleUserProfile,
  getSavedAccessToken,
  getSavedUserProfile,
  getSavedClientId,
  saveClientId,
  logoutGoogle,
  requestGoogleAccessToken,
} from '@/lib/google-auth';
import { DriveFolder } from '@/lib/indexed-db';
import { getOrCreateAppRootFolder, listDriveSubFolders } from '@/lib/client-drive';

interface AuthState {
  accessToken: string | null;
  user: GoogleUserProfile | null;
  clientId: string;
  isLoggedIn: boolean;

  rootFolder: DriveFolder | null;
  currentFolder: DriveFolder | null;
  folderBreadcrumbs: DriveFolder[];
  subFolders: DriveFolder[];
  isLoadingFolder: boolean;
  isConfigModalOpen: boolean;

  login: () => Promise<void>;
  refreshToken: () => Promise<string>;
  setAuth: (accessToken: string, user: GoogleUserProfile) => void;
  setClientId: (clientId: string) => void;
  logout: () => void;

  setRootFolder: (folder: DriveFolder) => void;
  setCurrentFolder: (folder: DriveFolder) => void;
  pushBreadcrumb: (folder: DriveFolder) => void;
  navigateToBreadcrumb: (index: number) => void;
  setSubFolders: (folders: DriveFolder[]) => void;
  addSubFolder: (folder: DriveFolder) => void;
  setIsLoadingFolder: (isLoading: boolean) => void;
  setIsConfigModalOpen: (isOpen: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => {
  return {
    accessToken: null,
    user: null,
    clientId: '',
    isLoggedIn: false,

    rootFolder: null,
    currentFolder: null,
    folderBreadcrumbs: [],
    subFolders: [],
    isLoadingFolder: false,
    isConfigModalOpen: false,

    login: async () => {
      const { clientId, setAuth, setRootFolder, setSubFolders, setIsConfigModalOpen } = get();
      const finalId = clientId || getSavedClientId();

      if (!finalId) {
        setIsConfigModalOpen(true);
        return;
      }

      try {
        set({ isLoadingFolder: true });
        const { accessToken, profile } = await requestGoogleAccessToken(finalId);
        setAuth(accessToken, profile);

        const rootFolder = await getOrCreateAppRootFolder(accessToken);
        setRootFolder(rootFolder);

        const subs = await listDriveSubFolders(rootFolder.id, accessToken);
        setSubFolders(subs);
      } catch (err: any) {
        console.error('[AuthStore] Login failed:', err);
        if (err.message === 'MISSING_CLIENT_ID') {
          setIsConfigModalOpen(true);
        } else {
          alert(`Đăng nhập Google thất bại: ${err.message}`);
        }
      } finally {
        set({ isLoadingFolder: false });
      }
    },

    refreshToken: async () => {
      const { clientId, setAuth } = get();
      const finalId = clientId || getSavedClientId();
      if (!finalId) {
        throw new Error('MISSING_CLIENT_ID');
      }
      const { accessToken, profile } = await requestGoogleAccessToken(finalId);
      setAuth(accessToken, profile);
      return accessToken;
    },

    setAuth: (accessToken, user) =>
      set({
        accessToken,
        user,
        isLoggedIn: true,
      }),

    setClientId: (clientId) => {
      saveClientId(clientId);
      set({ clientId });
    },

    logout: () => {
      logoutGoogle();
      set({
        accessToken: null,
        user: null,
        isLoggedIn: false,
        rootFolder: null,
        currentFolder: null,
        folderBreadcrumbs: [],
        subFolders: [],
      });
    },

    setRootFolder: (rootFolder) =>
      set({
        rootFolder,
        currentFolder: rootFolder,
        folderBreadcrumbs: [rootFolder],
      }),

    setCurrentFolder: (folder) => {
      const { folderBreadcrumbs } = get();
      // If folder is already in breadcrumbs, navigate back to it
      const existingIdx = folderBreadcrumbs.findIndex((b) => b.id === folder.id);
      if (existingIdx >= 0) {
        set({
          currentFolder: folder,
          folderBreadcrumbs: folderBreadcrumbs.slice(0, existingIdx + 1),
        });
      } else {
        set({
          currentFolder: folder,
          folderBreadcrumbs: [...folderBreadcrumbs, folder],
        });
      }
    },

    pushBreadcrumb: (folder) => {
      const { folderBreadcrumbs } = get();
      if (!folderBreadcrumbs.some((b) => b.id === folder.id)) {
        set({
          currentFolder: folder,
          folderBreadcrumbs: [...folderBreadcrumbs, folder],
        });
      }
    },

    navigateToBreadcrumb: (index) => {
      const { folderBreadcrumbs } = get();
      if (index >= 0 && index < folderBreadcrumbs.length) {
        const target = folderBreadcrumbs[index];
        set({
          currentFolder: target,
          folderBreadcrumbs: folderBreadcrumbs.slice(0, index + 1),
        });
      }
    },

    setSubFolders: (subFolders) => set({ subFolders }),

    addSubFolder: (folder) =>
      set((state) => ({
        subFolders: [folder, ...state.subFolders.filter((f) => f.id !== folder.id)],
      })),

    setIsLoadingFolder: (isLoadingFolder) => set({ isLoadingFolder }),
    setIsConfigModalOpen: (isConfigModalOpen) => set({ isConfigModalOpen }),
  };
});
