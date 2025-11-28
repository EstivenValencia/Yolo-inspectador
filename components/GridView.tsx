import React, { useEffect, useState, useRef, useMemo } from 'react';
import { ImageAsset, YoloLabel } from '../types';
import { parseYoloString, getColor, getLabelHash } from '../utils/yoloHelper';
import { Maximize2, ChevronLeft, ChevronRight, Pause, CheckCircle } from 'lucide-react';

interface GridViewProps {
  images: ImageAsset[];
  currentIndex: number;
  rows: number;
  cols: number;
  labelsRaw: Map<string, string>;
  predictionsCache: Map<string, YoloLabel[]>;
  classes: string[];
  onImageClick: (index: number) => void;
  filterClassId: number;
  // New Props
  gridMode: 'normal' | 'zoom';
  zoomSettings: { context: number, mag: number };
  slideshowSettings: { interval: number, isPlaying: boolean };
  showModelLabels?: boolean;
  labelsVisible?: boolean;
  reviewedLabels: Set<string>; // Set of "filename:hash"
  t: any;
}

// Helper Component: ZoomCell
const ZoomCell: React.FC<{
    image: ImageAsset, 
    label: YoloLabel, 
    zoomSettings: { context: number, mag: number },
    className?: string
}> = ({ image, label, zoomSettings, className }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);

    useEffect(() => {
        const img = new Image();
        img.src = image.url;
        img.onload = () => setImgElement(img);
    }, [image.url]);

    useEffect(() => {
        if (!label || !imgElement || !canvasRef.current) return;
        
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        
        const imgW = imgElement.naturalWidth;
        const imgH = imgElement.naturalHeight;
        
        // --- SMART ZOOM LOGIC ---
        // 1. Calculate the bounding box of the label + context in image coordinates (0-1)
        // context is % padding added to the label's size.
        const contextFactor = 1 + (zoomSettings.context / 100);
        
        let roiW = label.w * contextFactor;
        let roiH = label.h * contextFactor;

        // 2. We want to fit this ROI into a square (1:1) canvas (or the shape of the grid cell).
        // To fill the square without stretching, we need to extend the ROI to be square.
        // If the defect is wide, we increase height. If tall, we increase width.
        // This ensures the defect is fully visible and centered.
        
        if (roiW > roiH) {
            roiH = roiW; // Make it square based on width
        } else {
            roiW = roiH; // Make it square based on height
        }
        
        // 3. Convert normalized ROI to pixels
        let pxW = roiW * imgW;
        let pxH = roiH * imgH;
        
        // 4. Center the ROI on the label
        let pxX = (label.x * imgW) - (pxW / 2);
        let pxY = (label.y * imgH) - (pxH / 2);

        // 5. Draw
        // Set canvas resolution high enough for crisp rendering
        const canvasSize = 300; 
        canvasRef.current.width = canvasSize;
        canvasRef.current.height = canvasSize;
        
        // Clear background (optional, but good for transparency)
        ctx.fillStyle = '#0f172a'; // Slate-900 background
        ctx.fillRect(0,0, canvasSize, canvasSize);

        // Draw the image slice. 
        // drawImage handles clipping if source coords are outside the image naturally.
        ctx.drawImage(
            imgElement, 
            pxX, pxY, pxW, pxH,  // Source: The calculated square ROI
            0, 0, canvasSize, canvasSize // Dest: The whole canvas
        );

        // 6. Draw the Bounding Box
        // We need to map the label's original coordinates into our new canvas space
        // The ROI (pxX, pxY, pxW, pxH) maps to (0, 0, canvasSize, canvasSize)
        
        const labelPxX = (label.x * imgW); // Center X in Image Px
        const labelPxY = (label.y * imgH); // Center Y in Image Px
        const labelPxW = (label.w * imgW);
        const labelPxH = (label.h * imgH);

        // Relative to ROI Top-Left
        const relX = labelPxX - pxX;
        const relY = labelPxY - pxY;

        // Scale factor from ROI Px to Canvas Px
        const scaleX = canvasSize / pxW;
        const scaleY = canvasSize / pxH;

        const drawX = (relX - labelPxW/2) * scaleX;
        const drawY = (relY - labelPxH/2) * scaleY;
        const drawW = labelPxW * scaleX;
        const drawH = labelPxH * scaleY;

        ctx.strokeStyle = getColor(label.classId);
        ctx.lineWidth = 3; 
        
        if (label.isPredicted) ctx.setLineDash([6, 6]);
        else ctx.setLineDash([]);
        
        ctx.strokeRect(drawX, drawY, drawW, drawH);

    }, [label, imgElement, zoomSettings]);

    return (
        <div className={`${className} flex items-center justify-center bg-black overflow-hidden relative`}>
             {/* Scale Transform for manual magnification on top of the auto-fit */}
            <canvas 
                ref={canvasRef} 
                className="w-full h-full object-contain"
                style={{ 
                    imageRendering: 'pixelated',
                    transform: `scale(${zoomSettings.mag})`,
                    transformOrigin: 'center center'
                }} 
            />
        </div>
    );
};

export const GridView: React.FC<GridViewProps> = ({
  images,
  currentIndex,
  rows,
  cols,
  labelsRaw,
  predictionsCache,
  classes,
  onImageClick,
  filterClassId,
  gridMode,
  zoomSettings,
  slideshowSettings,
  showModelLabels = true,
  labelsVisible = true,
  reviewedLabels,
  t
}) => {
  const itemsPerPage = rows * cols;
  const currentPage = Math.floor(currentIndex / itemsPerPage);
  const startIdx = currentPage * itemsPerPage;
  
  const visibleImages = useMemo(() => images.slice(startIdx, startIdx + itemsPerPage), [images, startIdx, itemsPerPage]);

  const [activeLabelIndices, setActiveLabelIndices] = useState<Record<number, number>>({});
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    setActiveLabelIndices({});
  }, [currentPage]);

  const getRelevantLabels = (img: ImageAsset) => {
      const key = img.name.replace(/\.[^/.]+$/, "");
      const rawContent = labelsRaw.get(key) || "";
      let savedLabels = labelsVisible ? parseYoloString(rawContent) : [];
      let cachedPredictions = showModelLabels ? (predictionsCache.get(key) || []) : [];
      return [...savedLabels, ...cachedPredictions];
  };

  useEffect(() => {
    if (gridMode !== 'zoom' || !slideshowSettings.isPlaying) return;

    const intervalId = setInterval(() => {
      setActiveLabelIndices(prev => {
        const next = { ...prev };
        visibleImages.forEach((img, i) => {
           const globalIdx = startIdx + i;
           if (globalIdx === hoveredIndex) return; 

           const allLabels = getRelevantLabels(img);
           const total = allLabels.length;
           
           if (total > 1) {
             const current = prev[globalIdx] || 0;
             next[globalIdx] = (current + 1) % total;
           }
        });
        return next;
      });
    }, slideshowSettings.interval);

    return () => clearInterval(intervalId);
  }, [gridMode, slideshowSettings, visibleImages, startIdx, labelsRaw, predictionsCache, hoveredIndex, labelsVisible, showModelLabels]);


  const handleManualNav = (e: React.MouseEvent, globalIdx: number, direction: 'prev' | 'next', totalLabels: number) => {
      e.stopPropagation();
      setActiveLabelIndices(prev => {
          const current = prev[globalIdx] || 0;
          let next = current;
          if (direction === 'next') next = (current + 1) % totalLabels;
          else next = (current - 1 + totalLabels) % totalLabels;
          return { ...prev, [globalIdx]: next };
      });
  };

  const renderThumbnail = (img: ImageAsset, relativeIdx: number) => {
    const globalIdx = startIdx + relativeIdx;
    
    const allLabels = getRelevantLabels(img);
    const imgKey = img.name.replace(/\.[^/.]+$/, "");

    const isSelected = globalIdx === currentIndex;
    const activeLabelIdx = activeLabelIndices[globalIdx] || 0;
    const safeLabelIdx = activeLabelIdx < allLabels.length ? activeLabelIdx : 0;
    const currentLabel = allLabels[safeLabelIdx];

    // Check review status
    const isReviewed = currentLabel ? reviewedLabels.has(`${imgKey}:${getLabelHash(currentLabel)}`) : false;

    if (gridMode === 'zoom') {
        const labelText = currentLabel 
            ? `${currentLabel.isPredicted ? 'M-' : ''}${classes[currentLabel.classId] || currentLabel.classId}` 
            : '';

        // Border color based on review status
        const borderColor = isReviewed ? 'border-emerald-500' : (isSelected ? 'border-indigo-500' : 'border-slate-700');
        const borderRing = isReviewed ? 'ring-2 ring-emerald-500/50' : (isSelected ? 'ring-2 ring-indigo-500/50' : '');

        return (
            <div 
                key={globalIdx}
                onClick={() => onImageClick(globalIdx)}
                onMouseEnter={() => setHoveredIndex(globalIdx)}
                onMouseLeave={() => setHoveredIndex(null)}
                className={`relative bg-slate-900 border-4 rounded-lg overflow-hidden cursor-pointer group transition-all ${borderColor} ${borderRing}`}
            >
                {currentLabel ? (
                    <ZoomCell 
                        image={img}
                        label={currentLabel}
                        zoomSettings={zoomSettings}
                        className="w-full h-full"
                    />
                ) : (
                   <div className="w-full h-full flex items-center justify-center bg-slate-950">
                        <img src={img.url} className="w-full h-full object-contain opacity-30" />
                   </div>
                )}

                <div className="absolute top-0 left-0 right-0 bg-black/40 p-1 flex justify-between items-start z-20 pointer-events-none">
                     <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-white font-mono bg-black/50 px-1 rounded truncate max-w-[80px]">{img.name}</span>
                        {currentLabel && (
                            <span 
                                className="text-xs font-bold px-2 py-0.5 rounded self-start"
                                style={{ 
                                    backgroundColor: getColor(currentLabel.classId),
                                    color: 'white',
                                    textShadow: '0 1px 2px black'
                                }}
                            >
                                {labelText}
                            </span>
                        )}
                     </div>
                     {isReviewed && <CheckCircle size={16} className="text-emerald-400 bg-black/50 rounded-full" />}
                </div>
                
                {allLabels.length > 1 && hoveredIndex === globalIdx && (
                    <div className="absolute inset-x-0 bottom-0 top-6 flex items-center justify-between px-2 pointer-events-none">
                         <button 
                             onClick={(e) => handleManualNav(e, globalIdx, 'prev', allLabels.length)}
                             className="pointer-events-auto bg-black/50 hover:bg-indigo-600 text-white p-1 rounded-full backdrop-blur-sm transition-colors"
                         >
                             <ChevronLeft size={16} />
                         </button>
                         <div className="bg-black/40 p-1.5 rounded-full backdrop-blur-sm">
                             <Pause size={12} className="text-white" />
                         </div>
                         <button 
                             onClick={(e) => handleManualNav(e, globalIdx, 'next', allLabels.length)}
                             className="pointer-events-auto bg-black/50 hover:bg-indigo-600 text-white p-1 rounded-full backdrop-blur-sm transition-colors"
                         >
                             <ChevronRight size={16} />
                         </button>
                    </div>
                )}

                 <div className="absolute bottom-1 right-1 text-[10px] bg-black/60 text-slate-300 px-1.5 py-0.5 rounded backdrop-blur-md">
                     {allLabels.length > 0 ? `${safeLabelIdx + 1}/${allLabels.length}` : '0'}
                 </div>
            </div>
        );
    }

    // NORMAL MODE
    return (
      <div 
        key={globalIdx}
        onClick={() => onImageClick(globalIdx)}
        className={`relative bg-slate-900 border-2 rounded overflow-hidden cursor-pointer group transition-all hover:scale-[1.02] hover:z-10 hover:shadow-xl ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/50' : 'border-slate-700 hover:border-slate-500'}`}
      >
        <img 
            src={img.url} 
            alt={img.name}
            className="w-full h-full object-contain"
            loading="lazy"
        />

        <div className="absolute inset-0 pointer-events-none">
            {allLabels.map((label, i) => {
                const color = getColor(label.classId);
                const borderStyle = label.isPredicted ? 'dotted' : 'solid';
                const opacity = label.isPredicted ? 0.8 : 0.9;
                const className = classes[label.classId] || String(label.classId);
                const displayName = label.isPredicted ? `M-${className}` : className;
                const labelReviewed = reviewedLabels.has(`${imgKey}:${getLabelHash(label)}`);

                return (
                    <React.Fragment key={i}>
                        <div
                            className="absolute"
                            style={{
                                left: `${(label.x - label.w / 2) * 100}%`,
                                top: `${(label.y - label.h / 2) * 100}%`,
                                width: `${label.w * 100}%`,
                                height: `${label.h * 100}%`,
                                borderColor: labelReviewed ? '#34d399' : color, // Emerald if reviewed
                                borderStyle: borderStyle,
                                borderWidth: labelReviewed ? '4px' : '3px',
                                opacity: opacity,
                                boxShadow: label.isPredicted ? `0 0 6px ${color}` : 'none'
                            }}
                        />
                         <div 
                            className="absolute text-[10px] font-bold px-1 py-0.5 rounded-sm truncate max-w-full flex items-center gap-1"
                            style={{
                                left: `${(label.x - label.w / 2) * 100}%`,
                                top: `${((label.y - label.h / 2) * 100) - 15}%`,
                                backgroundColor: labelReviewed ? '#065f46' : color,
                                color: 'white',
                                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                                transform: 'translateY(-50%)',
                                zIndex: 10
                            }}
                        >
                            {labelReviewed && <CheckCircle size={8} />}
                            {displayName} {label.confidence ? `${Math.round(label.confidence * 100)}%` : ''}
                        </div>
                    </React.Fragment>
                );
            })}
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex justify-between items-center z-20">
            <span className="text-[10px] text-white truncate max-w-[70%]">{img.name}</span>
            <span className="text-[10px] text-slate-300 bg-slate-800 px-1 rounded">{allLabels.length}</span>
        </div>
        
        {isSelected && (
            <div className="absolute top-1 right-1 bg-indigo-600 text-white p-1 rounded-full shadow z-20">
                <Maximize2 size={10} />
            </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-slate-950">
        <div 
            className="grid gap-2 w-full h-full content-start"
            style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridAutoRows: `minmax(0, 1fr)` 
            }}
        >
            {visibleImages.map((img, i) => renderThumbnail(img, i))}
            
            {Array.from({ length: itemsPerPage - visibleImages.length }).map((_, i) => (
                <div key={`empty-${i}`} className="bg-slate-900/30 rounded border border-slate-800/50 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-slate-800"></div>
                </div>
            ))}
        </div>
        
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-800/90 border border-slate-600 px-4 py-2 rounded-full shadow-xl text-xs text-slate-300 pointer-events-none z-30">
            {t.app.page} {currentPage + 1} / {Math.ceil(images.length / itemsPerPage)} ({startIdx + 1} - {Math.min(startIdx + itemsPerPage, images.length)})
        </div>
    </div>
  );
};