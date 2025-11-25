import React, { useState } from 'react';
import { Upload, FolderInput, FileText, AlertCircle } from 'lucide-react';
import { ImageAsset, FileSystemDirectoryHandle, FileSystemFileHandle } from '../types';

declare global {
  interface Window {
    showDirectoryPicker: (options?: any) => Promise<FileSystemDirectoryHandle>;
    showOpenFilePicker: (options?: any) => Promise<FileSystemFileHandle[]>;
  }
}

interface SetupScreenProps {
  onComplete: (
    images: ImageAsset[], 
    labels: Map<string, string>, 
    labelHandles: Map<string, FileSystemFileHandle>,
    labelsDirHandle: FileSystemDirectoryHandle | null,
    classes: string[]
  ) => void;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({ onComplete }) => {
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [labelHandles, setLabelHandles] = useState<Map<string, FileSystemFileHandle>>(new Map());
  const [labelsDirHandle, setLabelsDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  
  const [classes, setClasses] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Helper to check API support
  const hasFileSystemApi = typeof window.showDirectoryPicker === 'function';

  const scanDirectory = async (dirHandle: FileSystemDirectoryHandle, fileType: 'image' | 'text'): Promise<File[]> => {
    const files: File[] = [];
    
    // Recursive scanner
    async function traverse(handle: FileSystemDirectoryHandle) {
      for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
          // We need the file object to read content/type, but we attach the handle for writing later
          const fileHandle = entry as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          
          if (fileType === 'image' && file.type.startsWith('image/')) {
            (file as any).handle = fileHandle;
            files.push(file);
          } else if (fileType === 'text' && file.name.endsWith('.txt')) {
             (file as any).handle = fileHandle;
             files.push(file);
          }
        } else if (entry.kind === 'directory') {
          await traverse(entry as FileSystemDirectoryHandle);
        }
      }
    }
    
    await traverse(dirHandle);
    return files;
  };

  const handleSelectImageFolder = async () => {
    try {
      if (!hasFileSystemApi) throw new Error("Your browser does not support the File System Access API (Try Chrome/Edge).");
      
      const dirHandle = await window.showDirectoryPicker({ id: 'images', mode: 'read' });
      setLoading(true);
      
      const fileList = await scanDirectory(dirHandle, 'image');
      
      const loadedImages = fileList.map(f => ({
        name: f.name,
        url: URL.createObjectURL(f),
        file: f,
        handle: (f as any).handle
      })).sort((a, b) => a.name.localeCompare(b.name));

      setImages(loadedImages);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || "Failed to load images.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectLabelFolder = async () => {
    try {
      if (!hasFileSystemApi) throw new Error("Your browser does not support the File System Access API.");

      const dirHandle = await window.showDirectoryPicker({ id: 'labels', mode: 'readwrite' }); // Request Write access
      setLabelsDirHandle(dirHandle);
      setLoading(true);

      const fileList = await scanDirectory(dirHandle, 'text');
      
      const newLabels = new Map<string, string>();
      const newHandles = new Map<string, FileSystemFileHandle>();

      for (const file of fileList) {
        const text = await file.text();
        // Key is filename without extension
        const key = file.name.replace(/\.[^/.]+$/, "");
        newLabels.set(key, text);
        if ((file as any).handle) {
          newHandles.set(key, (file as any).handle);
        }
      }
      setLabels(newLabels);
      setLabelHandles(newHandles);
    } catch (err: any) {
       if (err.name !== 'AbortError') {
        setError(err.message || "Failed to load labels.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectClassFile = async () => {
    try {
      // Use OpenFilePicker for single file
      const [fileHandle] = await window.showOpenFilePicker({
        types: [{ description: 'Text Files', accept: { 'text/plain': ['.txt'] } }],
        multiple: false
      });
      
      const file = await fileHandle.getFile();
      const text = await file.text();
      const parsedClasses = text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
      setClasses(parsedClasses);
    } catch (err: any) {
      // Ignore abort
    }
  };

  const handleStart = () => {
    if (images.length === 0) {
      setError("Please load a folder containing images.");
      return;
    }
    const finalClasses = classes.length > 0 ? classes : Array.from({ length: 80 }, (_, i) => `Class ${i}`);
    
    onComplete(images, labels, labelHandles, labelsDirHandle, finalClasses);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-6">
      <div className="bg-slate-800 p-8 rounded-xl shadow-2xl border border-slate-700 max-w-2xl w-full">
        <h1 className="text-3xl font-bold text-white mb-2 text-center">YOLO Defect Inspector</h1>
        <p className="text-slate-400 text-center mb-8">
            Load your local dataset folders. 
            <span className="block text-indigo-400 text-xs mt-2 font-semibold">
                Changes will be auto-saved to disk.
            </span>
        </p>

        <div className="space-y-6">
          
          {/* Images Section */}
          <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className="bg-indigo-900/50 p-2 rounded text-indigo-400">
                   <FolderInput size={24} />
               </div>
               <div>
                   <h3 className="font-semibold text-slate-200">Images Folder</h3>
                   <p className="text-xs text-slate-500">{images.length > 0 ? `${images.length} images loaded` : 'Select folder containing images'}</p>
               </div>
            </div>
            <button 
                onClick={handleSelectImageFolder}
                className={`px-4 py-2 rounded text-sm font-bold transition-colors ${images.length > 0 ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
            >
                {images.length > 0 ? 'Change Folder' : 'Select Folder'}
            </button>
          </div>

          {/* Labels Section */}
          <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className="bg-emerald-900/50 p-2 rounded text-emerald-400">
                   <FolderInput size={24} />
               </div>
               <div>
                   <h3 className="font-semibold text-slate-200">Labels Folder</h3>
                   <p className="text-xs text-slate-500">{labels.size > 0 ? `${labels.size} labels loaded` : 'Select folder containing YOLO .txt files'}</p>
               </div>
            </div>
            <button 
                onClick={handleSelectLabelFolder}
                className={`px-4 py-2 rounded text-sm font-bold transition-colors ${labels.size > 0 ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
            >
                {labels.size > 0 ? 'Change Folder' : 'Select Folder'}
            </button>
          </div>

          {/* Classes Section */}
          <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className="bg-amber-900/50 p-2 rounded text-amber-400">
                   <FileText size={24} />
               </div>
               <div>
                   <h3 className="font-semibold text-slate-200">Classes File</h3>
                   <p className="text-xs text-slate-500">{classes.length > 0 ? `${classes.length} classes loaded` : 'Select classes.txt (Optional)'}</p>
               </div>
            </div>
            <button 
                onClick={handleSelectClassFile}
                className={`px-4 py-2 rounded text-sm font-bold transition-colors ${classes.length > 0 ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
            >
                {classes.length > 0 ? 'Change File' : 'Select File'}
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 bg-red-900/20 p-3 rounded-lg border border-red-900/50">
              <AlertCircle size={18} />
              <p className="text-sm">{error}</p>
            </div>
          )}
          
          {loading && (
             <div className="text-center text-sm text-slate-400 animate-pulse">Scanning files...</div>
          )}

          <button
            onClick={handleStart}
            disabled={images.length === 0 || loading}
            className={`w-full py-3 rounded-lg font-bold text-lg transition-all flex items-center justify-center gap-2
              ${images.length > 0 && !loading
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/20' 
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
          >
            Start Inspection <Upload size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};
