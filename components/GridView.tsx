import React from 'react';
import { ImageAsset, YoloLabel } from '../types';
import { parseYoloString, getColor } from '../utils/yoloHelper';
import { Maximize2 } from 'lucide-react';

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
  filterClassId
}) => {
  const itemsPerPage = rows * cols;
  const currentPage = Math.floor(currentIndex / itemsPerPage);
  const startIdx = currentPage * itemsPerPage;
  const visibleImages = images.slice(startIdx, startIdx + itemsPerPage);

  // Helper to render a single thumbnail
  const renderThumbnail = (img: ImageAsset, relativeIdx: number) => {
    const globalIdx = startIdx + relativeIdx;
    const key = img.name.replace(/\.[^/.]+$/, "");
    
    // 1. Get Saved Labels
    const rawContent = labelsRaw.get(key) || "";
    const savedLabels = parseYoloString(rawContent);

    // 2. Get Cached Predictions
    const cachedPredictions = predictionsCache.get(key) || [];
    
    // 3. Merge
    const allLabels = [...savedLabels, ...cachedPredictions];

    const isSelected = globalIdx === currentIndex;

    return (
      <div 
        key={globalIdx}
        onClick={() => onImageClick(globalIdx)}
        className={`relative bg-slate-900 border-2 rounded overflow-hidden cursor-pointer group transition-all hover:scale-[1.02] hover:z-10 hover:shadow-xl ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/50' : 'border-slate-700 hover:border-slate-500'}`}
      >
        {/* Image */}
        <img 
            src={img.url} 
            alt={img.name}
            className="w-full h-full object-contain"
            loading="lazy"
        />

        {/* Overlay Labels */}
        <div className="absolute inset-0 pointer-events-none">
            {allLabels.map((label, i) => {
                // If filtering is active, dim non-matching labels or hide them? 
                // Let's keep them visible but maybe highlight matching ones if needed.
                // For now, standard rendering.
                
                const color = getColor(label.classId);
                const borderStyle = label.isPredicted ? 'dotted' : 'solid';
                const opacity = label.isPredicted ? 0.7 : 0.9;

                return (
                    <div
                        key={i}
                        className="absolute border"
                        style={{
                            left: `${(label.x - label.w / 2) * 100}%`,
                            top: `${(label.y - label.h / 2) * 100}%`,
                            width: `${label.w * 100}%`,
                            height: `${label.h * 100}%`,
                            borderColor: color,
                            borderStyle: borderStyle,
                            borderWidth: '1px',
                            opacity: opacity
                        }}
                    />
                );
            })}
        </div>

        {/* Info Bar (On Hover) */}
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex justify-between items-center">
            <span className="text-[10px] text-white truncate max-w-[70%]">{img.name}</span>
            <span className="text-[10px] text-slate-300 bg-slate-800 px-1 rounded">{allLabels.length}</span>
        </div>
        
        {/* Selection Indicator */}
        {isSelected && (
            <div className="absolute top-1 right-1 bg-indigo-600 text-white p-1 rounded-full shadow">
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
                gridAutoRows: `minmax(0, 1fr)` // This might need adjustment based on aspect ratio preference
            }}
        >
            {visibleImages.map((img, i) => renderThumbnail(img, i))}
            
            {/* Fill empty spots if last page is incomplete */}
            {Array.from({ length: itemsPerPage - visibleImages.length }).map((_, i) => (
                <div key={`empty-${i}`} className="bg-slate-900/30 rounded border border-slate-800/50 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-slate-800"></div>
                </div>
            ))}
        </div>
        
        {/* Simple Pagination Indicator */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-800/90 border border-slate-600 px-4 py-2 rounded-full shadow-xl text-xs text-slate-300 pointer-events-none">
            Page {currentPage + 1} of {Math.ceil(images.length / itemsPerPage)} ({startIdx + 1} - {Math.min(startIdx + itemsPerPage, images.length)})
        </div>
    </div>
  );
};