import React, { useState, useEffect, useCallback } from 'react';
import { SetupScreen } from './components/SetupScreen';
import { ImageViewer } from './components/ImageViewer';
import { DetailPanel } from './components/DetailPanel';
import { ImageAsset, YoloLabel } from './types';
import { parseYoloString, serializeYoloString } from './utils/yoloHelper';
import { ArrowLeft, ArrowRight, Image as ImageIcon, GripVertical } from 'lucide-react';

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


  // When image changes, parse labels
  useEffect(() => {
    if (!isSetup || images.length === 0) return;

    const img = images[currentImageIdx];
    // Remove extension for key lookup
    const key = img.name.replace(/\.[^/.]+$/, "");
    
    const rawContent = labelsRaw.get(key) || "";
    const parsed = parseYoloString(rawContent);
    
    setCurrentLabels(parsed);
    // Reset to first label only if we have labels and the index is out of bounds or negative
    if (parsed.length > 0) {
       // Try to keep index if possible, otherwise reset
       if (currentLabelIdx >= parsed.length || currentLabelIdx < 0) {
         setCurrentLabelIdx(0);
       }
    } else {
      setCurrentLabelIdx(-1);
    }
  }, [currentImageIdx, images, labelsRaw, isSetup]); // Removed currentLabelIdx from dependency to avoid loop resets


  // Navigation Handlers
  const nextImage = useCallback(() => {
    if (currentImageIdx < images.length - 1) {
      setCurrentImageIdx(prev => prev + 1);
    }
  }, [currentImageIdx, images.length]);

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

  // Update logic
  const handleLabelUpdate = (updatedLabel: YoloLabel) => {
    const newLabels = [...currentLabels];
    // Ensure we are updating the correct index, usually currentLabelIdx
    // However, if called from ImageViewer resizing, we might need to know which index.
    // For now, we assume we only edit the selected one.
    if (currentLabelIdx >= 0 && currentLabelIdx < newLabels.length) {
        newLabels[currentLabelIdx] = updatedLabel;
        setCurrentLabels(newLabels);
        
        // Update raw map immediately so it persists if we switch images (Auto-save to memory)
        const imgKey = images[currentImageIdx].name.replace(/\.[^/.]+$/, "");
        const newRaw = serializeYoloString(newLabels);
        
        const newLabelsMap = new Map(labelsRaw);
        newLabelsMap.set(imgKey, newRaw);
        setLabelsRaw(newLabelsMap);

        // Mark as unsaved (for disk write)
        const newUnsaved = new Map(unsavedMap);
        newUnsaved.set(imgKey, true);
        setUnsavedMap(newUnsaved);
    }
  };

  // Download Handler
  const handleDownload = () => {
    const imgKey = images[currentImageIdx].name.replace(/\.[^/.]+$/, "");
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

  // Keyboard Shortcuts
  useEffect(() => {
    if (!isSetup) return;

    const handleKeyDown = (e: KeyboardEvent) => {
        // Ignore if input focused (though we mainly use select)
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

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
            case 'save': // Catch all for save if needed
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

  const currentImage = images[currentImageIdx];
  const currentKey = currentImage?.name.replace(/\.[^/.]+$/, "");
  const hasUnsaved = unsavedMap.has(currentKey);

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
                <p className="text-xs text-slate-500">{currentImage?.name}</p>
            </div>
        </div>

        <div className="flex items-center gap-4 bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button 
                onClick={prevImage}
                disabled={currentImageIdx === 0}
                className="p-2 hover:bg-slate-700 rounded text-slate-300 disabled:opacity-30 transition-colors"
                title="Previous Image (A)"
            >
                <ArrowLeft size={18} />
            </button>
            <span className="text-sm font-mono text-slate-400 min-w-[80px] text-center">
                {currentImageIdx + 1} / {images.length}
            </span>
            <button 
                onClick={nextImage}
                disabled={currentImageIdx === images.length - 1}
                className="p-2 hover:bg-slate-700 rounded text-slate-300 disabled:opacity-30 transition-colors"
                title="Next Image (D)"
            >
                <ArrowRight size={18} />
            </button>
        </div>

        <div className="w-40 flex justify-end">
            <span className="text-xs text-slate-600">v1.2.0</span>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
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
      </div>
    </div>
  );
};

export default App;