import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SetupScreen } from './components/SetupScreen';
import { ImageViewer } from './components/ImageViewer';
import { DetailPanel } from './components/DetailPanel';
import { ModelSettings } from './components/ModelSettings';
import { GridView } from './components/GridView';
import { ImageAsset, YoloLabel, FileSystemFileHandle, FileSystemDirectoryHandle, ReviewData } from './types';
import { parseYoloString, serializeYoloString, getLabelHash } from './utils/yoloHelper';
import { detectObjects, BackendConfig, checkBackendHealth } from './utils/apiHelper';
import { translations } from './utils/translations';
import { ArrowLeft, ArrowRight, Image as ImageIcon, Filter, CheckCircle, Save, PlusSquare, BoxSelect, Home, Search, Keyboard, X, PlusCircle, Wifi, WifiOff, FileCheck, Loader2, Wrench, Eye, EyeOff, ChevronDown, Grid, Square, Settings, LayoutGrid, Zap, ZapOff, Sliders, ZoomIn, Clock, Bot, FolderOutput } from 'lucide-react';

const App: React.FC = () => {
  // Localization State
  const [lang, setLang] = useState<'en' | 'es'>(() => {
      return (localStorage.getItem('yolo_inspector_lang') as 'en' | 'es') || 'en';
  });
  const t = translations[lang];

  const toggleLang = (l: 'en' | 'es') => {
      setLang(l);
      localStorage.setItem('yolo_inspector_lang', l);
  };

  const [isSetup, setIsSetup] = useState(false);
  
  // Data State
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [labelsRaw, setLabelsRaw] = useState<Map<string, string>>(new Map());
  // New State for Model Folder Content
  const [modelLabelsRaw, setModelLabelsRaw] = useState<Map<string, string>>(new Map());

  // Predictions Cache (RAM only, until saved)
  const [predictionsCache, setPredictionsCache] = useState<Map<string, YoloLabel[]>>(new Map());
  
  const [labelHandles, setLabelHandles] = useState<Map<string, FileSystemFileHandle>>(new Map());
  const [labelsDirHandle, setLabelsDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [modelOutputHandle, setModelOutputHandle] = useState<FileSystemDirectoryHandle | null>(null); // Custom Output Folder

  const [classes, setClasses] = useState<string[]>([]);
  const [classFileHandle, setClassFileHandle] = useState<FileSystemFileHandle | null>(null);
  
  // Review System State
  const [reviewedLabels, setReviewedLabels] = useState<Set<string>>(new Set()); // Set of "filename:hash"
  const [reviewsFileHandle, setReviewsFileHandle] = useState<FileSystemFileHandle | null>(null);

  // Failure Tracking State
  const [skippedImages, setSkippedImages] = useState<Set<string>>(new Set());
  const [failureCounts, setFailureCounts] = useState<Map<string, number>>(new Map());

  // View State
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [currentLabelIdx, setCurrentLabelIdx] = useState(0);
  const [panelWidth, setPanelWidth] = useState(400); 
  const [isResizing, setIsResizing] = useState(false);
  const [filterClassId, setFilterClassId] = useState<number>(-1); 
  
  // View Mode & Grid Config
  const [viewMode, setViewMode] = useState<'single' | 'grid'>('single');
  const [gridMode, setGridMode] = useState<'normal' | 'zoom'>('normal'); 
  const [gridConfig, setGridConfig] = useState({ 
      rows: 3, 
      cols: 4,
      context: 30, // %
      magnification: 1,
      interval: 2000, // ms
      isPlaying: true
  });
  const [showGridConfig, setShowGridConfig] = useState(false);
  const [gridConfigTab, setGridConfigTab] = useState<'layout' | 'zoom' | 'playback'>('layout');
  
  // Persistent Zoom
  const [zoomSettings, setZoomSettings] = useState<{context: number, mag: number}>(() => {
     try {
       const saved = localStorage.getItem('defect_inspector_zoom');
       return saved ? JSON.parse(saved) : { context: 30, mag: 1 };
     } catch {
       return { context: 30, mag: 1 };
     }
  });

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
  
  const [isBatchActive, setIsBatchActive] = useState(false);
  const [batchSettings, setBatchSettings] = useState({ lookahead: 50, delay: 100 });
  const [isBackgroundProcessing, setIsBackgroundProcessing] = useState(false);
  const [showBatchSettings, setShowBatchSettings] = useState(false);

  const [isInferencing, setIsInferencing] = useState(false);
  const [backendConnected, setBackendConnected] = useState(false);

  useEffect(() => {
     localStorage.setItem('defect_inspector_zoom', JSON.stringify(zoomSettings));
  }, [zoomSettings]);

  useEffect(() => {
      const check = async () => {
          const isUp = await checkBackendHealth(inferenceConfig.apiUrl);
          setBackendConnected(isUp);
          if (!isUp && isBatchActive) {
             setIsBatchActive(false); 
          }
      };
      check();
      const interval = setInterval(check, 5000);
      return () => clearInterval(interval);
  }, [inferenceConfig.apiUrl, isBatchActive]);

  const recordClassUsage = (className: string) => {
      setClassUsage(prev => {
          const next = { ...prev, [className]: (prev[className] || 0) + 1 };
          localStorage.setItem('yolo_class_usage', JSON.stringify(next));
          return next;
      });
  };

  const [isCreating, setIsCreating] = useState(false); 
  const [showBoxFill, setShowBoxFill] = useState(false); 
  const [labelsVisible, setLabelsVisible] = useState(true); 
  const [showModelLabels, setShowModelLabels] = useState(true); 
  const [showHelp, setShowHelp] = useState(false); 
  const [showToolsMenu, setShowToolsMenu] = useState(false); 
  
  const [showClassSelector, setShowClassSelector] = useState(false);
  const [selectorIndex, setSelectorIndex] = useState(0);
  const [classSearchTerm, setClassSearchTerm] = useState("");
  const classSelectorRef = useRef<HTMLDivElement>(null);
  const classSearchInputRef = useRef<HTMLInputElement>(null);

  const [currentLabels, setCurrentLabels] = useState<YoloLabel[]>([]);
  const [lastSaveStatus, setLastSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
  const [pendingLabelIndex, setPendingLabelIndex] = useState<number | null>(null);

  // --- LOGIC TO SCAN MODEL FOLDER ---
  const scanModelFolder = async (dirHandle: FileSystemDirectoryHandle) => {
      const newMap = new Map<string, string>();
      try {
          for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file' && entry.name.endsWith('.txt')) {
                const fileHandle = entry as FileSystemFileHandle;
                const file = await fileHandle.getFile();
                const text = await file.text();
                const key = entry.name.replace(/\.[^/.]+$/, "");
                newMap.set(key, text);
            }
          }
          setModelLabelsRaw(newMap);
      } catch (e) {
          console.error("Error scanning model folder", e);
      }
  };

  const handleModelOutputChange = async (handle: FileSystemDirectoryHandle | null) => {
      setModelOutputHandle(handle);
      if (handle) {
          await scanModelFolder(handle);
      } else {
          setModelLabelsRaw(new Map());
      }
  };
  // ----------------------------------

  const loadReviewsFile = async (dirHandle: FileSystemDirectoryHandle) => {
      try {
          const fileHandle = await dirHandle.getFileHandle('reviews.json', { create: true });
          setReviewsFileHandle(fileHandle);
          const file = await fileHandle.getFile();
          const text = await file.text();
          if (text.trim()) {
              const data: ReviewData = JSON.parse(text);
              const newSet = new Set<string>();
              Object.entries(data).forEach(([filename, hashes]) => {
                  hashes.forEach(h => newSet.add(`${filename}:${h}`));
              });
              setReviewedLabels(newSet);
          } else {
              setReviewedLabels(new Set());
          }
      } catch (e) {
          console.warn("Could not load reviews.json", e);
          // Fallback to empty if it fails
          setReviewedLabels(new Set());
      }
  };

  const saveReviewsFile = async (newSet: Set<string>) => {
      if (!reviewsFileHandle) return;
      try {
          // Reconstruct object from Set
          const data: ReviewData = {};
          newSet.forEach(item => {
              const [filename, hash] = item.split(':');
              if (hash) { // simple validation
                  if (!data[filename]) data[filename] = [];
                  data[filename].push(hash);
              }
          });

          const writable = await reviewsFileHandle.createWritable();
          await writable.write(JSON.stringify(data, null, 2));
          await writable.close();
      } catch (e) {
          console.error("Failed to save reviews.json", e);
      }
  };

  const handleSetupComplete = async (
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
    setPredictionsCache(new Map());
    setModelOutputHandle(null); 
    setModelLabelsRaw(new Map());
    setSkippedImages(new Set());
    setFailureCounts(new Map());
    
    // Load reviews
    if (dirHandle) {
        await loadReviewsFile(dirHandle);
    }
  };

  const handleHome = () => {
      if (window.confirm(lang === 'es' ? "¿Volver al inicio? Los cambios no guardados se perderán." : "Return to Home? Unsaved changes might be lost.")) {
          setIsSetup(false);
          setImages([]);
          setLabelsRaw(new Map());
          setModelLabelsRaw(new Map());
          setPredictionsCache(new Map());
          setCurrentLabels([]);
          setIsBatchActive(false);
          setReviewedLabels(new Set());
          setSkippedImages(new Set());
          setFailureCounts(new Map());
      }
  };

  // --- SHORTCUTS LOGIC ---
  // Attempt to override browser shortcuts aggressively
  useEffect(() => {
    const overrideCtrlZ = (e: KeyboardEvent) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            console.log("Ctrl+Z Intercepted");
            
            const event = new CustomEvent('app:toggle-inference');
            window.dispatchEvent(event);
        }
    };
    
    // Use capture phase
    window.addEventListener('keydown', overrideCtrlZ, { capture: true });
    return () => window.removeEventListener('keydown', overrideCtrlZ, { capture: true });
  }, []);
  
  // Listener for custom event dispatched by raw handler
  useEffect(() => {
      const handleToggleInference = () => {
          if (backendConnected) {
             setIsBatchActive(prev => !prev);
          } else {
             setShowModelSettings(true);
          }
      };
      window.addEventListener('app:toggle-inference', handleToggleInference);
      return () => window.removeEventListener('app:toggle-inference', handleToggleInference);
  }, [backendConnected]);
  // -------------------------

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

  const filteredImages = useMemo(() => {
    if (filterClassId === -1) return images;

    if (filterClassId === -2) {
        return images.filter(img => {
            const key = img.name.replace(/\.[^/.]+$/, "");
            const raw = labelsRaw.get(key);
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
    
    // 1. Get Manual Labels (Original Folder)
    const rawManual = labelsRaw.get(key) || "";
    const manualLabels = parseYoloString(rawManual).map(l => ({ ...l, isPredicted: false }));
    
    // 2. Get Model Labels (Model Folder - if separate)
    let modelLabelsFromDisk: YoloLabel[] = [];
    if (modelOutputHandle) {
        const rawModel = modelLabelsRaw.get(key) || "";
        modelLabelsFromDisk = parseYoloString(rawModel).map(l => ({ ...l, isPredicted: true }));
    }

    // 3. Get RAM Cache (Latest Predictions)
    // Note: If we just saved, the cache is cleared for this image.
    const cachedPredictions = predictionsCache.get(key) || [];

    // Combine: Manual + ModelDisk + RAM
    // Note: RAM predictions usually supersede disk predictions if they exist for the same image (new run).
    // But here we'll just append. If logic requires RAM to replace Disk Model labels, we can check.
    // For now, let's assume if RAM cache exists, we use it INSTEAD of disk model labels, to avoid duplicates if we haven't saved yet.
    
    let effectiveModelLabels = modelLabelsFromDisk;
    if (cachedPredictions.length > 0) {
        effectiveModelLabels = cachedPredictions;
    }

    const mergedLabels = [...manualLabels, ...effectiveModelLabels];
    
    setCurrentLabels(mergedLabels);
    setPendingLabelIndex(null); 
    
    setIsCreating(false);
    setShowClassSelector(false);

    if (mergedLabels.length > 0) {
       if (filterClassId !== -1 && filterClassId !== -2) {
          const matchIdx = mergedLabels.findIndex(l => l.classId === filterClassId);
          if (matchIdx !== -1) {
            setCurrentLabelIdx(matchIdx);
          } else {
             setCurrentLabelIdx(0);
          }
       } else {
           if (currentLabelIdx >= mergedLabels.length || currentLabelIdx < 0) {
             setCurrentLabelIdx(0);
           }
       }
    } else {
      setCurrentLabelIdx(-1);
    }
    
    setLastSaveStatus('idle');
  }, [currentImageIdx, filteredImages, labelsRaw, modelLabelsRaw, predictionsCache, isSetup, filterClassId, modelOutputHandle]);


  const handlePageChange = (direction: 'next' | 'prev') => {
      if (viewMode === 'grid') {
          const itemsPerPage = gridConfig.rows * gridConfig.cols;
          const newIdx = direction === 'next' 
            ? currentImageIdx + itemsPerPage 
            : currentImageIdx - itemsPerPage;
          
          if (newIdx >= 0 && newIdx < filteredImages.length) {
              setCurrentImageIdx(newIdx);
          } else if (direction === 'next' && currentImageIdx < filteredImages.length - 1) {
              setCurrentImageIdx(filteredImages.length - 1);
          } else if (direction === 'prev' && currentImageIdx > 0) {
              setCurrentImageIdx(0);
          }
      } else {
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

  const handleToggleReview = () => {
      const img = filteredImages[currentImageIdx];
      const label = currentLabels[currentLabelIdx];
      if (!img || !label) return;

      const imgKey = img.name.replace(/\.[^/.]+$/, "");
      const hash = getLabelHash(label);
      const fullKey = `${imgKey}:${hash}`;

      const newSet = new Set(reviewedLabels);
      if (newSet.has(fullKey)) {
          newSet.delete(fullKey);
      } else {
          newSet.add(fullKey);
      }
      setReviewedLabels(newSet);
      saveReviewsFile(newSet); // Persist
  };

  const handleLabelUpdate = (updatedLabel: YoloLabel, index?: number) => {
    const targetIdx = index !== undefined ? index : currentLabelIdx;

    const newLabels = [...currentLabels];
    if (targetIdx >= 0 && targetIdx < newLabels.length) {
        const oldLabel = newLabels[targetIdx];
        
        if (oldLabel.classId !== updatedLabel.classId) {
            const className = classes[updatedLabel.classId];
            if (className) recordClassUsage(className);
        }

        // We do NOT strip isPredicted flag here. 
        // We let it remain a prediction until accepted.
        
        newLabels[targetIdx] = updatedLabel;
        setCurrentLabels(newLabels);
        
        if (pendingLabelIndex === targetIdx) {
            setPendingLabelIndex(null);
        }

        if (updatedLabel.isPredicted) {
            // It's a modified prediction: Update Cache ONLY
            // We ensure the cache reflects this change so it persists in RAM across navigation
            const currentImg = filteredImages[currentImageIdx];
            if (currentImg) {
                const key = currentImg.name.replace(/\.[^/.]+$/, "");
                const remainingPredictions = newLabels.filter(l => l.isPredicted);
                setPredictionsCache(prev => {
                    const newMap = new Map(prev);
                    if (remainingPredictions.length > 0) {
                        newMap.set(key, remainingPredictions);
                    } else {
                        newMap.delete(key);
                    }
                    return newMap;
                });
            }
            // DO NOT SAVE TO DISK
        } else {
             // It's a manual label: Save to disk
             updateRawDataAndSave(newLabels);
        }
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

        const key = currentImg.name.replace(/\.[^/.]+$/, "");
        setPredictionsCache(prev => {
            const newMap = new Map(prev);
            newMap.set(key, predictions);
            return newMap;
        });
        
        // Clear failure count on success
        setFailureCounts(prev => {
            const newMap = new Map(prev);
            newMap.delete(key);
            return newMap;
        });

    } catch (e) {
        console.error("Inference failed", e);
        const key = currentImg.name.replace(/\.[^/.]+$/, "");
        setFailureCounts(prev => {
             const newMap = new Map(prev);
             const count = (newMap.get(key) || 0) + 1;
             newMap.set(key, count);
             return newMap;
        });
        alert("Inference failed. Is the Python backend running?");
    } finally {
        setIsInferencing(false);
    }
  };

  useEffect(() => {
    if (!isBatchActive || !backendConnected || isBackgroundProcessing || filteredImages.length === 0) return;

    const findNextCandidate = () => {
        for (let i = 0; i < batchSettings.lookahead; i++) {
            const targetIdx = currentImageIdx + i;
            if (targetIdx >= filteredImages.length) break;

            const img = filteredImages[targetIdx];
            const key = img.name.replace(/\.[^/.]+$/, "");
            
            // Skip images marked as failed
            if (skippedImages.has(key)) continue;

            if (!predictionsCache.has(key)) {
                return { idx: targetIdx, img };
            }
        }
        return null;
    };

    const candidate = findNextCandidate();

    if (candidate) {
        setIsBackgroundProcessing(true);
        const { img } = candidate;

        const processImage = async () => {
             await new Promise(r => setTimeout(r, batchSettings.delay));
             
             if (!isBatchActive) {
                 setIsBackgroundProcessing(false);
                 return;
             }

             if (img.file) {
                 try {
                     const predictions = await detectObjects(img.file, inferenceConfig);
                     const key = img.name.replace(/\.[^/.]+$/, "");
                     
                     setPredictionsCache(prev => {
                         const newMap = new Map(prev);
                         newMap.set(key, predictions); 
                         return newMap;
                     });
                     
                     // Reset failure count on success
                     setFailureCounts(prev => {
                        const newMap = new Map(prev);
                        newMap.delete(key);
                        return newMap;
                     });

                 } catch (e) {
                     console.warn(`Bg inference failed for ${img.name}`, e);
                     const key = img.name.replace(/\.[^/.]+$/, "");
                     
                     // Failure logic: Retry up to 2 times then skip
                     setFailureCounts(prev => {
                         const newMap = new Map(prev);
                         const count = (newMap.get(key) || 0) + 1;
                         newMap.set(key, count);
                         
                         if (count >= 2) {
                             console.log(`Skipping image ${img.name} after ${count} failures.`);
                             setSkippedImages(prevSet => {
                                 const newSet = new Set(prevSet);
                                 newSet.add(key);
                                 return newSet;
                             });
                         }
                         return newMap;
                     });
                 }
             }
             setIsBackgroundProcessing(false);
        };
        processImage();
    }
  }, [isBatchActive, backendConnected, isBackgroundProcessing, currentImageIdx, filteredImages, batchSettings, predictionsCache, inferenceConfig, skippedImages]);


  const handleAcceptPredictions = () => {
      const currentImg = filteredImages[currentImageIdx];
      if (!currentImg) return;
      
      const key = currentImg.name.replace(/\.[^/.]+$/, "");

      const newLabels = currentLabels.map(l => {
          if (l.isPredicted) {
              const { isPredicted, ...rest } = l;
              return rest;
          }
          return l;
      });

      setPredictionsCache(prev => {
          const newMap = new Map(prev);
          newMap.delete(key);
          return newMap;
      });

      setCurrentLabels(newLabels);
      // Force save predictions is false because we just converted them to manual!
      updateRawDataAndSave(newLabels, false); 
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
          
          if (labelToDelete.isPredicted) {
               // Update cache only, do NOT save to disk
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
          } else {
               // Update disk
               updateRawDataAndSave(newLabels);
          }

          setCurrentLabels(newLabels);
          
          if (newLabels.length > 0) {
              const newIdx = Math.max(0, currentLabelIdx - 1);
              setCurrentLabelIdx(newIdx);
          } else {
              setCurrentLabelIdx(-1);
          }
      }
  };

  const updateRawDataAndSave = async (newLabels: YoloLabel[], forceSavePredictions: boolean = false) => {
      if (!filteredImages[currentImageIdx]) return;

      const imgKey = filteredImages[currentImageIdx].name.replace(/\.[^/.]+$/, "");
      setLastSaveStatus('saving');

      // SPLIT LABELS
      const manualLabels = newLabels.filter(l => !l.isPredicted);
      const predictedLabels = newLabels.filter(l => l.isPredicted);

      try {
        // 1. SAVE MANUAL LABELS (Always to Original Folder)
        const newManualRaw = serializeYoloString(manualLabels);
        
        // Update State
        const newLabelsMap = new Map(labelsRaw);
        newLabelsMap.set(imgKey, newManualRaw);
        setLabelsRaw(newLabelsMap);
        
        let manualHandle = labelHandles.get(imgKey);
        // Create if doesn't exist in original folder
        if (!manualHandle && labelsDirHandle) {
            manualHandle = await labelsDirHandle.getFileHandle(`${imgKey}.txt`, { create: true });
            const newHandles = new Map(labelHandles);
            newHandles.set(imgKey, manualHandle);
            setLabelHandles(newHandles);
        }

        if (manualHandle) {
             const writable = await manualHandle.createWritable();
             await writable.write(newManualRaw);
             await writable.close();
        }

        // 2. SAVE PREDICTED LABELS (To Model Folder if exists, otherwise overwrite Manual)
        if (modelOutputHandle) {
             // If we have a separate model folder, save predictions there
             const newModelRaw = serializeYoloString(predictedLabels);
             
             // Update State
             const newModelMap = new Map(modelLabelsRaw);
             newModelMap.set(imgKey, newModelRaw);
             setModelLabelsRaw(newModelMap);

             const modelFileHandle = await modelOutputHandle.getFileHandle(`${imgKey}.txt`, { create: true });
             const writable = await modelFileHandle.createWritable();
             await writable.write(newModelRaw);
             await writable.close();

        } else if (forceSavePredictions || predictedLabels.length > 0) {
             // If NO separate model folder is defined, but we have predictions we want to save (e.g. mixed),
             // The standard behavior is usually to mix them.
             // But the user specific request says: "If this option is not defined, it overwrites the manual folder files"
             // In this case, we merge them and save to manual handle.
             const mergedRaw = serializeYoloString([...manualLabels, ...predictedLabels]);
             if (manualHandle) {
                 const writable = await manualHandle.createWritable();
                 await writable.write(mergedRaw);
                 await writable.close();
                 // Update state to reflect merged
                 newLabelsMap.set(imgKey, mergedRaw);
                 setLabelsRaw(newLabelsMap);
             }
        }
        
        setLastSaveStatus('saved');
        setTimeout(() => setLastSaveStatus('idle'), 1500);

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

  useEffect(() => {
    if (!isSetup) return;

    const handleKeyDown = (e: KeyboardEvent) => {
        // ... Logic continues below
        if (showClassSelector || showGridConfig || showBatchSettings) {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (pendingLabelIndex !== null) {
                    cancelPendingLabel();
                }
                setShowClassSelector(false);
                setShowGridConfig(false);
                setShowBatchSettings(false);
            } else if (e.key === 'Enter' && showClassSelector) {
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

        if (e.ctrlKey && key === 'b') {
            e.preventDefault();
            setLabelsVisible(prev => !prev);
            return;
        }

        if (e.ctrlKey && key === 'v') {
             e.preventDefault();
             setShowModelLabels(prev => !prev);
             return;
        }

        if (e.ctrlKey && key === 'f') {
            e.preventDefault();
            handleToggleReview();
            return;
        }

        if (showHelp) {
            if (key === 'escape') setShowHelp(false);
            return; 
        }

        switch (key) {
            case 'v':
                e.preventDefault();
                setLabelsVisible(prev => !prev);
                break;
            case 'd': 
            case 'arrowright':
                e.preventDefault();
                nextImage();
                break;
            case 'a':
            case 'arrowleft':
                e.preventDefault();
                prevImage();
                break;
            case 'w':
            case 'arrowup':
                if (viewMode === 'single') {
                    e.preventDefault();
                    nextLabel();
                }
                break;
            case 's':
            case 'arrowdown':
                if (viewMode === 'single') {
                    e.preventDefault();
                    prevLabel();
                }
                break;
            
            case 'q':
            case 'delete':
                if (viewMode === 'single') {
                    e.preventDefault();
                    handleLabelDelete();
                }
                break;
            case 'e': 
                if (viewMode === 'single') {
                    e.preventDefault();
                    setIsCreating(prev => !prev);
                }
                break;
            case 'f':
                e.preventDefault();
                setShowBoxFill(prev => !prev);
                break;
            
            // Changed from T to Z as requested
            case 'z': 
                if (!e.ctrlKey) { 
                    e.preventDefault();
                    handleRunInference();
                }
                // Ctrl+Z handled by raw listener
                break;
            
            case 'y': 
                e.preventDefault();
                handleAcceptPredictions();
                break;

            case 'r': 
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
                setShowBatchSettings(false);
                break;
        }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isSetup, nextImage, prevImage, nextLabel, prevLabel, handleLabelDelete, isCreating, showClassSelector, selectorIndex, classes, currentLabels, currentLabelIdx, showHelp, filteredClassList, classSearchTerm, pendingLabelIndex, inferenceConfig, currentImageIdx, backendConnected, showToolsMenu, viewMode, showGridConfig, isBatchActive, showBatchSettings]);

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
        setShowBatchSettings(false);
    }
  };
  
  const handleGridImageClick = (globalIdx: number) => {
      setCurrentImageIdx(globalIdx);
      setViewMode('single');
  };

  if (!isSetup) {
    return <SetupScreen onComplete={handleSetupComplete} lang={lang} onToggleLang={toggleLang} />;
  }

  const currentImage = filteredImages[currentImageIdx];
  const pendingPredictionsCount = currentLabels.filter(l => l.isPredicted).length;

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 overflow-hidden relative">
      <header 
        className={`h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 transition-all ${
            showToolsMenu || showGridConfig || showBatchSettings ? 'z-50' : 'z-20'
        }`}
      >
        <div className="flex items-center gap-4">
            <button 
                onClick={handleHome}
                className="bg-slate-800 hover:bg-slate-700 p-2 rounded-lg text-slate-300 border border-slate-700 transition-colors"
                title={t.app.backHome}
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
             <button
                onClick={() => setShowModelSettings(true)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold transition-all border ${backendConnected ? 'bg-emerald-900/50 border-emerald-500 text-emerald-300 hover:bg-emerald-900' : 'bg-red-900/30 border-red-800 text-red-400 hover:bg-red-900/50'}`}
             >
                {backendConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
                {backendConnected ? t.app.connected : t.app.offline}
             </button>
             
             <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700 p-0.5 relative">
                 <button 
                    onClick={() => {
                        if (backendConnected) setIsBatchActive(!isBatchActive);
                        else setShowModelSettings(true);
                    }}
                    disabled={!backendConnected}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-l-md text-xs font-bold transition-all border-r border-slate-900 ${isBatchActive
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
                        : (backendConnected ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-800 text-slate-600 cursor-not-allowed')}`}
                 >
                    {isBatchActive ? <Zap size={14} className="fill-white" /> : <ZapOff size={14} />}
                    {isBatchActive ? t.app.autoOn : t.app.autoOff}
                 </button>
                 <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowBatchSettings(!showBatchSettings);
                        setShowGridConfig(false);
                        setShowToolsMenu(false);
                    }}
                    className="px-2 py-1.5 rounded-r-md hover:bg-slate-600 text-slate-400 hover:text-white transition-colors"
                    title={t.app.batchSettings}
                >
                    <Sliders size={14} />
                </button>

                 {showBatchSettings && (
                    <div 
                        className="absolute top-full right-0 mt-2 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 p-4 w-56"
                        onMouseDown={(e) => e.stopPropagation()} 
                        onClick={(e) => e.stopPropagation()}
                    >
                         <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
                             <Zap size={12} /> {t.app.batch.title}
                         </h4>
                         <div className="space-y-4">
                             <div>
                                 <label className="text-xs text-slate-300 flex justify-between mb-1">
                                     {t.app.batch.lookahead}
                                     <b className="text-indigo-400">{batchSettings.lookahead}</b>
                                 </label>
                                 <input 
                                    type="range" min="10" max="200" step="10"
                                    value={batchSettings.lookahead}
                                    onChange={(e) => setBatchSettings(prev => ({...prev, lookahead: parseInt(e.target.value)}))}
                                    className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                 />
                                 <p className="text-[10px] text-slate-500 mt-1">{t.app.batch.lookaheadDesc}</p>
                             </div>
                             <div>
                                 <label className="text-xs text-slate-300 flex justify-between mb-1">
                                     {t.app.batch.delay}
                                     <b className="text-indigo-400">{batchSettings.delay}ms</b>
                                 </label>
                                 <input 
                                    type="range" min="0" max="1000" step="50"
                                    value={batchSettings.delay}
                                    onChange={(e) => setBatchSettings(prev => ({...prev, delay: parseInt(e.target.value)}))}
                                    className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                 />
                                  <p className="text-[10px] text-slate-500 mt-1">{t.app.batch.delayDesc}</p>
                             </div>
                         </div>
                    </div>
                )}
             </div>
            
             {pendingPredictionsCount > 0 && viewMode === 'single' && (
                 <button 
                    onClick={handleAcceptPredictions}
                    className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold transition-all border bg-amber-900/50 border-amber-500 text-amber-300 hover:bg-amber-900 animate-pulse"
                 >
                    <FileCheck size={14} />
                    {pendingPredictionsCount} {t.app.unsaved}
                 </button>
             )}

            <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700 p-0.5 relative">
                <button
                    onClick={() => setViewMode(prev => prev === 'single' ? 'grid' : 'single')}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-l-md text-xs font-bold bg-slate-700 text-white hover:bg-slate-600 transition-colors border-r border-slate-900"
                >
                    {viewMode === 'single' ? <Square size={14} /> : <LayoutGrid size={14} />}
                    {viewMode === 'single' ? t.app.single : t.app.matrix}
                </button>
                {viewMode === 'grid' && (
                     <button
                        onClick={() => setGridMode(prev => prev === 'normal' ? 'zoom' : 'normal')}
                        className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold transition-colors border-r border-slate-900 ${gridMode === 'zoom' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                     >
                         {gridMode === 'normal' ? t.app.normal : t.app.zoom}
                     </button>
                )}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowGridConfig(!showGridConfig);
                        setShowBatchSettings(false);
                        setShowToolsMenu(false);
                    }}
                    className="px-2 py-1.5 rounded-r-md hover:bg-slate-600 text-slate-400 hover:text-white transition-colors"
                    title={t.app.gridSettings}
                >
                    <Settings size={14} />
                </button>

                {showGridConfig && (
                    <div 
                        className="absolute top-full right-0 mt-2 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 p-4 w-64"
                        onMouseDown={(e) => e.stopPropagation()} 
                        onClick={(e) => e.stopPropagation()}
                    >
                         <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
                             <Grid size={12} /> {t.app.gridSettings}
                         </h4>
                         
                         <div className="flex border-b border-slate-600 mb-4">
                            <button 
                                onClick={() => setGridConfigTab('layout')}
                                className={`flex-1 pb-2 text-[10px] font-bold uppercase transition-colors ${gridConfigTab === 'layout' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                {t.app.grid.layout}
                            </button>
                            <button 
                                onClick={() => setGridConfigTab('zoom')}
                                className={`flex-1 pb-2 text-[10px] font-bold uppercase transition-colors ${gridConfigTab === 'zoom' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                {t.app.grid.zoom}
                            </button>
                            <button 
                                onClick={() => setGridConfigTab('playback')}
                                className={`flex-1 pb-2 text-[10px] font-bold uppercase transition-colors ${gridConfigTab === 'playback' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                {t.app.grid.cycle}
                            </button>
                         </div>

                         <div className="space-y-3">
                             {gridConfigTab === 'layout' && (
                                 <>
                                     <div>
                                         <label className="text-xs text-slate-300 flex justify-between items-center mb-1">
                                             {t.app.grid.rows} <b className="bg-slate-900 px-1 rounded">{gridConfig.rows}</b>
                                         </label>
                                         <input 
                                            type="range" min="1" max="10" 
                                            value={gridConfig.rows}
                                            onChange={(e) => setGridConfig(prev => ({...prev, rows: parseInt(e.target.value)}))}
                                            className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                         />
                                     </div>
                                     <div>
                                         <label className="text-xs text-slate-300 flex justify-between items-center mb-1">
                                             {t.app.grid.cols} <b className="bg-slate-900 px-1 rounded">{gridConfig.cols}</b>
                                         </label>
                                         <input 
                                            type="range" min="1" max="10" 
                                            value={gridConfig.cols}
                                            onChange={(e) => setGridConfig(prev => ({...prev, cols: parseInt(e.target.value)}))}
                                            className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                         />
                                     </div>
                                 </>
                             )}

                             {gridConfigTab === 'zoom' && (
                                 <>
                                    <div className="flex items-start gap-2 mb-2 p-2 bg-indigo-900/20 border border-indigo-500/20 rounded">
                                        <ZoomIn size={14} className="text-indigo-400 mt-0.5" />
                                        <p className="text-[10px] text-slate-400 leading-tight">{t.app.grid.applyZoom}</p>
                                    </div>
                                    <div>
                                         <label className="text-xs text-slate-300 flex justify-between items-center mb-1">
                                             {t.app.grid.context} <b className="bg-slate-900 px-1 rounded">{gridConfig.context}%</b>
                                         </label>
                                         <input 
                                            type="range" min="0" max="100" 
                                            value={gridConfig.context}
                                            onChange={(e) => setGridConfig(prev => ({...prev, context: parseInt(e.target.value)}))}
                                            className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                         />
                                     </div>
                                     <div>
                                         <label className="text-xs text-slate-300 flex justify-between items-center mb-1">
                                             {t.app.grid.magnification} <b className="bg-slate-900 px-1 rounded">{gridConfig.magnification}x</b>
                                         </label>
                                         <input 
                                            type="range" min="1" max="5" step="0.1"
                                            value={gridConfig.magnification}
                                            onChange={(e) => setGridConfig(prev => ({...prev, magnification: parseFloat(e.target.value)}))}
                                            className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                         />
                                     </div>
                                 </>
                             )}

                             {gridConfigTab === 'playback' && (
                                 <>
                                    <div className="flex items-start gap-2 mb-2 p-2 bg-amber-900/20 border border-amber-500/20 rounded">
                                        <Clock size={14} className="text-amber-400 mt-0.5" />
                                        <p className="text-[10px] text-slate-400 leading-tight">{t.app.grid.cycleSpeed}</p>
                                    </div>
                                    <div>
                                         <label className="text-xs text-slate-300 flex justify-between items-center mb-1">
                                             {t.app.grid.interval} <b className="bg-slate-900 px-1 rounded">{gridConfig.interval / 1000}s</b>
                                         </label>
                                         <input 
                                            type="range" min="500" max="10000" step="500"
                                            value={gridConfig.interval}
                                            onChange={(e) => setGridConfig(prev => ({...prev, interval: parseInt(e.target.value)}))}
                                            className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                         />
                                     </div>
                                     <div className="flex items-center justify-between mt-2">
                                        <span className="text-xs text-slate-300">{t.app.grid.autoPlay}</span>
                                        <button 
                                            onClick={() => setGridConfig(prev => ({...prev, isPlaying: !prev.isPlaying}))}
                                            className={`w-10 h-5 rounded-full relative transition-colors ${gridConfig.isPlaying ? 'bg-indigo-600' : 'bg-slate-600'}`}
                                        >
                                            <div className={`absolute top-1 left-1 bg-white w-3 h-3 rounded-full transition-transform ${gridConfig.isPlaying ? 'translate-x-5' : ''}`} />
                                        </button>
                                     </div>
                                 </>
                             )}
                         </div>
                    </div>
                )}
            </div>

            <div className="relative">
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowToolsMenu(!showToolsMenu);
                        setShowGridConfig(false);
                        setShowBatchSettings(false);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                >
                    <Wrench size={14} />
                    {t.app.tools}
                    <ChevronDown size={12} />
                </button>

                {showToolsMenu && (
                    <div 
                        className="absolute top-full right-0 mt-2 w-48 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 overflow-hidden"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-2 border-b border-slate-700">
                             <span className="text-[10px] text-slate-500 uppercase font-bold px-2">{t.app.toolsMenu.visualization}</span>
                             
                             <button 
                                onClick={() => setLabelsVisible(!labelsVisible)}
                                className="w-full text-left px-2 py-2 mt-1 hover:bg-slate-700 rounded flex items-center gap-2 text-sm text-slate-200"
                             >
                                 {labelsVisible ? <Eye size={14} className="text-emerald-400" /> : <EyeOff size={14} className="text-slate-500" />}
                                 <span>{labelsVisible ? t.app.toolsMenu.hideManual : t.app.toolsMenu.showManual}</span>
                                 <span className="ml-auto text-[10px] bg-slate-900 px-1 rounded text-slate-500">V</span>
                             </button>

                             <button 
                                onClick={() => setShowModelLabels(!showModelLabels)}
                                className="w-full text-left px-2 py-2 hover:bg-slate-700 rounded flex items-center gap-2 text-sm text-slate-200"
                             >
                                 {showModelLabels ? <Bot size={14} className="text-amber-400" /> : <Bot size={14} className="text-slate-500" />}
                                 <span>{showModelLabels ? t.app.toolsMenu.hideModel : t.app.toolsMenu.showModel}</span>
                                 <span className="ml-auto text-[10px] bg-slate-900 px-1 rounded text-slate-500">Ctrl+V</span>
                             </button>

                             <button 
                                onClick={() => setShowBoxFill(!showBoxFill)}
                                className="w-full text-left px-2 py-2 hover:bg-slate-700 rounded flex items-center gap-2 text-sm text-slate-200"
                             >
                                 <BoxSelect size={14} className={showBoxFill ? 'text-indigo-400' : 'text-slate-500'} />
                                 <span>{showBoxFill ? t.app.toolsMenu.fillBoxes : t.app.toolsMenu.outlineOnly}</span>
                                 <span className="ml-auto text-[10px] bg-slate-900 px-1 rounded text-slate-500">F</span>
                             </button>
                        </div>
                        <div className="p-2 border-b border-slate-700">
                            <span className="text-[10px] text-slate-500 uppercase font-bold px-2">{t.app.toolsMenu.actions}</span>
                            <button 
                                onClick={() => {
                                    if (viewMode === 'grid') setViewMode('single');
                                    setIsCreating(!isCreating);
                                }}
                                className={`w-full text-left px-2 py-2 mt-1 hover:bg-slate-700 rounded flex items-center gap-2 text-sm ${isCreating ? 'text-indigo-400 font-bold' : 'text-slate-200'}`}
                            >
                                <PlusSquare size={14} />
                                <span>{isCreating ? t.app.toolsMenu.stopCreating : t.app.toolsMenu.createLabel}</span>
                                <span className="ml-auto text-[10px] bg-slate-900 px-1 rounded text-slate-500">E</span>
                            </button>
                        </div>
                        <div className="p-2">
                             <span className="text-[10px] text-slate-500 uppercase font-bold px-2">{t.app.toolsMenu.config}</span>
                             <button 
                                onClick={() => {
                                    setShowModelSettings(true);
                                    setShowToolsMenu(false);
                                }}
                                className="w-full text-left px-2 py-2 mt-1 hover:bg-slate-700 rounded flex items-center gap-2 text-sm text-slate-200"
                             >
                                 <FolderOutput size={14} className="text-purple-400" />
                                 <span>{t.app.toolsMenu.outputFolder}</span>
                             </button>
                        </div>
                    </div>
                )}
            </div>
            
             <div className="flex items-center gap-2 mr-2 border-l border-slate-700 pl-4">
                <Filter size={16} className="text-slate-400" />
                <select 
                    value={filterClassId} 
                    onChange={(e) => setFilterClassId(parseInt(e.target.value))}
                    className="bg-slate-800 text-slate-200 text-xs p-1.5 rounded border border-slate-700 focus:ring-1 focus:ring-indigo-500 outline-none max-w-[150px] cursor-pointer"
                >
                    <option value={-1}>{t.app.filterAll}</option>
                    <option value={-2}>{t.app.filterUnlabeled}</option>
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
                    {filteredImages.length > 0 ? (viewMode === 'grid' ? t.app.page : currentImageIdx + 1) : 0} 
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
            >
                <Keyboard size={20} />
            </button>
        </div>

        <div className="w-40 flex justify-end items-center gap-2">
            {isInferencing && (
                <span className="text-xs text-amber-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Single...</span>
            )}
             {isBackgroundProcessing && (
                <span className="text-xs text-indigo-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Auto...</span>
            )}
            {!isInferencing && !isBackgroundProcessing && lastSaveStatus === 'saving' && (
                <span className="text-xs text-indigo-400 flex items-center gap-1"><Save size={12} className="animate-spin" /> {t.app.saveSaving}</span>
            )}
            {!isInferencing && !isBackgroundProcessing && lastSaveStatus === 'saved' && (
                <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle size={12} /> {t.app.saveSaved}</span>
            )}
            {lastSaveStatus === 'error' && (
                <span className="text-xs text-red-400">{t.app.saveError}</span>
            )}
        </div>
      </header>
      
      {(showToolsMenu || showGridConfig || showBatchSettings) && (
        <div className="fixed inset-0 z-40" onClick={() => { setShowToolsMenu(false); setShowGridConfig(false); setShowBatchSettings(false); }}></div>
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
                        gridMode={gridMode}
                        zoomSettings={{ context: gridConfig.context, mag: gridConfig.magnification }}
                        slideshowSettings={{ interval: gridConfig.interval, isPlaying: gridConfig.isPlaying }}
                        showModelLabels={showModelLabels}
                        labelsVisible={labelsVisible}
                        reviewedLabels={reviewedLabels}
                        t={t}
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
                            showModelLabels={showModelLabels}
                            pendingLabelIndex={pendingLabelIndex}
                            onSelectLabel={setCurrentLabelIdx}
                            onUpdateLabel={handleLabelUpdate}
                            onCreateLabel={handleLabelCreate}
                            t={t}
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
                            isReviewed={currentLabels[currentLabelIdx] ? reviewedLabels.has(`${currentImage.name.replace(/\.[^/.]+$/, "")}:${getLabelHash(currentLabels[currentLabelIdx])}`) : false}
                            onToggleReview={handleToggleReview}
                            t={t}
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
                            <Keyboard className="text-indigo-400" /> {t.app.shortcutsTitle || "Keyboard Shortcuts"}
                        </h2>
                        <button onClick={() => setShowHelp(false)} className="text-slate-400 hover:text-white">
                            <X size={24} />
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-slate-400 uppercase border-b border-slate-700 pb-2">{t.app.help.navTitle}</h3>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">{t.app.help.prevNextImg}</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">A / D</span>
                            </div>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">{t.app.help.prevNextLabel}</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">W / S</span>
                            </div>
                        </div>
                        <div className="space-y-4">
                             <h3 className="text-sm font-bold text-slate-400 uppercase border-b border-slate-700 pb-2">{t.app.help.editTitle}</h3>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">{t.app.help.createBox}</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">E</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">{t.app.help.deleteSel}</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">Q</span>
                            </div>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">{t.app.help.changeClass}</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">R</span>
                            </div>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">{t.app.help.verifyLabel}</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">Ctrl + F</span>
                            </div>
                        </div>
                        <div className="space-y-4">
                             <h3 className="text-sm font-bold text-slate-400 uppercase border-b border-slate-700 pb-2">{t.app.help.viewTitle}</h3>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">{t.app.help.toggleManual}</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">V</span>
                            </div>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">{t.app.help.toggleModel}</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">Ctrl + V</span>
                            </div>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">{t.app.help.toggleFill}</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">F</span>
                            </div>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">{t.app.help.zoomImg}</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">Ctrl + Scroll</span>
                            </div>
                        </div>
                         <div className="space-y-4">
                             <h3 className="text-sm font-bold text-slate-400 uppercase border-b border-slate-700 pb-2">{t.app.help.genTitle}</h3>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-emerald-300 font-bold">{t.app.help.autoSingle}</span>
                                <span className="font-mono bg-emerald-900/50 border border-emerald-500/50 px-2 py-1 rounded text-white">Z</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-indigo-300 font-bold">{t.app.help.toggleAuto}</span>
                                <span className="font-mono bg-indigo-900/50 border border-indigo-500/50 px-2 py-1 rounded text-white">Ctrl + Z</span>
                            </div>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-amber-300 font-bold">{t.app.help.confirmPred}</span>
                                <span className="font-mono bg-amber-900/50 border border-amber-500/50 px-2 py-1 rounded text-white">Y</span>
                            </div>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">{t.app.help.toggleHelp}</span>
                                <span className="font-mono bg-slate-700 px-2 py-1 rounded text-white">Ctrl + H</span>
                            </div>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-300">{t.app.help.cancel}</span>
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
            modelOutputHandle={modelOutputHandle}
            onModelOutputHandleChange={handleModelOutputChange}
            t={t}
        />
      </div>
    </div>
  );
};

export default App;