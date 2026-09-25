import { DriveMediaItem } from './types';

export interface DriveFolder {
  id: string;
  name: string;
  parentId: string;
  createdTime?: string;
}

const DB_NAME = 'drivestream_db';
const DB_VERSION = 1;

class DriveIndexedDB {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined') {
        return reject(new Error('IndexedDB is only available in browser'));
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Store for files
        if (!db.objectStoreNames.contains('files')) {
          const fileStore = db.createObjectStore('files', { keyPath: 'id' });
          fileStore.createIndex('driveFolderId', 'driveFolderId', { unique: false });
          fileStore.createIndex('createdTime', 'createdTime', { unique: false });
          fileStore.createIndex('mimeType', 'mimeType', { unique: false });
        }

        // Store for folders
        if (!db.objectStoreNames.contains('folders')) {
          const folderStore = db.createObjectStore('folders', { keyPath: 'id' });
          folderStore.createIndex('parentId', 'parentId', { unique: false });
        }

        // Store for app settings & cache metadata
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  // Files caching
  async getCachedFiles(folderId: string): Promise<DriveMediaItem[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readonly');
      const store = tx.objectStore('files');
      const index = store.index('driveFolderId');
      const request = index.getAll(folderId);

      request.onsuccess = () => {
        const items = request.result as DriveMediaItem[];
        // Sort descending by createdTime
        items.sort(
          (a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime()
        );
        resolve(items);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveFiles(files: DriveMediaItem[]): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      for (const file of files) {
        store.put(file);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteFile(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Folders caching
  async getCachedFolders(parentId: string): Promise<DriveFolder[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('folders', 'readonly');
      const store = tx.objectStore('folders');
      const index = store.index('parentId');
      const request = index.getAll(parentId);

      request.onsuccess = () => {
        resolve(request.result as DriveFolder[]);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveFolders(folders: DriveFolder[]): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('folders', 'readwrite');
      const store = tx.objectStore('folders');
      for (const folder of folders) {
        store.put(folder);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Metadata storage
  async setMetadata(key: string, value: any): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('metadata', 'readwrite');
      const store = tx.objectStore('metadata');
      store.put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getMetadata<T = any>(key: string): Promise<T | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('metadata', 'readonly');
      const store = tx.objectStore('metadata');
      const request = store.get(key);
      request.onsuccess = () => {
        resolve(request.result ? request.result.value : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearAll(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['files', 'folders', 'metadata'], 'readwrite');
      tx.objectStore('files').clear();
      tx.objectStore('folders').clear();
      tx.objectStore('metadata').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const localDB = new DriveIndexedDB();
