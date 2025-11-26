import { FileSystemDirectoryHandle, FileSystemFileHandle } from '../types';

const DB_NAME = 'YoloInspectorDB';
const STORE_NAME = 'sessions';
const DB_VERSION = 1;

export interface StoredSession {
  id: number;
  date: string;
  imagesHandle: FileSystemDirectoryHandle;
  labelsHandle: FileSystemDirectoryHandle;
  classHandle?: FileSystemFileHandle;
  imagesFolderName: string;
  labelsFolderName: string;
}

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const saveSessionToDB = async (session: StoredSession) => {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // Get all keys to enforce limit (keep last 3)
    const countReq = store.getAll();
    
    countReq.onsuccess = () => {
        const sessions = countReq.result as StoredSession[];
        // Check if exists to update date, or add new
        const existingIdx = sessions.findIndex(s => 
            s.imagesFolderName === session.imagesFolderName && 
            s.labelsFolderName === session.labelsFolderName
        );

        if (existingIdx !== -1) {
             store.delete(sessions[existingIdx].id);
        } else if (sessions.length >= 3) {
             // Remove oldest if we have 3 and this is new
             const sorted = sessions.sort((a,b) => a.id - b.id);
             if (sorted[0]) store.delete(sorted[0].id);
        }
        
        store.put(session);
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getSessionsFromDB = async (): Promise<StoredSession[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
        // Sort by newest first
        const sorted = (request.result as StoredSession[]).sort((a, b) => b.id - a.id);
        resolve(sorted);
    };
    request.onerror = () => reject(request.error);
  });
};

export const verifyPermission = async (handle: FileSystemDirectoryHandle | FileSystemFileHandle, readWrite: boolean = false): Promise<boolean> => {
  const options: any = { mode: readWrite ? 'readwrite' : 'read' };
  if ((await handle.queryPermission(options)) === 'granted') {
    return true;
  }
  if ((await handle.requestPermission(options)) === 'granted') {
    return true;
  }
  return false;
};