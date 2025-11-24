import React, { useState, useRef, useEffect } from 'react';
import { YoloLabel, ImageAsset } from '../types';
import { getColor } from '../utils/yoloHelper';

interface ImageViewerProps {
  image: ImageAsset;
  labels: YoloLabel[];
  currentLabelIndex: number;
  classes: string[];
  onSelectLabel: (index: number) => void;
  onUpdateLabel: (label: YoloLabel) => void;
}

type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br' | null;

export const ImageViewer: React.FC<ImageViewerProps> = ({
  image,
  labels,
  currentLabelIndex,
  classes,
  onSelectLabel,
  onUpdateLabel,
}) => {
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState<ResizeHandle>(null);
  
  // Ref to track start drag positions without re-rendering
  const dragStart = useRef<{
    mouseX: number;
    mouseY: number;
    label: YoloLabel;
  }>({ 
    mouseX: 0, 
    mouseY: 0, 
    label: { classId: 0, x: 0, y: 0, w: 0, h: 0 } 
  });

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setDimensions({ w: naturalWidth, h: naturalHeight });
  };

  const startResize = (e: React.MouseEvent, handle: ResizeHandle, label: YoloLabel) => {
    e.stopPropagation();
    e.preventDefault();
    setResizing(handle);
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      label: { ...label }
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizing || !containerRef.current) return;
      
      const { width: containerW, height: containerH } = containerRef.current.getBoundingClientRect();
      if (containerW === 0 || containerH === 0) return;

      const deltaX = (e.clientX - dragStart.current.mouseX) / containerW;
      const deltaY = (e.clientY - dragStart.current.mouseY) / containerH;

      const start = dragStart.current.label;
      
      // Calculate current box edges (normalized 0-1)
      const currentLeft = start.x - start.w / 2;
      const currentRight = start.x + start.w / 2;
      const currentTop = start.y - start.h / 2;
      const currentBottom = start.y + start.h / 2;

      let newLeft = currentLeft;
      let newRight = currentRight;
      let newTop = currentTop;
      let newBottom = currentBottom;

      // Apply deltas based on handle
      if (resizing.includes('l')) newLeft += deltaX;
      if (resizing.includes('r')) newRight += deltaX;
      if (resizing.includes('t')) newTop += deltaY;
      if (resizing.includes('b')) newBottom += deltaY;

      // Ensure min size (very small, e.g. 0.005) and bounds (0-1)
      if (newRight - newLeft < 0.005) {
         if (resizing.includes('l')) newLeft = newRight - 0.005;
         else newRight = newLeft + 0.005;
      }
      if (newBottom - newTop < 0.005) {
         if (resizing.includes('t')) newTop = newBottom - 0.005;
         else newBottom = newTop + 0.005;
      }

      // Re-calculate center and size
      const newW = newRight - newLeft;
      const newH = newBottom - newTop;
      const newX = newLeft + newW / 2;
      const newY = newTop + newH / 2;

      onUpdateLabel({
        ...start,
        x: newX,
        y: newY,
        w: newW,
        h: newH
      });
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    if (resizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, onUpdateLabel]);

  return (
    <div className="flex-1 bg-slate-950 flex items-center justify-center overflow-auto p-8 relative">
       {/* Container restricts max size */}
      <div className="relative max-w-full max-h-full shadow-2xl" ref={containerRef}>
        <img
          src={image.url}
          alt="Workset"
          className="max-h-[85vh] max-w-full object-contain block select-none pointer-events-none"
          onLoad={handleImageLoad}
        />
        
        {/* Overlay Layer */}
        <div className="absolute inset-0">
          {labels.map((label, idx) => {
            const isSelected = idx === currentLabelIndex;
            
            // Percentage based positioning
            const left = (label.x - label.w / 2) * 100;
            const top = (label.y - label.h / 2) * 100;
            const width = label.w * 100;
            const height = label.h * 100;
            
            const color = getColor(label.classId);

            return (
              <div
                key={idx}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onSelectLabel(idx);
                }}
                className={`absolute border-2 transition-opacity ${isSelected ? 'z-50 cursor-move' : 'z-10 opacity-70 hover:opacity-100 hover:z-40 cursor-pointer'}`}
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${width}%`,
                  height: `${height}%`,
                  borderColor: isSelected ? '#facc15' : color,
                  boxShadow: isSelected ? '0 0 0 2px rgba(250, 204, 21, 0.4)' : 'none',
                  backgroundColor: isSelected ? 'rgba(250, 204, 21, 0.1)' : 'transparent',
                }}
              >
                {/* Full Label Tag - Moved OUTSIDE the box to prevent clipping on small boxes */}
                {(isSelected || width > 0) && (
                   <div 
                    className="absolute bottom-full left-0 mb-1 px-1.5 py-0.5 text-xs font-bold text-white whitespace-nowrap bg-black/75 rounded shadow-sm pointer-events-none"
                    style={{ borderLeft: `3px solid ${color}` }}
                   >
                     {classes[label.classId] || label.classId}
                   </div>
                )}

                {/* Resize Handles (Only when selected) */}
                {isSelected && (
                  <>
                    <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-yellow-400 border border-black cursor-nwse-resize z-50 rounded-sm"
                         onMouseDown={(e) => startResize(e, 'tl', label)} />
                    <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-yellow-400 border border-black cursor-nesw-resize z-50 rounded-sm"
                         onMouseDown={(e) => startResize(e, 'tr', label)} />
                    <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-yellow-400 border border-black cursor-nesw-resize z-50 rounded-sm"
                         onMouseDown={(e) => startResize(e, 'bl', label)} />
                    <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-yellow-400 border border-black cursor-nwse-resize z-50 rounded-sm"
                         onMouseDown={(e) => startResize(e, 'br', label)} />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};