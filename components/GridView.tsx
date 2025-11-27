
import React, { useEffect, useState, useRef } from 'react';
import { ImageAsset, YoloLabel } from '../types';
import { parseYoloString, getColor } from '../utils/yoloHelper';
import { Maximize2, ChevronLeft, ChevronRight, Pause } from 'lucide-react';

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
}

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
  slideshowSettings
}) => {
  const itemsPerPage = rows * cols;
  const currentPage = Math.floor(currentIndex / itemsPerPage);
  const startIdx = currentPage * itemsPerPage;
  const visibleImages = images.slice(startIdx, startIdx + itemsPerPage);

  // Map to track which defect index is currently shown for each image
  const [activeLabelIndices, setActiveLabelIndices] = useState<Record<number, number>>({});
  // Track hovered cell index to pause slideshow
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Initialize active indices when page changes
  useEffect(() => {
    setActiveLabelIndices({});
  }, [currentPage]);

  // Slideshow Effect
  useEffect(() => {
    if (gridMode !== 'zoom' || !slideshowSettings.isPlaying) return;

    const intervalId = setInterval(() => {
      setActiveLabelIndices(prev => {
        const next = { ...prev };
        visibleImages.forEach((img, i) => {
           const globalIdx = startIdx + i;
           // Skip if this specific cell is hovered
           if (globalIdx === hoveredIndex) return;

           const key = img.name.replace(/\.[^/.]+$/, "");
           const saved = parseYoloString(labelsRaw.get(key) || "");
           const cached = predictionsCache.get(key) || [];
           const total = saved.length + cached.length;
           
           if (total > 1) {
             const current = prev[globalIdx] || 0;
             next[globalIdx] = (current + 1) % total;
           }
        });
        return next;
      });
    }, slideshowSettings.interval);

    return () => clearInterval(intervalId);
  }, [gridMode, slideshowSettings, visibleImages, startIdx, labelsRaw, predictionsCache, hoveredIndex]);


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

  // Helper to render a single thumbnail
  const renderThumbnail = (img: ImageAsset, relativeIdx: number) => {
    const globalIdx = startIdx + relativeIdx;
    const key = img.name.replace(/\.[^/.]+$/, "");
    
    // Merge Labels
    const rawContent = labelsRaw.get(key) || "";
    const savedLabels = parseYoloString(rawContent);
    const cachedPredictions = predictionsCache.get(key) || [];
    const allLabels = [...savedLabels, ...cachedPredictions];

    const isSelected = globalIdx === currentIndex;
    const activeLabelIdx = activeLabelIndices[globalIdx] || 0;
    const currentLabel = allLabels[activeLabelIdx];

    // ZOOM MODE RENDERER
    if (gridMode === 'zoom') {
        return (
            <div 
                key={globalIdx}
                onClick={() => onImageClick(globalIdx)}
                onMouseEnter={() => setHoveredIndex(globalIdx)}
                onMouseLeave={() => setHoveredIndex(null)}
                className={`relative bg-slate-900 border-2 rounded overflow-hidden cursor-pointer group transition-all ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/50' : 'border-slate-700 hover:border-slate-500'}`}
            >
                {allLabels.length > 0 ? (
                    <ZoomCell 
                        image={img}
                        label={currentLabel}
                        zoomSettings={zoomSettings}
                        className="w-full h-full"
                    />
                ) : (
                   // Fallback for no labels: Show full image scaled to fit
                   <img src={img.url} className="w-full h-full object-contain opacity-50" />
                )}

                {/* Info Overlay */}
                <div className="absolute top-0 left-0 right-0 bg-black/40 p-1 flex justify-between items-center z-20">
                    <span className="text-[10px] text-white font-mono bg-black/50 px-1 rounded truncate max-w-[70%]">{img.name}</span>
                     {allLabels.length > 0 && (
                         <span 
                            className="text-[10px] font-bold px-1.5 rounded"
                            style={{ 
                                backgroundColor: getColor(currentLabel.classId),
                                color: 'white',
                                textShadow: '0 1px 2px black'
                             }}
                         >
                             {classes[currentLabel.classId] || currentLabel.classId}
                         </span>
                     )}
                </div>
                
                {/* Slideshow Controls (Visible on Hover if > 1 label) */}
                {allLabels.length > 1 && hoveredIndex === globalIdx && (
                    <div className="absolute inset-x-0 bottom-0 top-6 flex items-center justify-between px-2 pointer-events-none">
                         <button 
                             onClick={(e) => handleManualNav(e, globalIdx, 'prev', allLabels.length)}
                             className="pointer-events-auto bg-black/50 hover:bg-indigo-600 text-white p-1 rounded-full backdrop-blur-sm transition-colors"
                         >
                             <ChevronLeft size={16} />
                         </button>
                         
                         {/* Play/Pause Indicator Center */}
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

                 {/* Counter */}
                 <div className="absolute bottom-1 right-1 text-[10px] bg-black/60 text-slate-300 px-1.5 py-0.5 rounded backdrop-blur-md">
                     {allLabels.length > 0 ? `${activeLabelIdx + 1}/${allLabels.length}` : '0'}
                 </div>
            </div>
        );
    }

    // NORMAL MODE RENDERER (Original)
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

                return (
                    <React.Fragment key={i}>
                        <div
                            className="absolute"
                            style={{
                                left: `${(label.x - label.w / 2) * 100}%`,
                                top: `${(label.y - label.h / 2) * 100}%`,
                                width: `${label.w * 100}%`,
                                height: `${label.h * 100}%`,
                                borderColor: color,
                                borderStyle: borderStyle,
                                borderWidth: '3px',
                                opacity: opacity,
                                boxShadow: label.isPredicted ? `0 0 6px ${color}` : 'none'
                            }}
                        />
                         <div 
                            className="absolute text-[10px] font-bold px-1 py-0.5 rounded-sm truncate max-w-full"
                            style={{
                                left: `${(label.x - label.w / 2) * 100}%`,
                                top: `${((label.y - label.h / 2) * 100) - 15}%`,
                                backgroundColor: color,
                                color: 'white',
                                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                                transform: 'translateY(-50%)',
                                zIndex: 10
                            }}
                        >
                            {className} {label.confidence ? `${Math.round(label.confidence * 100)}%` : ''}
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
            Page {currentPage + 1} of {Math.ceil(images.length / itemsPerPage)} ({startIdx + 1} - {Math.min(startIdx + itemsPerPage, images.length)})
        </div>
    </div>
  );
};

// --- Helper Component: ZoomCell ---
// Encapsulates Canvas logic to prevent heavy re-renders on the parent list
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
        
        // Similar crop logic to DetailPanel
        const imgW = imgElement.naturalWidth;
        const imgH = imgElement.naturalHeight;
        
        const expansionFactor = 1.1 + (zoomSettings.context / 100) * 4.0; 
        const cropW = label.w * expansionFactor;
        const cropH = label.h * expansionFactor;
        
        // Boundaries
        const cLeft = Math.max(0, label.x - cropW / 2);
        const cTop = Math.max(0, label.y - cropH / 2);
        const cRight = Math.min(1, label.x + cropW / 2);
        const cBottom = Math.min(1, label.y + cropH / 2);
        
        // Pixels
        const pxLeft = cLeft * imgW;
        const pxTop = cTop * imgH;
        const pxWidth = (cRight - cLeft) * imgW;
        const pxHeight = (cBottom - cTop) * imgH;
        
        canvasRef.current.width = Math.max(1, pxWidth);
        canvasRef.current.height = Math.max(1, pxHeight);
        
        ctx.clearRect(0, 0, pxWidth, pxHeight);
        ctx.drawImage(imgElement, pxLeft, pxTop, pxWidth, pxHeight, 0, 0, pxWidth, pxHeight);

        // Draw Box
        const boxX = (label.x * imgW) - (label.w * imgW) / 2 - pxLeft;
        const boxY = (label.y * imgH) - (label.h * imgH) / 2 - pxTop;
        const boxW = label.w * imgW;
        const boxH = label.h * imgH;

        ctx.strokeStyle = getColor(label.classId);
        ctx.lineWidth = Math.max(2, Math.min(pxWidth, pxHeight) / 50); 
        if (label.isPredicted) ctx.setLineDash([5, 5]);
        else ctx.setLineDash([]);
        ctx.strokeRect(boxX, boxY, boxW, boxH);

    }, [label, imgElement, zoomSettings]);

    return (
        <div className={`${className} flex items-center justify-center bg-black overflow-hidden`}>
            <canvas 
                ref={canvasRef} 
                className="max-w-full max-h-full object-contain"
                style={{ 
                    imageRendering: 'pixelated',
                    transform: `scale(${zoomSettings.mag})`
                }} 
            />
        </div>
    );
};
