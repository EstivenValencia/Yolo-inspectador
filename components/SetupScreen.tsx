import React, { useState, useEffect } from 'react';
import { Upload, FolderInput, FileText, AlertCircle, Clock, ArrowRight, HelpCircle, BookOpen } from 'lucide-react';
import { ImageAsset, FileSystemDirectoryHandle, FileSystemFileHandle } from '../types';
import { saveSessionToDB, getSessionsFromDB, verifyPermission, StoredSession } from '../utils/storage';
import { Tutorial } from './Tutorial';

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
  // Handles
  const [imagesDirHandle, setImagesDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [labelsDirHandle, setLabelsDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [classFileHandle, setClassFileHandle] = useState<FileSystemFileHandle | null>(null);

  // UI Display Strings
  const [imagesFolderName, setImagesFolderName] = useState<string>("");
  const [labelsFolderName, setLabelsFolderName] = useState<string>("");
  const [classFileName, setClassFileName] = useState<string>("");

  // Data
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [labelHandles, setLabelHandles] = useState<Map<string, FileSystemFileHandle>>(new Map());
  const [classes, setClasses] = useState<string[]>([]);
  
  // State
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<StoredSession[]>([]);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showIntroPrompt, setShowIntroPrompt] = useState(false);

  const hasFileSystemApi = typeof window.showDirectoryPicker === 'function';

  // --- Initialization & History ---
  useEffect(() => {
    loadHistory();
    checkIntroStatus();
  }, []);

  const loadHistory = async () => {
    try {
        const sessions = await getSessionsFromDB();
        setHistory(sessions);
    } catch (e) {
        console.error("Failed to load history", e);
    }
  };

  const checkIntroStatus = () => {
      const skipped = localStorage.getItem('yolo_inspector_skip_intro');
      if (!skipped) {
          setShowIntroPrompt(true);
      }
  };

  const handleIntroResponse = (wantTutorial: boolean) => {
      setShowIntroPrompt(false);
      localStorage.setItem('yolo_inspector_skip_intro', 'true');
      if (wantTutorial) {
          setShowTutorial(true);
      }
  };

  // --- Logic Helpers ---

  const scanDirectoryForImages = async (dirHandle: FileSystemDirectoryHandle): Promise<ImageAsset[]> => {
    const files: ImageAsset[] = [];
    async function traverse(handle: FileSystemDirectoryHandle) {
      for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
          const fileHandle = entry as FileSystemFileHandle;
          if (fileHandle.name.match(/\.(jpg|jpeg|png|bmp|webp)$/i)) {
              const file = await fileHandle.getFile();
              files.push({
                name: fileHandle.name,
                url: URL.createObjectURL(file),
                file: file,
                handle: fileHandle
              });
          }
        } else if (entry.kind === 'directory') {
          await traverse(entry as FileSystemDirectoryHandle);
        }
      }
    }
    await traverse(dirHandle);
    return files.sort((a, b) => a.name.localeCompare(b.name));
  };

  const scanDirectoryForLabels = async (dirHandle: FileSystemDirectoryHandle) => {
    const newLabels = new Map<string, string>();
    const newHandles = new Map<string, FileSystemFileHandle>();

    async function traverse(handle: FileSystemDirectoryHandle) {
        for await (const entry of handle.values()) {
            if (entry.kind === 'file') {
                const fileHandle = entry as FileSystemFileHandle;
                if (fileHandle.name.endsWith('.txt') && fileHandle.name !== 'classes.txt') {
                     const file = await fileHandle.getFile();
                     const text = await file.text();
                     const key = fileHandle.name.replace(/\.[^/.]+$/, "");
                     newLabels.set(key, text);
                     newHandles.set(key, fileHandle);
                }
            } else if (entry.kind === 'directory') {
                await traverse(entry as FileSystemDirectoryHandle);
            }
        }
    }
    await traverse(dirHandle);
    return { newLabels, newHandles };
  };

  const parseClassesFile = async (handle: FileSystemFileHandle): Promise<string[]> => {
      const file = await handle.getFile();
      const text = await file.text();
      return text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
  };

  // --- Handlers ---

  const handleHistorySelect = async (session: StoredSession) => {
    try {
        setLoading(true);
        setError(null);

        // 1. Re-verify permissions for Image Folder
        const imgAccess = await verifyPermission(session.imagesHandle, false);
        if (!imgAccess) throw new Error("Permission to image folder denied.");
        
        // 2. Load Images
        setImagesDirHandle(session.imagesHandle);
        setImagesFolderName(session.imagesFolderName);
        const loadedImages = await scanDirectoryForImages(session.imagesHandle);
        setImages(loadedImages);

        // 3. Re-verify Labels Folder
        const lblAccess = await verifyPermission(session.labelsHandle, true);
        if (!lblAccess) throw new Error("Permission to label folder denied.");
        
        setLabelsDirHandle(session.labelsHandle);
        setLabelsFolderName(session.labelsFolderName);
        const { newLabels, newHandles } = await scanDirectoryForLabels(session.labelsHandle);
        setLabels(newLabels);
        setLabelHandles(newHandles);

        // 4. Classes (Optional)
        if (session.classHandle) {
             const clsAccess = await verifyPermission(session.classHandle, false);
             if (clsAccess) {
                 const loadedClasses = await parseClassesFile(session.classHandle);
                 setClasses(loadedClasses);
                 setClassFileHandle(session.classHandle);
                 setClassFileName(session.classHandle.name);
             }
        } else {
            // Try to find classes.txt in the label dir
            try {
                const autoHandle = await session.labelsHandle.getFileHandle('classes.txt');
                const loadedClasses = await parseClassesFile(autoHandle);
                setClasses(loadedClasses);
            } catch {
                setClasses([]);
            }
        }

        // If successful, bump date
        saveSessionToDB({ ...session, id: Date.now(), date: new Date().toLocaleString() });

    } catch (err: any) {
        setError(err.message || "Failed to restore session. Folders might have moved.");
    } finally {
        setLoading(false);
    }
  };

  const handleSelectImageFolder = async () => {
    try {
      const handle = await window.showDirectoryPicker({ id: 'images', mode: 'read' });
      setImagesDirHandle(handle);
      setImagesFolderName(handle.name);
      setLoading(true);
      
      const loadedImages = await scanDirectoryForImages(handle);
      setImages(loadedImages);
    } catch (err: any) {
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectLabelFolder = async () => {
    try {
      const handle = await window.showDirectoryPicker({ id: 'labels', mode: 'readwrite' });
      setLabelsDirHandle(handle);
      setLabelsFolderName(handle.name);
      setLoading(true);

      const { newLabels, newHandles } = await scanDirectoryForLabels(handle);
      setLabels(newLabels);
      setLabelHandles(newHandles);
    } catch (err: any) {
       if (err.name !== 'AbortError') setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectClassFile = async () => {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Text Files', accept: { 'text/plain': ['.txt'] } }],
        multiple: false
      });
      setClassFileHandle(handle);
      setClassFileName(handle.name);
      const parsed = await parseClassesFile(handle);
      setClasses(parsed);
    } catch (err: any) {
      // Ignore
    }
  };

  const handleStart = async () => {
    if (!imagesDirHandle || images.length === 0) {
      setError("Please load a folder containing images.");
      return;
    }

    setLoading(true);
    let finalLabelsHandle = labelsDirHandle;
    let finalClasses = [...classes];
    let finalLabelHandles = new Map(labelHandles);
    let finalLabelsData = new Map(labels);

    try {
        // 1. Logic: If no Label Folder, create/use 'labels' folder inside Image Folder
        if (!finalLabelsHandle) {
            try {
                // Try to get or create 'labels' directory inside the image directory
                // Note: This requires readwrite permission on image directory if we are creating it.
                // We initially asked for 'read' on images. We might need to request upgrade.
                
                // If the user didn't give Write access to images, we can't create a subfolder.
                // We will try to request it.
                const hasWrite = await verifyPermission(imagesDirHandle, true);
                if (!hasWrite) {
                    throw new Error("Write permission needed on Images folder to create Labels folder.");
                }

                finalLabelsHandle = await imagesDirHandle.getDirectoryHandle('labels', { create: true });
                setLabelsDirHandle(finalLabelsHandle);
                
                // Scan this new (or existing) folder just in case
                const scan = await scanDirectoryForLabels(finalLabelsHandle);
                finalLabelsData = scan.newLabels;
                finalLabelHandles = scan.newHandles;

            } catch (e) {
                console.warn("Could not create labels subfolder, using root image folder as labels folder (fallback).");
                finalLabelsHandle = imagesDirHandle;
                // If falling back to root, we already scanned images, but maybe not txt files?
                // Let's rescan root for txts
                const scan = await scanDirectoryForLabels(imagesDirHandle);
                finalLabelsData = scan.newLabels;
                finalLabelHandles = scan.newHandles;
            }
        }

        // 2. Logic: If no classes loaded, look for classes.txt in the final label dir
        if (finalClasses.length === 0 && finalLabelsHandle) {
             try {
                 const existingClassHandle = await finalLabelsHandle.getFileHandle('classes.txt');
                 const parsed = await parseClassesFile(existingClassHandle);
                 if (parsed.length > 0) {
                     finalClasses = parsed;
                     setClassFileHandle(existingClassHandle);
                 } else {
                     // Empty file, default to generic
                     finalClasses = Array.from({ length: 80 }, (_, i) => `Class ${i}`);
                 }
             } catch (e) {
                 // File doesn't exist. Create it.
                 try {
                     const newClassHandle = await finalLabelsHandle.getFileHandle('classes.txt', { create: true });
                     const writable = await newClassHandle.createWritable();
                     // Write a default or empty? Let's leave it empty but create it so user can edit.
                     await writable.write(""); 
                     await writable.close();
                     
                     finalClasses = Array.from({ length: 80 }, (_, i) => `Class ${i}`);
                     setClassFileHandle(newClassHandle);
                 } catch (createErr) {
                     console.error("Could not create classes.txt", createErr);
                     finalClasses = Array.from({ length: 80 }, (_, i) => `Class ${i}`);
                 }
             }
        } else if (finalClasses.length === 0) {
             finalClasses = Array.from({ length: 80 }, (_, i) => `Class ${i}`);
        }

        // 3. Save to History (IndexedDB)
        const session: StoredSession = {
            id: Date.now(),
            date: new Date().toLocaleString(),
            imagesHandle: imagesDirHandle,
            labelsHandle: finalLabelsHandle!,
            classHandle: classFileHandle || undefined,
            imagesFolderName: imagesDirHandle.name,
            labelsFolderName: finalLabelsHandle!.name
        };
        await saveSessionToDB(session);

        // 4. Complete
        onComplete(images, finalLabelsData, finalLabelHandles, finalLabelsHandle, finalClasses);

    } catch (err: any) {
        setError(err.message || "An unexpected error occurred during startup.");
    } finally {
        setLoading(false);
    }
  };

  return (
    <>
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-6 relative">
      <div className="bg-slate-800 p-8 rounded-xl shadow-2xl border border-slate-700 max-w-2xl w-full relative z-10">
        <div className="flex justify-between items-start mb-2">
            <h1 className="text-3xl font-bold text-white">YOLO Defect Inspector</h1>
            <button 
                onClick={() => setShowTutorial(true)}
                className="text-slate-400 hover:text-indigo-400 transition-colors flex items-center gap-2 text-sm font-semibold bg-slate-700/50 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-indigo-500/50"
            >
                <BookOpen size={16} /> Guide
            </button>
        </div>
        
        <p className="text-slate-400 mb-8">
            Load your local dataset folders. 
            <span className="block text-indigo-400 text-xs mt-2 font-semibold">
                Changes will be auto-saved to disk.
            </span>
        </p>

        <div className="space-y-6">
            {/* History Quick Select */}
            {history.length > 0 && images.length === 0 && (
                <div className="bg-slate-900/30 p-4 rounded-lg border border-slate-700/50 mb-6">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Clock size={14} /> Recent Sessions
                    </h3>
                    <div className="space-y-2">
                        {history.map(item => (
                            <button 
                                key={item.id}
                                onClick={() => handleHistorySelect(item)}
                                className="w-full text-left p-3 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-indigo-500/50 transition-all group"
                            >
                                <div className="flex justify-between items-center">
                                    <div>
                                        <div className="text-sm font-semibold text-slate-200 group-hover:text-indigo-300">
                                            {item.imagesFolderName} <span className="text-slate-500 mx-1">+</span> {item.labelsFolderName}
                                        </div>
                                        <div className="text-[10px] text-slate-500">{item.date}</div>
                                    </div>
                                    <ArrowRight size={14} className="text-slate-600 group-hover:text-indigo-400" />
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
          
          {/* Images Section */}
          <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className="bg-indigo-900/50 p-2 rounded text-indigo-400">
                   <FolderInput size={24} />
               </div>
               <div>
                   <h3 className="font-semibold text-slate-200">Images Folder <span className="text-red-400">*</span></h3>
                   <p className="text-xs text-slate-500">{images.length > 0 ? `${images.length} images loaded (${imagesFolderName})` : 'Required'}</p>
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
                   <p className="text-xs text-slate-500">
                       {labels.size > 0 ? `${labels.size} labels loaded (${labelsFolderName})` : 'Optional. Will create "labels" folder if missing.'}
                   </p>
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
                   <p className="text-xs text-slate-500">{classes.length > 0 ? `${classes.length} classes loaded (${classFileName})` : 'Optional. Will create classes.txt if missing.'}</p>
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
             <div className="text-center text-sm text-slate-400 animate-pulse">Processing files...</div>
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

      {/* Intro Prompt Modal */}
      {showIntroPrompt && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-800 border-2 border-indigo-500/30 rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
                <HelpCircle size={48} className="text-indigo-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">Welcome!</h2>
                <p className="text-slate-300 mb-8">
                    Is this your first time using YOLO Inspector? Would you like a quick tour of the features?
                </p>
                <div className="flex gap-4">
                    <button 
                        onClick={() => handleIntroResponse(false)}
                        className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold transition-colors"
                    >
                        No, skip it
                    </button>
                    <button 
                        onClick={() => handleIntroResponse(true)}
                        className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/25 transition-all"
                    >
                        Yes, show me
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Full Tutorial Overlay */}
      {showTutorial && <Tutorial onClose={() => setShowTutorial(false)} />}
    </div>
    </>
  );
};