import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SetupScreen } from './components/SetupScreen';
import { ImageViewer } from './components/ImageViewer';
import { DetailPanel } from './components/DetailPanel';
import { ImageAsset, YoloLabel } from './types';
import { parseYoloString, serializeYoloString } from './utils/yoloHelper';
import { ArrowLeft, ArrowRight, Image as ImageIcon, GripVertical, Filter } from 'lucide-react';

const App: React.FC = () => {
  const [isSetup, setIsSetup] = useState(false);
  
  // Data State
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [labelsRaw, setLabelsRaw] = useState<Map<string, string>>(new Map());
  const [classes, setClasses] = useState<string[]>([]);
  
  // View State
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [currentLabelIdx, setCurrentLabelIdx] = useState(0);
  const [panelWidth, setPanelWidth] = useState(400); // Default width
  const [isResizing, setIsResizing] = useState(false);
  const [filterClassId, setFilterClassId] = useState<number>(-1); // -1 = All
  
  // Working State (Parsed labels for current image)
  const [currentLabels, setCurrentLabels] = useState<YoloLabel[]>([]);
  const [unsavedMap, setUnsavedMap] = useState<Map<string, boolean>>(new Map()); // Track which files changed

  // Load Setup Data
  const handleSetupComplete = (
    loadedImages: ImageAsset[], 
    loadedLabels: Map<string, string>, 
    loadedClasses: string[]
  ) => {
    setImages(loadedImages);
    setLabelsRaw(loadedLabels);
    setClasses(loadedClasses);
    setIsSetup(true);
    setCurrentImageIdx(0);
  };

  // Resizing Logic for Panel
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      // Calculate new width (Total Width - Mouse X)
      const newWidth = window.innerWidth - e.clientX;
      
      // Constraints (min 300px, max 800px)
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

    return images.filter(img => {
       const key = img.name.replace(/\.[^/.]+$/, "");
       const rawContent = labelsRaw.get(key);
       if (!rawContent) return false;
       
       // We must parse to check the class ID accurately
       const labels = parseYoloString(rawContent);
       return labels.some(l => l.classId === filterClassId);
    });
  }, [images, labelsRaw, filterClassId]);

  // Reset pagination when filter changes
  useEffect(() => {
    setCurrentImageIdx(0);
  }, [filterClassId]);


  // --- Data Loading when Image Changes ---
  useEffect(() => {
    if (!isSetup || filteredImages.length === 0) {
      setCurrentLabels([]);
      setCurrentLabelIdx(-1);
      return;
    }

    // Safety check for index out of bounds (can happen when list shrinks)
    const effectiveIdx = Math.min(currentImageIdx, filteredImages.length - 1);
    if (effectiveIdx !== currentImageIdx) {
        setCurrentImageIdx(effectiveIdx);
        return; 
    }

    const img = filteredImages[effectiveIdx];
    // Remove extension for key lookup
    const key = img.name.replace(/\.[^/.]+$/, "");
    
    const rawContent = labelsRaw.get(key) || "";
    const parsed = parseYoloString(rawContent);
    
    setCurrentLabels(parsed);
    
    // Smart Label Selection
    if (parsed.length > 0) {
       if (filterClassId !== -1) {
          // If filtering, try to select the first label that matches the filter
          const matchIdx = parsed.findIndex(l => l.classId === filterClassId);
          if (matchIdx !== -1) {
            setCurrentLabelIdx(matchIdx);
          } else {
             // Should rarely happen if filter logic is correct, unless labels changed
             setCurrentLabelIdx(0);
          }
       } else {
           // Default behavior: keep index if valid
           if (currentLabelIdx >= parsed.length || currentLabelIdx < 0) {
             setCurrentLabelIdx(0);
           }
       }
    } else {
      setCurrentLabelIdx(-1);
    }
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

  // --- Update Logic ---
  const handleLabelUpdate = (updatedLabel: YoloLabel) => {
    const newLabels = [...currentLabels];
    
    // We assume we are editing the label at currentLabelIdx or finding it
    // In this simple app, currentLabelIdx is the source of truth for "selected"
    if (currentLabelIdx >= 0 && currentLabelIdx < newLabels.length) {
        newLabels[currentLabelIdx] = updatedLabel;
        setCurrentLabels(newLabels);
        
        // Update raw map immediately
        if (filteredImages[currentImageIdx]) {
            const imgKey = filteredImages[currentImageIdx].name.replace(/\.[^/.]+$/, "");
            const newRaw = serializeYoloString(newLabels);
            
            const newLabelsMap = new Map(labelsRaw);
            newLabelsMap.set(imgKey, newRaw);
            setLabelsRaw(newLabelsMap);

            // Mark as unsaved
            const newUnsaved = new Map(unsavedMap);
            newUnsaved.set(imgKey, true);
            setUnsavedMap(newUnsaved);
        }
    }
  };

  // --- Download Handler ---
  const handleDownload = () => {
    if (!filteredImages[currentImageIdx]) return;

    const imgKey = filteredImages[currentImageIdx].name.replace(/\.[^/.]+$/, "");
    const content = labelsRaw.get(imgKey) || "";
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${imgKey}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Unmark unsaved
    const newUnsaved = new Map(unsavedMap);
    newUnsaved.delete(imgKey);
    setUnsavedMap(newUnsaved);
  };

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    if (!isSetup) return;

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

        switch (e.key.toLowerCase()) {
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
            case 'w': // Next Defect
            case 'arrowup':
                e.preventDefault();
                nextLabel();
                break;
            case 's': // Prev Defect
            case 'arrowdown':
                e.preventDefault();
                prevLabel();
                break;
        }

        if (e.key === 's' || e.key === 'S') {
             if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                handleDownload();
             }
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSetup, nextImage, prevImage, nextLabel, prevLabel, handleDownload]);


  if (!isSetup) {
    return <SetupScreen onComplete={handleSetupComplete} />;
  }

  // Derived references for Render
  const currentImage = filteredImages[currentImageIdx];
  const currentKey = currentImage?.name.replace(/\.[^/.]+$/, "");
  const hasUnsaved = currentKey ? unsavedMap.has(currentKey) : false;

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 overflow-hidden">
      
      {/* Top Header / Navigation Bar */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 z-20">
        <div className="flex items-center gap-3">
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

        <div className="flex items-center gap-4">
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
                    title="Previous Image (A)"
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
                    title="Next Image (D)"
                >
                    <ArrowRight size={18} />
                </button>
            </div>
        </div>

        <div className="w-40 flex justify-end">
            <span className="text-xs text-slate-600">v1.3.0</span>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {filteredImages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                <ImageIcon size={48} className="mb-4 opacity-50" />
                <p className="text-lg font-semibold">No images found</p>
                {filterClassId !== -1 && (
                    <p className="text-sm">Try changing the filter to "All Defects" or selecting a different class.</p>
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
                    onSelectLabel={setCurrentLabelIdx}
                    onUpdateLabel={handleLabelUpdate}
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
                    onDownloadLabels={handleDownload}
                    hasUnsavedChanges={hasUnsaved}
                />
            </>
        )}
      </div>
    </div>
  );
};

export default App;