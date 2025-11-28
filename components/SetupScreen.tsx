import React, { useState, useEffect } from 'react';
import { Upload, FolderInput, FileText, AlertCircle, Clock, ArrowRight, HelpCircle, BookOpen, Globe } from 'lucide-react';
import { ImageAsset, FileSystemDirectoryHandle, FileSystemFileHandle } from '../types';
import { saveSessionToDB, getSessionsFromDB, verifyPermission, StoredSession } from '../utils/storage';
import { Tutorial } from './Tutorial';
import { translations } from '../utils/translations';

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
    classes: string[],
    classFileHandle: FileSystemFileHandle | null
  ) => void;
  lang?: 'en' | 'es';
  onToggleLang?: (lang: 'en' | 'es') => void;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({ onComplete, lang = 'en', onToggleLang }) => {
  const t = translations[lang].setup;
  const tTutorial = translations[lang].tutorial;

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
      const skipped = localStorage.getItem('yolo_inspector_intro_seen');
      if (!skipped) {
          setShowIntroPrompt(true);
      }
  };

  const handleIntroResponse = (wantTutorial: boolean) => {
      setShowIntroPrompt(false);
      localStorage.setItem('yolo_inspector_intro_seen', 'true');
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

        const imgAccess = await verifyPermission(session.imagesHandle, true); 
        if (!imgAccess) throw new Error("Permission to image folder denied.");
        
        setImagesDirHandle(session.imagesHandle);
        setImagesFolderName(session.imagesHandle.name);
        const loadedImages = await scanDirectoryForImages(session.imagesHandle);
        setImages(loadedImages);

        const lblAccess = await verifyPermission(session.labelsHandle, true);
        if (!lblAccess) throw new Error("Permission to label folder denied.");
        
        setLabelsDirHandle(session.labelsHandle);
        setLabelsFolderName(session.labelsHandle.name);
        const { newLabels, newHandles } = await scanDirectoryForLabels(session.labelsHandle);
        setLabels(newLabels);
        setLabelHandles(newHandles);

        let loadedClasses: string[] = [];
        let loadedClassHandle: FileSystemFileHandle | null = null;

        if (session.classHandle) {
             const clsAccess = await verifyPermission(session.classHandle, true);
             if (clsAccess) {
                 loadedClasses = await parseClassesFile(session.classHandle);
                 loadedClassHandle = session.classHandle;
                 setClassFileHandle(session.classHandle);
                 setClassFileName(session.classHandle.name);
             } else {
                 throw new Error("Permission to classes file denied.");
             }
        } 
        
        setClasses(loadedClasses);

        onComplete(
            loadedImages, 
            newLabels, 
            newHandles, 
            session.labelsHandle, 
            loadedClasses,
            loadedClassHandle
        );

    } catch (err: any) {
        setError(err.message || "Failed to restore session.");
        setLoading(false);
    }
  };

  const handleSelectImageFolder = async () => {
    try {
      const handle = await window.showDirectoryPicker({ id: 'images', mode: 'readwrite' });
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
      setError(t.errorImg);
      return;
    }

    setLoading(true);
    
    let finalImagesHandle = imagesDirHandle;
    let finalLabelsHandle = labelsDirHandle;
    let finalClassFileHandle = classFileHandle;
    
    let finalLabelsData = new Map(labels);
    let finalLabelHandles = new Map(labelHandles);
    let finalClasses = [...classes];

    try {
        if (!finalLabelsHandle) {
            try {
                finalLabelsHandle = await finalImagesHandle.getDirectoryHandle('labels', { create: true });
                setLabelsDirHandle(finalLabelsHandle);
                setLabelsFolderName(finalLabelsHandle.name);
                
                const scan = await scanDirectoryForLabels(finalLabelsHandle);
                finalLabelsData = scan.newLabels;
                finalLabelHandles = scan.newHandles;

            } catch (e) {
                console.error("Could not create labels subfolder", e);
                finalLabelsHandle = finalImagesHandle;
                const scan = await scanDirectoryForLabels(finalImagesHandle);
                finalLabelsData = scan.newLabels;
                finalLabelHandles = scan.newHandles;
            }
        }

        if (!finalClassFileHandle) {
             try {
                 finalClassFileHandle = await finalLabelsHandle.getFileHandle('classes.txt', { create: true });
                 finalClasses = await parseClassesFile(finalClassFileHandle);
             } catch (e) {
                 console.error("Could not create/read classes.txt", e);
                 finalClasses = [];
             }
        }

        const session: StoredSession = {
            id: Date.now(),
            date: new Date().toLocaleString(),
            imagesHandle: finalImagesHandle,
            labelsHandle: finalLabelsHandle!, 
            classHandle: finalClassFileHandle || undefined, 
            imagesFolderName: finalImagesHandle.name,
            labelsFolderName: finalLabelsHandle!.name
        };
        await saveSessionToDB(session);

        onComplete(
            images, 
            finalLabelsData, 
            finalLabelHandles, 
            finalLabelsHandle, 
            finalClasses,
            finalClassFileHandle
        );

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
            <h1 className="text-3xl font-bold text-white">{t.title}</h1>
            <div className="flex gap-2">
                 {/* Language Toggle */}
                <div className="flex items-center bg-slate-700/50 rounded-lg p-0.5 border border-slate-700">
                    <button 
                        onClick={() => onToggleLang && onToggleLang('en')}
                        className={`px-2 py-1 rounded text-xs font-bold transition-colors ${lang === 'en' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                        EN
                    </button>
                    <button 
                         onClick={() => onToggleLang && onToggleLang('es')}
                        className={`px-2 py-1 rounded text-xs font-bold transition-colors ${lang === 'es' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                        ES
                    </button>
                </div>

                <button 
                    onClick={() => setShowTutorial(true)}
                    className="text-slate-400 hover:text-indigo-400 transition-colors flex items-center gap-2 text-sm font-semibold bg-slate-700/50 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-indigo-500/50"
                >
                    <BookOpen size={16} /> {t.manual}
                </button>
            </div>
        </div>
        
        <p className="text-slate-400 mb-8">
            {t.desc} 
            <span className="block text-indigo-400 text-xs mt-2 font-semibold">
                {t.subDesc}
            </span>
        </p>

        <div className="space-y-6">
            {/* History Quick Select */}
            {history.length > 0 && images.length === 0 && (
                <div className="bg-slate-900/30 p-4 rounded-lg border border-slate-700/50 mb-6">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Clock size={14} /> {t.recent}
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
                   <h3 className="font-semibold text-slate-200">{t.imagesTitle} <span className="text-red-400">*</span></h3>
                   <p className="text-xs text-slate-500">{images.length > 0 ? `${images.length} ${t.imagesDesc} (${imagesFolderName})` : 'Required'}</p>
               </div>
            </div>
            <button 
                onClick={handleSelectImageFolder}
                className={`px-4 py-2 rounded text-sm font-bold transition-colors ${images.length > 0 ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
            >
                {images.length > 0 ? t.change : t.select}
            </button>
          </div>

          {/* Labels Section */}
          <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className="bg-emerald-900/50 p-2 rounded text-emerald-400">
                   <FolderInput size={24} />
               </div>
               <div>
                   <h3 className="font-semibold text-slate-200">{t.labelsTitle}</h3>
                   <p className="text-xs text-slate-500">
                       {labels.size > 0 ? `${labels.size} ${t.imagesDesc} (${labelsFolderName})` : t.labelsDesc}
                   </p>
               </div>
            </div>
            <button 
                onClick={handleSelectLabelFolder}
                className={`px-4 py-2 rounded text-sm font-bold transition-colors ${labels.size > 0 ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
            >
                {labels.size > 0 ? t.change : t.select}
            </button>
          </div>

          {/* Classes Section */}
          <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className="bg-amber-900/50 p-2 rounded text-amber-400">
                   <FileText size={24} />
               </div>
               <div>
                   <h3 className="font-semibold text-slate-200">{t.classesTitle}</h3>
                   <p className="text-xs text-slate-500">{classFileHandle ? `(${classFileName})` : t.classesDesc}</p>
               </div>
            </div>
            <button 
                onClick={handleSelectClassFile}
                className={`px-4 py-2 rounded text-sm font-bold transition-colors ${classFileHandle ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
            >
                {classFileHandle ? t.changeFile : t.select}
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 bg-red-900/20 p-3 rounded-lg border border-red-900/50">
              <AlertCircle size={18} />
              <p className="text-sm">{error}</p>
            </div>
          )}
          
          {loading && (
             <div className="text-center text-sm text-slate-400 animate-pulse">{t.processing}</div>
          )}

          <button
            onClick={handleStart}
            disabled={images.length === 0 || loading}
            className={`w-full py-3 rounded-lg font-bold text-lg transition-all flex items-center justify-center gap-2
              ${images.length > 0 && !loading
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/20' 
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
          >
            {t.start} <Upload size={20} />
          </button>
        </div>
      </div>

      {/* Intro Prompt Modal */}
      {showIntroPrompt && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-800 border-2 border-indigo-500/30 rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
                <HelpCircle size={48} className="text-indigo-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">{t.welcomeModal.title}</h2>
                <p className="text-slate-300 mb-8">
                    {t.welcomeModal.text}
                </p>
                <div className="flex gap-4">
                    <button 
                        onClick={() => handleIntroResponse(false)}
                        className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold transition-colors"
                    >
                        {t.welcomeModal.no}
                    </button>
                    <button 
                        onClick={() => handleIntroResponse(true)}
                        className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/25 transition-all"
                    >
                        {t.welcomeModal.yes}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Full Tutorial Overlay */}
      {showTutorial && <Tutorial onClose={() => setShowTutorial(false)} lang={lang} />}
    </div>
    </>
  );
};