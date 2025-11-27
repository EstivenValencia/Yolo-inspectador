
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SetupScreen } from './components/SetupScreen';
import { ImageViewer } from './components/ImageViewer';
import { DetailPanel } from './components/DetailPanel';
import { ModelSettings } from './components/ModelSettings';
import { GridView } from './components/GridView';
import { ImageAsset, YoloLabel, FileSystemFileHandle, FileSystemDirectoryHandle } from './types';
import { parseYoloString, serializeYoloString } from './utils/yoloHelper';
import { detectObjects, BackendConfig, checkBackendHealth } from './utils/apiHelper';
import { ArrowLeft, ArrowRight, Image as ImageIcon, Filter, CheckCircle, Save, PlusSquare, BoxSelect, Home, Search, Keyboard, X, PlusCircle, Wifi, WifiOff, FileCheck, PlayCircle, StopCircle, Loader2, Wrench, Eye, EyeOff, ChevronDown, Grid, Square, Settings, LayoutGrid } from 'lucide-react';

const App: React.FC = () => {
  const [isSetup, setIsSetup] = useState(false);
  
  // Data State
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [labelsRaw, setLabelsRaw] = useState<Map<string, string>>(new Map());
  // Predictions Cache: Stores model predictions in memory. Key: ImageName, Value: YoloLabel[]
  const [predictionsCache, setPredictionsCache] = useState<Map<string, YoloLabel[]>>(new Map());
  
  const [labelHandles, setLabelHandles] = useState<Map<string, FileSystemFileHandle>>(new Map());
  const [labelsDirHandle, setLabelsDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [classes, setClasses] = useState<string[]>([]);
  const [classFileHandle, setClassFileHandle] = useState<FileSystemFileHandle | null>(null);
  
  // View State
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [currentLabelIdx, setCurrentLabelIdx] = useState(0);
  const [panelWidth, setPanelWidth] = useState(400); 
  const [isResizing, setIsResizing] = useState(false);
  const [filterClassId, setFilterClassId] = useState<number>(-1); 
  
  // View Mode & Grid Config
  const [viewMode, setViewMode] = useState<'single' | 'grid'>('single');
  const [gridConfig, setGridConfig] = useState({ rows: 3, cols: 4 });
  const [showGridConfig, setShowGridConfig] = useState(false);
  
  // Persistent Zoom/Display Settings
  const [zoomSettings, setZoomSettings] = useState<{context: number, mag: number}>(() => {
     try {
       const saved = localStorage.getItem('defect_inspector_zoom');
       return saved ? JSON.parse(saved) : { context: 30, mag: 1 };
     } catch {
       return { context: 30, mag: 1 };
     }
  });

  // Persistent Class Usage Stats (For sorting)
  const [classUsage, setClassUsage] = useState<Record<string, number>>(() => {
      try {
          const saved = localStorage.getItem('yolo_class_usage');
          return saved ? JSON.parse(saved) : {};
      } catch {
          return {};
      }
  });

  // Inference State
  const [showModelSettings, setShowModelSettings] = useState(false);
  const [inferenceConfig, setInferenceConfig] = useState<BackendConfig>({
      apiUrl: 'http://localhost:5000',
      confidenceThreshold: 0.25,
      iouThreshold: 0.45,
      sliceWidth: 640,
      sliceHeight: 640,
      overlapWidthRatio: 0.0,
      overlapHeightRatio: 0.0
  });
  const [isInferencing, setIsInferencing] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [backendConnected, setBackendConnected] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
     localStorage.setItem('defect_inspector_zoom', JSON.stringify(zoomSettings));
  }, [zoomSettings]);

  // Check Backend Connection periodically
  useEffect(() => {
      const check = async () => {
          const isUp = await checkBackendHealth(inferenceConfig.apiUrl);
          setBackendConnected(isUp);
      };
      check();
      const interval = setInterval(check, 5000);
      return () => clearInterval(interval);
  }, [inferenceConfig.apiUrl]);

  // Helper to increment usage
  const recordClassUsage = (className: string) => {
      setClassUsage(prev => {
          const next = { ...prev, [className]: (prev[className] || 0) + 1 };
          localStorage.setItem('yolo_class_usage', JSON.stringify(next));
          return next;
      });
  };

  // Modes
  const [isCreating, setIsCreating] = useState(false); // Creation Mode (Key: e)
  const [showBoxFill, setShowBoxFill] = useState(false); // Box Fill Mode (Key: f)
  const [labelsVisible, setLabelsVisible] = useState(true); // Toggle Visibility (Ctrl + T)
  const [showHelp, setShowHelp] = useState(false); // Help Modal (Key: Ctrl+H)
  const [showToolsMenu, setShowToolsMenu] = useState(false); // Tools Dropdown
  
  // Class Selector Modal State (Key: r)
  const [showClassSelector, setShowClassSelector] = useState(false);
  const [selectorIndex, setSelectorIndex] = useState(0);
  const [classSearchTerm, setClassSearchTerm] = useState("");
  const classSelectorRef = useRef<HTMLDivElement>(null);
  const classSearchInputRef = useRef<HTMLInputElement>(null);

  // Working State
  const [currentLabels, setCurrentLabels] = useState<YoloLabel[]>([]);
  const [lastSaveStatus, setLastSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
  // Pending Creation State
  const [pendingLabelIndex, setPendingLabelIndex] = useState<number | null>(null);

  // Load Setup Data
  const handleSetupComplete = (
    loadedImages: ImageAsset[], 
    loadedLabels: Map<string, string>, 
    loadedLabelHandles: Map<string, FileSystemFileHandle>,
    dirHandle: FileSystemDirectoryHandle | null,
    loadedClasses: string[],
    loadedClassHandle: FileSystemFileHandle | null
  ) => {
    setImages(loadedImages);
    setLabelsRaw(loadedLabels);
    setLabelHandles(loadedLabelHandles);
    setLabelsDirHandle(dirHandle);
    setClasses(loadedClasses);
    setClassFileHandle(loadedClassHandle);
    setIsSetup(true);
    setCurrentImageIdx(0);
    setPredictionsCache(new Map()); // Reset cache on new setup
  };

  const handleHome = () => {
      if (window.confirm("Return to Home? Unsaved changes to the current image might be lost if not yet written to disk.")) {
          setIsSetup(false);
          setImages([]);
          setLabelsRaw(new Map());
          setPredictionsCache(new Map());
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

  // --- Filtering Logic for Image Navigation ---
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

  // Stop batch processing if filter changes
  useEffect(() => {
    if (isBatchRunning) {
        stopBatchInference();
    }
    setCurrentImageIdx(0);
  }, [filterClassId]);

  // --- Filter Logic for Class Selector ---
  const filteredClassList = useMemo(() => {
      const mapped = classes.map((c, i) => ({ 
          index: i, 
          name: c, 
          count: classUsage[c] || 0 
      }));

      mapped.sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return a.index - b.index;
      });

      const term = classSearchTerm.toLowerCase();
      if (!term) return mapped;
      return mapped.filter(item => item.name.toLowerCase().includes(term));
  }, [classes, classSearchTerm, classUsage]);


  // --- Data Loading ---
  useEffect(() => {
    if (!isSetup || filteredImages.length === 0) {
      setCurrentLabels([]);
      setCurrentLabelIdx(-1);
      return;
    }

    const effectiveIdx = Math.min(currentImageIdx, filteredImages.length - 1);
    // If index corrected, trigger re-render with correct index
    if (effectiveIdx !== currentImageIdx) {
        setCurrentImageIdx(effectiveIdx);
        return; 
    }

    const img = filteredImages[effectiveIdx];
    if (!img) return;

    const key = img.name.replace(/\.[^/.]+$/, "");
    
    // 1. Get Saved Labels
    const rawContent = labelsRaw.get(key) || "";
    const savedLabels = parseYoloString(rawContent);

    // 2. Get Cached Predictions (Ghost Labels)
    const cachedPredictions = predictionsCache.get(key) || [];
    
    // 3. Merge: Saved Labels + Predicted Labels
    const mergedLabels = [...savedLabels, ...cachedPredictions];
    
    setCurrentLabels(mergedLabels);
    setPendingLabelIndex(null); 
    
    setIsCreating(false);
    setShowClassSelector(false);

    if (mergedLabels.length > 0) {
       // If filtering by specific class, try to select that class first
       if (filterClassId !== -1 && filterClassId !== -2) {
          const matchIdx = mergedLabels.findIndex(l => l.classId === filterClassId);
          if (matchIdx !== -1) {
            setCurrentLabelIdx(matchIdx);
          } else {
             setCurrentLabelIdx(0);
          }
       } else {
           // Default logic
           if (currentLabelIdx >= mergedLabels.length || currentLabelIdx < 0) {
             setCurrentLabelIdx(0);
           }
       }
    } else {
      setCurrentLabelIdx(-1);
    }
    
    setLastSaveStatus('idle');
  }, [currentImageIdx, filteredImages, labelsRaw, predictionsCache, isSetup, filterClassId]);


  // --- Navigation Handlers ---
  const handlePageChange = (direction: 'next' | 'prev') => {
      if (viewMode === 'grid') {
          const itemsPerPage = gridConfig.rows * gridConfig.cols;
          const newIdx = direction === 'next' 
            ? currentImageIdx + itemsPerPage 
            : currentImageIdx - itemsPerPage;
          
          if (newIdx >= 0 && newIdx < filteredImages.length) {
              setCurrentImageIdx(newIdx);
          } else if (direction === 'next' && currentImageIdx < filteredImages.length - 1) {
              // Go to last item if next page overshoots
              setCurrentImageIdx(filteredImages.length - 1);
          } else if (direction === 'prev' && currentImageIdx > 0) {
              setCurrentImageIdx(0);
          }
      } else {
          // Single Mode
          if (direction === 'next' && currentImageIdx < filteredImages.length - 1) {
              setCurrentImageIdx(prev => prev + 1);
          } else if (direction === 'prev' && currentImageIdx > 0) {
              setCurrentImageIdx(prev => prev - 1);
          }
      }
  };
  
  const nextImage = useCallback(() => handlePageChange('next'), [currentImageIdx, filteredImages.length, viewMode, gridConfig]);
  const prevImage = useCallback(() => handlePageChange('prev'), [currentImageIdx, viewMode, gridConfig]);

  const nextLabel = useCallback(() => {
    if (currentLabels.length === 0) return;
    setCurrentLabelIdx(prev => (prev + 1) % currentLabels.length);
  }, [currentLabels.length]);

  const prevLabel = useCallback(() => {
    if (currentLabels.length === 0) return;
    setCurrentLabelIdx(prev => (prev - 1 + currentLabels.length) % currentLabels.length);
  }, [currentLabels.length]);

  // --- Core Update, Create & Save Logic ---
  const handleLabelUpdate = (updatedLabel: YoloLabel, index?: number) => {
    const targetIdx = index !== undefined ? index : currentLabelIdx;

    const newLabels = [...currentLabels];
    if (targetIdx >= 0 && targetIdx < newLabels.length) {
        const oldClassId = newLabels[targetIdx].classId;
        if (oldClassId !== updatedLabel.classId) {
            const className = classes[updatedLabel.classId];
            if (className) recordClassUsage(className);
        }

        // If modifying a predicted label, it effectively becomes "accepted"
        // We remove the predicted flag if the user manually edits it
        if (updatedLabel.isPredicted) {
             updatedLabel.isPredicted = false;
        }

        newLabels[targetIdx] = updatedLabel;
        setCurrentLabels(newLabels);
        
        if (pendingLabelIndex === targetIdx) {
            setPendingLabelIndex(null);
        }

        updateRawDataAndSave(newLabels);
    }
  };

  const handleLabelCreate = (newLabel: YoloLabel) => {
      const defaultClass = 0;
      const labelToAdd = { ...newLabel, classId: defaultClass };
      const newLabels = [...currentLabels, labelToAdd];
      const newIndex = newLabels.length - 1;
      
      setCurrentLabels(newLabels);
      setCurrentLabelIdx(newIndex); 
      setPendingLabelIndex(newIndex); 
      
      setIsCreating(false); 
      
      setClassSearchTerm("");
      setSelectorIndex(0);
      setShowClassSelector(true);
  };

  // --- SINGLE INFERENCE ---
  const handleRunInference = async () => {
    const currentImg = filteredImages[currentImageIdx];
    
    if (!backendConnected) {
        setShowModelSettings(true);
        return;
    }

    if (!currentImg || !currentImg.file) {
        alert("Image file not available in memory.");
        return;
    }

    setIsInferencing(true);
    try {
        const predictions = await detectObjects(currentImg.file, inferenceConfig);

        if (predictions.length > 0) {
            // 1. Update Cache
            const key = currentImg.name.replace(/\.[^/.]+$/, "");
            setPredictionsCache(prev => {
                const newMap = new Map(prev);
                newMap.set(key, predictions);
                return newMap;
            });
            // The useEffect will pick this up and re-render
        } else {
           // Optional: Notification for no detection
        }
    } catch (e) {
        console.error("Inference failed", e);
        alert("Inference failed. Is the Python backend running?");
    } finally {
        setIsInferencing(false);
    }
  };

  // --- BATCH INFERENCE ---
  const stopBatchInference = () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
    }
    setIsBatchRunning(false);
  };

  const handleBatchInference = async () => {
      if (!backendConnected) {
          setShowModelSettings(true);
          return;
      }
      if (isBatchRunning) return;

      setIsBatchRunning(true);
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      const BATCH_SIZE = 50;
      let processedCount = 0;
      let startIdx = currentImageIdx;

      // Ensure we don't go out of bounds
      if (startIdx >= filteredImages.length) startIdx = 0;

      try {
          // Loop next 50 images
          for (let i = 0; i < BATCH_SIZE; i++) {
              if (signal.aborted) break;

              const targetIdx = startIdx + i;
              if (targetIdx >= filteredImages.length) break; // End of list

              const img = filteredImages[targetIdx];
              
              // Move view to show progress (User Experience)
              setCurrentImageIdx(targetIdx);

              if (img && img.file) {
                   try {
                       const predictions = await detectObjects(img.file, inferenceConfig);
                       
                       if (predictions.length > 0) {
                           // Update cache for this image
                           const key = img.name.replace(/\.[^/.]+$/, "");
                           setPredictionsCache(prev => {
                               const newMap = new Map(prev);
                               newMap.set(key, predictions);
                               return newMap;
                           });
                       }
                   } catch (err) {
                       console.warn(`Failed to infer image ${img.name}`, err);
                   }
              }

              processedCount++;
              // Small delay to allow UI to render frame and not freeze browser
              await new Promise(resolve => setTimeout(resolve, 50));
          }

      } catch (e) {
          console.error("Batch process error", e);
      } finally {
          setIsBatchRunning(false);
          abortControllerRef.current = null;
      }
  };
  
  const handleAcceptPredictions = () => {
      // Logic: Take all labels marked as 'isPredicted', strip the flag, and save to disk.
      // Also clear them from the cache so they don't double up.
      
      const hasPredictions = currentLabels.some(l => l.isPredicted);
      if (!hasPredictions) return;

      const currentImg = filteredImages[currentImageIdx];
      const key = currentImg.name.replace(/\.[^/.]+$/, "");

      // 1. Convert predictions to real labels
      const newLabels = currentLabels.map(l => {
          if (l.isPredicted) {
              const { isPredicted, ...rest } = l;
              return rest;
          }
          return l;
      });

      // 2. Clear from Cache (since they are now saved persistently)
      setPredictionsCache(prev => {
          const newMap = new Map(prev);
          newMap.delete(key);
          return newMap;
      });

      // 3. Update State & Disk
      setCurrentLabels(newLabels);
      updateRawDataAndSave(newLabels, true); 
  };

  const cancelPendingLabel = () => {
      if (pendingLabelIndex !== null && pendingLabelIndex < currentLabels.length) {
          const newLabels = [...currentLabels];
          newLabels.splice(pendingLabelIndex, 1);
          setCurrentLabels(newLabels);
          setPendingLabelIndex(null);
          setCurrentLabelIdx(Math.max(0, newLabels.length - 1));
      }
  };

  const handleLabelDelete = () => {
      if (currentLabelIdx >= 0 && currentLabelIdx < currentLabels.length) {
          if (currentLabelIdx === pendingLabelIndex) {
              setPendingLabelIndex(null);
          }

          const labelToDelete = currentLabels[currentLabelIdx];
          
          const newLabels = [...currentLabels];
          newLabels.splice(currentLabelIdx, 1);
          
          // If deleting a cached prediction, remove it from cache
          if (labelToDelete.isPredicted) {
               const currentImg = filteredImages[currentImageIdx];
               const key = currentImg.name.replace(/\.[^/.]+$/, "");
               const remainingCached = newLabels.filter(l => l.isPredicted);
               setPredictionsCache(prev => {
                   const newMap = new Map(prev);
                   if (remainingCached.length > 0) {
                       newMap.set(key, remainingCached);
                   } else {
                       newMap.delete(key);
                   }
                   return newMap;
               });
          }

          setCurrentLabels(newLabels);
          
          if (newLabels.length > 0) {
              const newIdx = Math.max(0, currentLabelIdx - 1);
              setCurrentLabelIdx(newIdx);
          } else {
              setCurrentLabelIdx(-1);
          }
          
          // Only write to disk if it wasn't a predicted label (predicted labels aren't on disk yet)
          // But if we delete a normal label, we must save.
          if (!labelToDelete.isPredicted) {
              updateRawDataAndSave(newLabels);
          }
      }
  };

  const updateRawDataAndSave = async (newLabels: YoloLabel[], forceSavePredictions: boolean = false) => {
      if (!filteredImages[currentImageIdx]) return;

      const imgKey = filteredImages[currentImageIdx].name.replace(/\.[^/.]+$/, "");
      
      // CRITICAL: Filter out predictions so they are NOT saved to disk unless explicitly accepted (forceSavePredictions)
      const labelsToSave = forceSavePredictions 
        ? newLabels 
        : newLabels.filter(l => !l.isPredicted);

      const newRaw = serializeYoloString(labelsToSave);
      
      const newLabelsMap = new Map(labelsRaw);
      newLabelsMap.set(imgKey, newRaw);
      setLabelsRaw(newLabelsMap);

      setLastSaveStatus('saving');
      try {
        let handle = labelHandles.get(imgKey);
        
        if (!handle && labelsDirHandle) {
             handle = await labelsDirHandle.getFileHandle(`${imgKey}.txt`, { create: true });
             const newHandles = new Map(labelHandles);
             newHandles.set(imgKey, handle);
             setLabelHandles(newHandles);
        }

        if (handle) {
            const writable = await handle.createWritable();
            await writable.write(newRaw);
            await writable.close();
            setLastSaveStatus('saved');
            setTimeout(() => setLastSaveStatus('idle'), 1500);
        } else {
            setLastSaveStatus('error');
        }

      } catch (err: any) {
          console.error("Failed to save to disk:", err);
          setLastSaveStatus('error');
      }
  }

  const handleAddNewClass = async (newClassName: string) => {
      const trimmed = newClassName.trim();
      if (!trimmed) return;

      const newClasses = [...classes, trimmed];
      setClasses(newClasses);

      if (classFileHandle) {
          try {
              const writable = await classFileHandle.createWritable();
              await writable.write(newClasses.join('\n'));
              await writable.close();
          } catch (e) {
              console.error("Failed to save new class to file", e);
          }
      }

      recordClassUsage(trimmed);
      return newClasses.length - 1;
  };

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    if (!isSetup) return;

    const handleKeyDown = (e: KeyboardEvent) => {
        if (showClassSelector || showGridConfig) {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (pendingLabelIndex !== null) {
                    cancelPendingLabel();
                }
                setShowClassSelector(false);
                setShowGridConfig(false);
            } else if (e.key === 'Enter' && showClassSelector) {
                // ... (Existing Enter logic for class selector) ...
                e.preventDefault();
                const hasExactMatch = filteredClassList.find(c => c.name.toLowerCase() === classSearchTerm.toLowerCase());
                const hasMatches = filteredClassList.length > 0;
                
                if (hasExactMatch) {
                   if (currentLabels[currentLabelIdx]) {
                        handleLabelUpdate({
                            ...currentLabels[currentLabelIdx],
                            classId: hasExactMatch.index
                        });
                        setShowClassSelector(false);
                   }
                } else if (hasMatches && classSearchTerm.length < 3) {
                   const selectedClass = filteredClassList[selectorIndex];
                   if (selectedClass && currentLabels[currentLabelIdx]) {
                        handleLabelUpdate({
                            ...currentLabels[currentLabelIdx],
                            classId: selectedClass.index
                        });
                        setShowClassSelector(false);
                   }
                } else if (classSearchTerm.trim().length > 0) {
                    handleAddNewClass(classSearchTerm).then((newId) => {
                        if (newId !== undefined && currentLabels[currentLabelIdx]) {
                            handleLabelUpdate({
                                ...currentLabels[currentLabelIdx],
                                classId: newId
                            });
                        }
                        setShowClassSelector(false);
                    });
                } else if (hasMatches) {
                     const selectedClass = filteredClassList[selectorIndex];
                     if (selectedClass && currentLabels[currentLabelIdx]) {
                        handleLabelUpdate({
                            ...currentLabels[currentLabelIdx],
                            classId: selectedClass.index
                        });
                        setShowClassSelector(false);
                   }
                }
            } else if (e.key === 'ArrowUp' && showClassSelector) {
                e.preventDefault();
                setSelectorIndex(prev => Math.max(0, prev - 1));
            } else if (e.key === 'ArrowDown' && showClassSelector) {
                e.preventDefault();
                setSelectorIndex(prev => Math.min(filteredClassList.length - 1, prev + 1));
            }
            return;
        }
        
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

        var key = e.key.toLowerCase();

        if (e.ctrlKey && key === 'h') {
          e.preventDefault();
          setShowHelp(prev => !prev);
          return;
        }

        if (e.ctrlKey && key === 't') {
            e.preventDefault();
            setLabelsVisible(prev => !prev);
            return;
        }

        if (showHelp) {
            if (key === 'escape') setShowHelp(false);
            return; 
        }

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
                if (viewMode === 'single') {
                    e.preventDefault();
                    nextLabel();
                }
                break;
            case 's': // Prev Defect (Down)
            case 'arrowdown':
                if (viewMode === 'single') {
                    e.preventDefault();
                    prevLabel();
                }
                break;
            
            case 'q': // Delete Label
            case 'delete':
                if (viewMode === 'single') {
                    e.preventDefault();
                    handleLabelDelete();
                }
                break;
            case 'e': // Mode: Create
                if (viewMode === 'single') {
                    e.preventDefault();
                    setIsCreating(prev => !prev);
                }
                break;
            case 'f': // Mode: Box Fill
                e.preventDefault();
                setShowBoxFill(prev => !prev);
                break;
            
            case 't': // INFERENCE TRIGGER
                if (!e.ctrlKey) { 
                    e.preventDefault();
                    handleRunInference();
                }
                break;
            
            case 'y': // ACCEPT PREDICTIONS
                e.preventDefault();
                handleAcceptPredictions();
                break;

            case 'r': // Rename / Reclassify
                if (viewMode === 'single' && currentLabels.length > 0 && currentLabelIdx !== -1) {
                    e.preventDefault();
                    setClassSearchTerm("");
                    setSelectorIndex(0); 
                    setShowClassSelector(true);
                }
                break;

            case 'escape': 
                if (isCreating) {
                  e.preventDefault();
                  setIsCreating(false);
                }
                setShowToolsMenu(false);
                setShowGridConfig(false);
                break;
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSetup, nextImage, prevImage, nextLabel, prevLabel, handleLabelDelete, isCreating, showClassSelector, selectorIndex, classes, currentLabels, currentLabelIdx, showHelp, filteredClassList, classSearchTerm, pendingLabelIndex, inferenceConfig, currentImageIdx, backendConnected, showToolsMenu, viewMode, showGridConfig]);

  useEffect(() => {
    if (showClassSelector && classSearchInputRef.current) {
        classSearchInputRef.current.focus();
    }
  }, [showClassSelector]);

  useEffect(() => {
     setSelectorIndex(0);
  }, [classSearchTerm]);

  const handleModalBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
        if (pendingLabelIndex !== null) {
            cancelPendingLabel();
        }
        setShowClassSelector(false);
        setShowGridConfig(false);
    }
  };
  
  const handleGridImageClick = (globalIdx: number) => {
      setCurrentImageIdx(globalIdx);
      setViewMode('single');
  };

  if (!isSetup) {
    return <SetupScreen onComplete={handleSetupComplete} />;
  }

  const currentImage = filteredImages[currentImageIdx];
  const pendingPredictionsCount = currentLabels.filter(l => l.isPredicted).length;

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 overflow-hidden relative">
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
             {/* Model Status */}
             <button
                onClick={() => setShowModelSettings(true)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold transition-all border ${backendConnected ? 'bg-emerald-900/50 border-emerald-500 text-emerald-300 hover:bg-emerald-900' : 'bg-red-900/30 border-red-800 text-red-400 hover:bg-red-900/50'}`}
                title="Configure Backend"
             >
                {backendConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
                {backendConnected ? 'Connected' : 'Offline'}
             </button>
             
             {/* Batch Inference Controls */}
             <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700 p-0.5">
                 <button 
                    onClick={isBatchRunning ? stopBatchInference : handleBatchInference}
                    disabled={!backendConnected}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${isBatchRunning 
                        ? 'bg-red-600 text-white animate-pulse' 
                        : (backendConnected ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-700 text-slate-500 cursor-not-allowed')}`}
                    title="Process next 50 images"
                 >
                    {isBatchRunning ? <StopCircle size={14} /> : <PlayCircle size={14} />}
                    {isBatchRunning ? 'Stop Batch' : 'Batch (50)'}
                 </button>
             </div>
            
             {/* Pending Predictions Indicator */}
             {pendingPredictionsCount > 0 && viewMode === 'single' && (
                 <button 
                    onClick={handleAcceptPredictions}
                    className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold transition-all border bg-amber-900/50 border-amber-500 text-amber-300 hover:bg-amber-900 animate-pulse"
                    title="Click or press Y to save predictions to disk"
                 >
                    <FileCheck size={14} />
                    {pendingPredictionsCount} Unsaved (Y)
                 </button>
             )}

            {/* View Mode Toggle with Configuration */}
            <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700 p-0.5 relative">
                <button
                    onClick={() => setViewMode(prev => prev === 'single' ? 'grid' : 'single')}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-l-md text-xs font-bold bg-slate-700 text-white hover:bg-slate-600 transition-colors border-r border-slate-900"
                    title="Toggle View Mode"
                >
                    {viewMode === 'single' ? <Square size={14} /> : <LayoutGrid size={14} />}
                    {viewMode === 'single' ? 'Single' : 'Matrix'}
                </button>
                <button
                    onClick={() => setShowGridConfig(!showGridConfig)}
                    className="px-2 py-1.5 rounded-r-md hover:bg-slate-600 text-slate-400 hover:text-white transition-colors"
                    title="Grid Settings"
                >
                    <Settings size={14} />
                </button>

                {/* Grid Config Popover */}
                {showGridConfig && (
                    <div className="absolute top-full right-0 mt-2 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 p-4 w-48">
                         <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
                             <Grid size={12} /> Matrix Layout
                         </h4>
                         <div className="space-y-3">
                             <div>
                                 <label className="text-xs text-slate-300 flex justify-between">Rows: <b>{gridConfig.rows}</b></label>
                                 <input 
                                    type="range" min="1" max="10" 
                                    value={gridConfig.rows}
                                    onChange={(e) => setGridConfig(prev => ({...prev, rows: parseInt(e.target.value)}))}
                                    className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-500 mt-1"
                                 />
                             </div>
                             <div>
                                 <label className="text-xs text-slate-300 flex justify-between">Cols: <b>{gridConfig.cols}</b></label>
                                 <input 
                                    type="range" min="1" max="10" 
                                    value={gridConfig.cols}
                                    onChange={(e) => setGridConfig(prev => ({...prev, cols: parseInt(e.target.value)}))}
                                    className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-500 mt-1"
                                 />
                             </div>
                         </div>
                    </div>
                )}
            </div>

            {/* Tools Dropdown */}
            <div className="relative">
                <button 
                    onClick={() => setShowToolsMenu(!showToolsMenu)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                >
                    <Wrench size={14} />
                    Tools
                    <ChevronDown size={12} />
                </button>

                {showToolsMenu && (
                    <div className="absolute top-full right-0 mt-2 w-48 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 overflow-hidden">
                        <div className="p-2 border-b border-slate-700">
                             <span className="text-[10px] text-slate-500 uppercase font-bold px-2">Visualization</span>
                             
                             <button 
                                onClick={() => setLabelsVisible(!labelsVisible)}
                                className="w-full text-left px-2 py-2 mt-1 hover:bg-slate-700 rounded flex items-center gap-2 text-sm text-slate-200"
                             >
                                 {labelsVisible ? <Eye size={14} className="text-emerald-400" /> : <EyeOff size={14} className="text-slate-500" />}
                                 <span>{labelsVisible ? 'Hide Labels' : 'Show Labels'}</span>
                                 <span className="ml-auto text-[10px] bg-slate-900 px-1 rounded text-slate-500">Ctrl+T</span>
                             </button>

                             <button 
                                onClick={() => setShowBoxFill(!showBoxFill)}
                                className="w-full text-left px-2 py-2 hover:bg-slate-700 rounded flex items-center gap-2 text-sm text-slate-200"
                             >
                                 <BoxSelect size={14} className={showBoxFill ? 'text-indigo-400' : 'text-slate-500'} />
                                 <span>{showBoxFill ? 'Fill Boxes' : 'Outline Only'}</span>
                                 <span className="ml-auto text-[10px] bg-slate-900 px-1 rounded text-slate-500">F</span>
                             </button>
                        </div>
                        <div className="p-2">
                            <span className="text-[10px] text-slate-500 uppercase font-bold px-2">Actions</span>
                            <button 
                                onClick={() => {
                                    if (viewMode === 'grid') setViewMode('single');
                                    setIsCreating(!isCreating);
                                }}
                                className={`w-full text-left px-2 py-2 mt-1 hover:bg-slate-700 rounded flex items-center gap-2 text-sm ${isCreating ? 'text-indigo-400 font-bold' : 'text-slate-200'}`}
                            >
                                <PlusSquare size={14} />
                                <span>{isCreating ? 'Stop Creating' : 'Create Label'}</span>
                                <span className="ml-auto text-[10px] bg-slate-900 px-1 rounded text-slate-500">E</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
            
            {/* Filter */}
             <div className="flex items-center gap-2 mr-2 border-l border-slate-700 pl-4">
                <Filter size={16} className="text-slate-400" />
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
                    {filteredImages.length > 0 ? (viewMode === 'grid' ? `Page` : currentImageIdx + 1) : 0} 
                    {viewMode === 'grid' ? '' : ` / ${filteredImages.length}`}
                </span>
                <button 
                    onClick={nextImage}
                    disabled={filteredImages.length === 0 || currentImageIdx >= filteredImages.length - 1}
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
            {isInferencing && !isBatchRunning && (
                <span className="text-xs text-amber-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Processing...</span>
            )}
             {isBatchRunning && (
                <span className="text-xs text-indigo-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Batch Run...</span>
            )}
            {!isInferencing && !isBatchRunning && lastSaveStatus === 'saving' && (
                <span className="text-xs text-indigo-400 flex items-center gap-1"><Save size={12} className="animate-spin" /> Saving...</span>
            )}
            {!isInferencing && !isBatchRunning && lastSaveStatus === 'saved' && (
                <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle size={12} /> Saved</span>
            )}
            {lastSaveStatus === 'error' && (
                <span className="text-xs text-red-400">Save Error</span>
            )}
            <span className="text-xs text-slate-600 ml-2">v2.4.0</span>
        </div>
      </header>
      
      {/* Click outside to close menus */}
      {(showToolsMenu || showGridConfig) && (
        <div className="fixed inset-0 z-40" onClick={() => { setShowToolsMenu(false); setShowGridConfig(false); }}></div>
      )}

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
                {viewMode === 'grid' ? (
                    <GridView 
                        images={filteredImages}
                        currentIndex={currentImageIdx}
                        rows={gridConfig.rows}
                        cols={gridConfig.cols}
                        labelsRaw={labelsRaw}
                        predictionsCache={predictionsCache}
                        classes={classes}
                        onImageClick={handleGridImageClick}
                        filterClassId={filterClassId}
                    />
                ) : (
                    <>
                        <ImageViewer 
                            image={currentImage}
                            labels={currentLabels}
                            currentLabelIndex={currentLabelIdx}
                            classes={classes}
                            isCreating={isCreating}
                            showBoxFill={showBoxFill}
                            labelsVisible={labelsVisible}
                            pendingLabelIndex={pendingLabelIndex}
                            onSelectLabel={setCurrentLabelIdx}
                            onUpdateLabel={handleLabelUpdate}
                            onCreateLabel={handleLabelCreate}
                        />
                        <div 
                        onMouseDown={startResizing}
                        className={`w-2 bg-slate-800 hover:bg-indigo-500 cursor-col-resize flex items-center justify-center transition-colors z-30 shrink-0 ${isResizing ? 'bg-indigo-500' : ''}`}
                        >
                        <div className="h-8 w-1 rounded-full bg-slate-600/50"></div>
                        </div>
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
            </>
        )}
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
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-emerald-300 font-bold">Auto-Detect (Single)</span>
                                <span className="font-mono bg-emerald-900/50 border border-emerald-500/50 px-2 py-1 rounded text-white">T</span>
                            </div>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-amber-300 font-bold">Confirm Predictions</span>
                                <span className="font-mono bg-amber-900/50 border border-amber-500/50 px-2 py-1 rounded text-white">Y</span>
                            </div>
                        </div>
                        <div className="space-y-4">
                             <h3 className="text-sm font-bold text-slate-400 uppercase border-b border-slate-700 pb-2">View Controls</h3>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">Toggle Labels</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">Ctrl + T</span>
                            </div>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">Toggle Box Fill</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">F</span>
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
        {showClassSelector && (
            <div 
                className="absolute inset-0 z-[100] bg-black/25 backdrop-blur-[2px] flex items-center justify-center"
                onClick={handleModalBackgroundClick}
            >
                <div 
                    ref={classSelectorRef}
                    className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-96 max-h-[80vh] flex flex-col"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="p-4 border-b border-slate-700">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
                            <Search size={20} className="text-indigo-400" /> 
                            {pendingLabelIndex !== null ? 'Select Class for New Label' : 'Change Class'}
                        </h3>
                        <div className="relative">
                            <input
                                ref={classSearchInputRef}
                                type="text"
                                placeholder="Search or create new..."
                                value={classSearchTerm}
                                onChange={(e) => setClassSearchTerm(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-600 text-white p-2 pl-3 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1 p-2 space-y-1 min-h-[200px]">
                        {filteredClassList.length === 0 && classSearchTerm.length > 0 ? (
                             <div className="flex flex-col items-center justify-center h-full text-slate-400 p-4">
                                <p className="text-sm mb-2">No existing class found.</p>
                                <div className="flex items-center gap-2 text-indigo-400 bg-indigo-900/30 px-3 py-2 rounded-lg border border-indigo-500/30 cursor-pointer hover:bg-indigo-900/50 transition-colors"
                                     onClick={() => {
                                        handleAddNewClass(classSearchTerm).then((newId) => {
                                            if (newId !== undefined && currentLabels[currentLabelIdx]) {
                                                handleLabelUpdate({
                                                    ...currentLabels[currentLabelIdx],
                                                    classId: newId
                                                });
                                                setShowClassSelector(false);
                                            }
                                        });
                                     }}
                                >
                                    <PlusCircle size={16} />
                                    <span className="text-sm font-bold">Press Enter to create "{classSearchTerm}"</span>
                                </div>
                             </div>
                        ) : filteredClassList.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-500">
                                <p>Type to search or add.</p>
                            </div>
                        ) : (
                            filteredClassList.map((item, idx) => {
                                const isActive = idx === selectorIndex;
                                return (
                                    <div 
                                        key={item.index}
                                        onClick={() => {
                                            if (currentLabels[currentLabelIdx]) {
                                                handleLabelUpdate({
                                                    ...currentLabels[currentLabelIdx],
                                                    classId: item.index
                                                });
                                                setShowClassSelector(false);
                                            }
                                        }}
                                        className={`px-4 py-3 rounded-lg cursor-pointer flex items-center justify-between transition-colors ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="font-mono text-xs opacity-60 w-6 text-right bg-black/20 rounded px-1">{item.index}</span>
                                            <span className="font-semibold">{item.name}</span>
                                        </div>
                                        {isActive && <CheckCircle size={16} />}
                                    </div>
                                );
                            })
                        )}
                    </div>
                    <div className="p-2 border-t border-slate-700 text-[10px] text-slate-500 flex justify-between px-4">
                        <span><b>↑/↓</b> to Navigate</span>
                        <span><b>Enter</b> to Confirm/Create</span>
                    </div>
                </div>
            </div>
        )}
        <ModelSettings 
            isOpen={showModelSettings}
            onClose={() => setShowModelSettings(false)}
            config={inferenceConfig}
            onConfigChange={setInferenceConfig}
            isBackendConnected={backendConnected}
        />
      </div>
    </div>
  );
};

export default App;
