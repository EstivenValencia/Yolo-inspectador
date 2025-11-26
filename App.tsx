import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SetupScreen } from './components/SetupScreen';
import { ImageViewer } from './components/ImageViewer';
import { DetailPanel } from './components/DetailPanel';
import { ImageAsset, YoloLabel, FileSystemFileHandle, FileSystemDirectoryHandle } from './types';
import { parseYoloString, serializeYoloString } from './utils/yoloHelper';
import { ArrowLeft, ArrowRight, Image as ImageIcon, Filter, CheckCircle, Save, PlusSquare, BoxSelect, Home, Search, Keyboard, X } from 'lucide-react';

const App: React.FC = () => {
  const [isSetup, setIsSetup] = useState(false);
  
  // Data State
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [labelsRaw, setLabelsRaw] = useState<Map<string, string>>(new Map());
  const [labelHandles, setLabelHandles] = useState<Map<string, FileSystemFileHandle>>(new Map());
  const [labelsDirHandle, setLabelsDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [classes, setClasses] = useState<string[]>([]);
  
  // View State
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [currentLabelIdx, setCurrentLabelIdx] = useState(0);
  const [panelWidth, setPanelWidth] = useState(400); 
  const [isResizing, setIsResizing] = useState(false);
  const [filterClassId, setFilterClassId] = useState<number>(-1); 
  
  // Persistent Zoom/Display Settings
  const [zoomSettings, setZoomSettings] = useState<{context: number, mag: number}>(() => {
     try {
       const saved = localStorage.getItem('defect_inspector_zoom');
       return saved ? JSON.parse(saved) : { context: 30, mag: 1 };
     } catch {
       return { context: 30, mag: 1 };
     }
  });

  useEffect(() => {
     localStorage.setItem('defect_inspector_zoom', JSON.stringify(zoomSettings));
  }, [zoomSettings]);

  // Modes
  const [isCreating, setIsCreating] = useState(false); // Creation Mode (Key: e)
  const [showBoxFill, setShowBoxFill] = useState(false); // Box Fill Mode (Key: f)
  const [showHelp, setShowHelp] = useState(false); // Help Modal (Key: Ctrl+H)
  
  // Class Selector Modal State (Key: r)
  const [showClassSelector, setShowClassSelector] = useState(false);
  const [selectorIndex, setSelectorIndex] = useState(0);
  const classSelectorRef = useRef<HTMLDivElement>(null);

  // Working State
  const [currentLabels, setCurrentLabels] = useState<YoloLabel[]>([]);
  const [lastSaveStatus, setLastSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Load Setup Data
  const handleSetupComplete = (
    loadedImages: ImageAsset[], 
    loadedLabels: Map<string, string>, 
    loadedLabelHandles: Map<string, FileSystemFileHandle>,
    dirHandle: FileSystemDirectoryHandle | null,
    loadedClasses: string[]
  ) => {
    setImages(loadedImages);
    setLabelsRaw(loadedLabels);
    setLabelHandles(loadedLabelHandles);
    setLabelsDirHandle(dirHandle);
    setClasses(loadedClasses);
    setIsSetup(true);
    setCurrentImageIdx(0);
  };

  const handleHome = () => {
      if (window.confirm("Return to Home? Unsaved changes to the current image might be lost if not yet written to disk.")) {
          setIsSetup(false);
          setImages([]);
          setLabelsRaw(new Map());
          setCurrentLabels([]);
      }
  };

  // Resizing Logic for Panel
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 300 && newWidth <= 1200) {
        setPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  // --- Filtering Logic ---
  const filteredImages = useMemo(() => {
    if (filterClassId === -1) return images;

    // Special Filter: Unlabeled Images (-2)
    if (filterClassId === -2) {
        return images.filter(img => {
            const key = img.name.replace(/\.[^/.]+$/, "");
            const raw = labelsRaw.get(key);
            // Considered unlabeled if no entry or empty content
            if (!raw) return true;
            const labels = parseYoloString(raw);
            return labels.length === 0;
        });
    }

    return images.filter(img => {
       const key = img.name.replace(/\.[^/.]+$/, "");
       const rawContent = labelsRaw.get(key);
       if (!rawContent) return false;
       const labels = parseYoloString(rawContent);
       return labels.some(l => l.classId === filterClassId);
    });
  }, [images, labelsRaw, filterClassId]);

  useEffect(() => {
    setCurrentImageIdx(0);
  }, [filterClassId]);


  // --- Data Loading ---
  useEffect(() => {
    if (!isSetup || filteredImages.length === 0) {
      setCurrentLabels([]);
      setCurrentLabelIdx(-1);
      return;
    }

    const effectiveIdx = Math.min(currentImageIdx, filteredImages.length - 1);
    if (effectiveIdx !== currentImageIdx) {
        setCurrentImageIdx(effectiveIdx);
        return; 
    }

    const img = filteredImages[effectiveIdx];
    if (!img) return;

    const key = img.name.replace(/\.[^/.]+$/, "");
    
    const rawContent = labelsRaw.get(key) || "";
    const parsed = parseYoloString(rawContent);
    
    setCurrentLabels(parsed);
    
    // Reset temporary modes
    setIsCreating(false);
    setShowClassSelector(false);

    if (parsed.length > 0) {
       if (filterClassId !== -1 && filterClassId !== -2) {
          const matchIdx = parsed.findIndex(l => l.classId === filterClassId);
          if (matchIdx !== -1) {
            setCurrentLabelIdx(matchIdx);
          } else {
             setCurrentLabelIdx(0);
          }
       } else {
           if (currentLabelIdx >= parsed.length || currentLabelIdx < 0) {
             setCurrentLabelIdx(0);
           }
       }
    } else {
      setCurrentLabelIdx(-1);
    }
    
    setLastSaveStatus('idle');
  }, [currentImageIdx, filteredImages, labelsRaw, isSetup, filterClassId]);


  // --- Navigation Handlers ---
  const nextImage = useCallback(() => {
    if (currentImageIdx < filteredImages.length - 1) {
      setCurrentImageIdx(prev => prev + 1);
    }
  }, [currentImageIdx, filteredImages.length]);

  const prevImage = useCallback(() => {
    if (currentImageIdx > 0) {
      setCurrentImageIdx(prev => prev - 1);
    }
  }, [currentImageIdx]);

  const nextLabel = useCallback(() => {
    if (currentLabels.length === 0) return;
    setCurrentLabelIdx(prev => (prev + 1) % currentLabels.length);
  }, [currentLabels.length]);

  const prevLabel = useCallback(() => {
    if (currentLabels.length === 0) return;
    setCurrentLabelIdx(prev => (prev - 1 + currentLabels.length) % currentLabels.length);
  }, [currentLabels.length]);

  // --- Core Update, Create & Save Logic ---
  const handleLabelUpdate = (updatedLabel: YoloLabel) => {
    const newLabels = [...currentLabels];
    if (currentLabelIdx >= 0 && currentLabelIdx < newLabels.length) {
        newLabels[currentLabelIdx] = updatedLabel;
        setCurrentLabels(newLabels);
        updateRawDataAndSave(newLabels);
    }
  };

  const handleLabelCreate = (newLabel: YoloLabel) => {
      // Use the currently selected class ID if available, otherwise 0
      const defaultClass = currentLabels.length > 0 && currentLabelIdx !== -1 
          ? currentLabels[currentLabelIdx].classId 
          : 0;

      const labelToAdd = { ...newLabel, classId: defaultClass };
      const newLabels = [...currentLabels, labelToAdd];
      
      setCurrentLabels(newLabels);
      setCurrentLabelIdx(newLabels.length - 1); // Select the new label
      setIsCreating(false); // Turn off create mode after creation
      updateRawDataAndSave(newLabels);
  };

  const handleLabelDelete = () => {
      if (currentLabelIdx >= 0 && currentLabelIdx < currentLabels.length) {
          const newLabels = [...currentLabels];
          // Removes ONLY the specific label at currentLabelIdx
          newLabels.splice(currentLabelIdx, 1);
          
          setCurrentLabels(newLabels);
          
          // Smart selection: Select previous one, or 0, or -1 if empty
          if (newLabels.length > 0) {
              const newIdx = Math.max(0, currentLabelIdx - 1);
              setCurrentLabelIdx(newIdx);
          } else {
              setCurrentLabelIdx(-1);
          }
          
          updateRawDataAndSave(newLabels);
      }
  };

  const updateRawDataAndSave = async (newLabels: YoloLabel[]) => {
      if (!filteredImages[currentImageIdx]) return;

      const imgKey = filteredImages[currentImageIdx].name.replace(/\.[^/.]+$/, "");
      const newRaw = serializeYoloString(newLabels);
      
      // 1. Update In-Memory State for fast UI response
      const newLabelsMap = new Map(labelsRaw);
      newLabelsMap.set(imgKey, newRaw);
      setLabelsRaw(newLabelsMap);

      // 2. Write to Disk
      setLastSaveStatus('saving');
      try {
        let handle = labelHandles.get(imgKey);
        
        // If handle doesn't exist, we need to create the file in the directory
        if (!handle && labelsDirHandle) {
             handle = await labelsDirHandle.getFileHandle(`${imgKey}.txt`, { create: true });
             // Update handles map
             const newHandles = new Map(labelHandles);
             newHandles.set(imgKey, handle);
             setLabelHandles(newHandles);
        }

        if (handle) {
            const writable = await handle.createWritable();
            await writable.write(newRaw);
            await writable.close();
            setLastSaveStatus('saved');
            
            // Revert status after 1.5s
            setTimeout(() => setLastSaveStatus('idle'), 1500);
        } else {
            console.error("No file handle and no directory handle available.");
            setLastSaveStatus('error');
        }

      } catch (err: any) {
          console.error("Failed to save to disk:", err);
          setLastSaveStatus('error');
      }
  }

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    if (!isSetup) return;

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

        const key = e.key.toLowerCase();

        // -----------------------
        // HELP TOGGLE (Global)
        // -----------------------
        if (e.ctrlKey && key === 'h') {
          e.preventDefault();
          setShowHelp(prev => !prev);
          return;
        }

        if (showHelp) {
            if (key === 'escape') setShowHelp(false);
            return; 
        }

        // -----------------------
        // MODAL MODE: Class Selector
        // -----------------------
        if (showClassSelector) {
            e.preventDefault(); // Block all other interaction
            
            if (key === 'escape' || key === 'r') {
                setShowClassSelector(false);
            } else if (key === 'arrowup' || key === 'w') {
                setSelectorIndex(prev => Math.max(0, prev - 1));
                // Scroll into view logic could go here if list is long
            } else if (key === 'arrowdown' || key === 's') {
                setSelectorIndex(prev => Math.min(classes.length - 1, prev + 1));
            } else if (key === 'enter') {
                if (currentLabels[currentLabelIdx]) {
                    handleLabelUpdate({
                        ...currentLabels[currentLabelIdx],
                        classId: selectorIndex
                    });
                }
                setShowClassSelector(false);
            }
            return;
        }

        // -----------------------
        // NORMAL MODE
        // -----------------------
        switch (key) {
            case 'd': // Next Image
            case 'arrowright':
                e.preventDefault();
                nextImage();
                break;
            case 'a': // Prev Image
            case 'arrowleft':
                e.preventDefault();
                prevImage();
                break;
            case 'w': // Next Defect (Up)
            case 'arrowup':
                e.preventDefault();
                nextLabel();
                break;
            case 's': // Prev Defect (Down)
            case 'arrowdown':
                e.preventDefault();
                prevLabel();
                break;
            
            // REASSIGNED SHORTCUTS
            case 'q': // Delete Label (Was n)
            case 'delete':
                e.preventDefault();
                handleLabelDelete();
                break;
            case 'e': // Mode: Create (Was m)
                e.preventDefault();
                setIsCreating(prev => !prev);
                break;
            case 'f': // Mode: Box Fill (Was b)
                e.preventDefault();
                setShowBoxFill(prev => !prev);
                break;
            
            // NEW SHORTCUT
            case 'r': // Rename / Reclassify
                if (currentLabels.length > 0 && currentLabelIdx !== -1) {
                    e.preventDefault();
                    setSelectorIndex(currentLabels[currentLabelIdx].classId);
                    setShowClassSelector(true);
                }
                break;

            case 'escape': // Cancel create mode
                if (isCreating) {
                  e.preventDefault();
                  setIsCreating(false);
                }
                break;
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSetup, nextImage, prevImage, nextLabel, prevLabel, handleLabelDelete, isCreating, showClassSelector, selectorIndex, classes, currentLabels, currentLabelIdx, showHelp]);

  // Ensure selector index is valid if classes change
  useEffect(() => {
     if (showClassSelector && selectorIndex >= classes.length) {
         setSelectorIndex(0);
     }
  }, [classes, showClassSelector, selectorIndex]);


  if (!isSetup) {
    return <SetupScreen onComplete={handleSetupComplete} />;
  }

  const currentImage = filteredImages[currentImageIdx];

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 overflow-hidden relative">
      
      {/* Top Header */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 z-20">
        <div className="flex items-center gap-4">
            <button 
                onClick={handleHome}
                className="bg-slate-800 hover:bg-slate-700 p-2 rounded-lg text-slate-300 border border-slate-700 transition-colors"
                title="Back to Home / Change Folders"
            >
                <Home size={20} />
            </button>
            
            <div className="flex items-center gap-3 border-l border-slate-700 pl-4">
                <div className="bg-indigo-600 p-1.5 rounded text-white">
                    <ImageIcon size={20} />
                </div>
                <div>
                    <h1 className="font-bold text-slate-100 text-sm leading-tight">YOLO Inspector</h1>
                    <p className="text-xs text-slate-500">
                    {currentImage ? currentImage.name : 'No images found'}
                    </p>
                </div>
            </div>
        </div>

        <div className="flex items-center gap-4">
             {/* Box Fill Toggle */}
             <button 
                onClick={() => setShowBoxFill(!showBoxFill)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold transition-all border ${showBoxFill ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}`}
                title="Toggle Box Fill (F)"
             >
                <BoxSelect size={14} />
                {showBoxFill ? 'Fill On (F)' : 'Fill Off (F)'}
             </button>

             {/* Mode Indicator Button */}
             <button 
                onClick={() => setIsCreating(!isCreating)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold transition-all border ${isCreating ? 'bg-indigo-600 border-indigo-500 text-white animate-pulse' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}`}
                title="Toggle Create Mode (E)"
             >
                <PlusSquare size={14} />
                {isCreating ? 'CREATING MODE' : 'Create New Box (E)'}
             </button>

             {/* Filter Dropdown */}
             <div className="flex items-center gap-2 mr-2 border-r border-slate-700 pr-4">
                <Filter size={16} className="text-slate-400" />
                <span className="text-xs text-slate-400 font-semibold uppercase hidden sm:block">Filter:</span>
                <select 
                    value={filterClassId} 
                    onChange={(e) => setFilterClassId(parseInt(e.target.value))}
                    className="bg-slate-800 text-slate-200 text-xs p-1.5 rounded border border-slate-700 focus:ring-1 focus:ring-indigo-500 outline-none max-w-[150px] cursor-pointer"
                >
                    <option value={-1}>All Defects</option>
                    <option value={-2}>Unlabeled Images</option>
                    {classes.map((cls, idx) => (
                        <option key={idx} value={idx}>{idx}: {cls}</option>
                    ))}
                </select>
            </div>

            <div className="flex items-center gap-4 bg-slate-800 p-1 rounded-lg border border-slate-700">
                <button 
                    onClick={prevImage}
                    disabled={filteredImages.length === 0 || currentImageIdx === 0}
                    className="p-2 hover:bg-slate-700 rounded text-slate-300 disabled:opacity-30 transition-colors"
                >
                    <ArrowLeft size={18} />
                </button>
                <span className="text-sm font-mono text-slate-400 min-w-[80px] text-center">
                    {filteredImages.length > 0 ? currentImageIdx + 1 : 0} / {filteredImages.length}
                </span>
                <button 
                    onClick={nextImage}
                    disabled={filteredImages.length === 0 || currentImageIdx === filteredImages.length - 1}
                    className="p-2 hover:bg-slate-700 rounded text-slate-300 disabled:opacity-30 transition-colors"
                >
                    <ArrowRight size={18} />
                </button>
            </div>
            
            <button 
                onClick={() => setShowHelp(true)}
                className="p-2 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors border border-transparent hover:border-slate-600"
                title="Keyboard Shortcuts (Ctrl+H)"
            >
                <Keyboard size={20} />
            </button>
        </div>

        <div className="w-40 flex justify-end items-center gap-2">
            {lastSaveStatus === 'saving' && (
                <span className="text-xs text-indigo-400 flex items-center gap-1"><Save size={12} className="animate-spin" /> Saving...</span>
            )}
            {lastSaveStatus === 'saved' && (
                <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle size={12} /> Saved</span>
            )}
            {lastSaveStatus === 'error' && (
                <span className="text-xs text-red-400">Save Error</span>
            )}
            <span className="text-xs text-slate-600 ml-2">v1.8.0</span>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {(filteredImages.length === 0 || !currentImage) ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                <ImageIcon size={48} className="mb-4 opacity-50" />
                <p className="text-lg font-semibold">No images found</p>
                {filterClassId === -2 && (
                    <p className="text-sm mt-2">No unlabeled images in this folder!</p>
                )}
            </div>
        ) : (
            <>
                {/* Left: Image Viewer */}
                <ImageViewer 
                    image={currentImage}
                    labels={currentLabels}
                    currentLabelIndex={currentLabelIdx}
                    classes={classes}
                    isCreating={isCreating}
                    showBoxFill={showBoxFill}
                    onSelectLabel={setCurrentLabelIdx}
                    onUpdateLabel={handleLabelUpdate}
                    onCreateLabel={handleLabelCreate}
                />

                {/* Resizer Handle */}
                <div 
                onMouseDown={startResizing}
                className={`w-2 bg-slate-800 hover:bg-indigo-500 cursor-col-resize flex items-center justify-center transition-colors z-30 shrink-0 ${isResizing ? 'bg-indigo-500' : ''}`}
                >
                <div className="h-8 w-1 rounded-full bg-slate-600/50"></div>
                </div>

                {/* Right: Details & Zoom */}
                <DetailPanel 
                    width={panelWidth}
                    currentImage={currentImage}
                    currentLabel={currentLabels[currentLabelIdx] || null}
                    classes={classes}
                    totalLabels={currentLabels.length}
                    currentLabelIndex={currentLabelIdx}
                    onNextLabel={nextLabel}
                    onPrevLabel={prevLabel}
                    onUpdateLabel={handleLabelUpdate}
                    onDeleteLabel={handleLabelDelete}
                    isCreating={isCreating}
                    onToggleCreateMode={() => setIsCreating(prev => !prev)}
                    zoomSettings={zoomSettings}
                    onZoomSettingsChange={setZoomSettings}
                />
            </>
        )}

        {/* --- HELP MODAL --- */}
        {showHelp && (
            <div className="absolute inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowHelp(false)}>
                <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl max-w-2xl w-full p-6" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Keyboard className="text-indigo-400" /> Keyboard Shortcuts
                        </h2>
                        <button onClick={() => setShowHelp(false)} className="text-slate-400 hover:text-white">
                            <X size={24} />
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-slate-400 uppercase border-b border-slate-700 pb-2">Navigation</h3>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">Previous / Next Image</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">A / D</span>
                            </div>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">Previous / Next Label</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">W / S</span>
                            </div>
                        </div>

                        <div className="space-y-4">
                             <h3 className="text-sm font-bold text-slate-400 uppercase border-b border-slate-700 pb-2">Editing</h3>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">Create New Box</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">E</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">Delete Selected</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">Q</span>
                            </div>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">Change Class</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">R</span>
                            </div>
                        </div>

                        <div className="space-y-4">
                             <h3 className="text-sm font-bold text-slate-400 uppercase border-b border-slate-700 pb-2">View Controls</h3>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">Toggle Box Fill</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">F</span>
                            </div>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">Pan Image</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">Click & Drag</span>
                            </div>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">Zoom Image</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">Ctrl + Scroll</span>
                            </div>
                        </div>
                        
                         <div className="space-y-4">
                             <h3 className="text-sm font-bold text-slate-400 uppercase border-b border-slate-700 pb-2">General</h3>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">Toggle Help</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">Ctrl + H</span>
                            </div>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">Cancel / Close</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">Esc</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* --- CLASS SELECTOR MODAL --- */}
        {showClassSelector && (
            <div className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center">
                <div 
                    ref={classSelectorRef}
                    className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-96 max-h-[80vh] flex flex-col"
                >
                    <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Search size={20} className="text-indigo-400" /> 
                            Select Class
                        </h3>
                        <div className="text-xs text-slate-400 flex flex-col items-end">
                            <span>Navigate: <b>W / S</b></span>
                            <span>Confirm: <b>Enter</b></span>
                        </div>
                    </div>
                    
                    <div className="overflow-y-auto flex-1 p-2 space-y-1">
                        {classes.map((cls, idx) => {
                            const isActive = idx === selectorIndex;
                            return (
                                <div 
                                    key={idx}
                                    onClick={() => {
                                        setSelectorIndex(idx);
                                        // Optional: Double click to select logic could go here
                                    }}
                                    className={`px-4 py-3 rounded-lg cursor-pointer flex items-center justify-between transition-colors ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
                                >
                                    <span className="font-mono text-sm opacity-60 mr-3 w-6 text-right">{idx}</span>
                                    <span className="flex-1 font-semibold">{cls}</span>
                                    {isActive && <CheckCircle size={16} />}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default App;