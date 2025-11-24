import React, { useState, useRef, useEffect } from 'react';
import { YoloLabel, ImageAsset } from '../types';
import { getColor } from '../utils/yoloHelper';
import { RotateCcw } from 'lucide-react';

interface ImageViewerProps {
  image: ImageAsset;
  labels: YoloLabel[];
  currentLabelIndex: number;
  classes: string[];
  onSelectLabel: (index: number) => void;
  onUpdateLabel: (label: YoloLabel) => void;
}

// Added 'move' to the type
type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br' | 'move' | null;

export const ImageViewer: React.FC<ImageViewerProps> = ({
  image,
  labels,
  currentLabelIndex,
  classes,
  onSelectLabel,
  onUpdateLabel,
}) => {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [resizing, setResizing] = useState<ResizeHandle>(null);
  
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Refs for tracking drag deltas
  const startDrag = useRef<{
    mouseX: number;
    mouseY: number;
    transformX: number;
    transformY: number;
    label: YoloLabel;
  }>({ 
    mouseX: 0, 
    mouseY: 0, 
    transformX: 0,
    transformY: 0,
    label: { classId: 0, x: 0, y: 0, w: 0, h: 0 } 
  });

  // Reset zoom on image change
  useEffect(() => {
    setTransform({ scale: 1, x: 0, y: 0 });
  }, [image.url]);

  // Handle Wheel Zoom (Non-passive listener required to prevent browser zoom with Ctrl)
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        
        // Exponential zoom factor
        const s = Math.exp(-e.deltaY * 0.002);
        
        setTransform(prev => {
           // Constraints
           const newScale = Math.min(Math.max(0.1, prev.scale * s), 20);
           const ratio = newScale / prev.scale;

           // Zoom to mouse cursor logic
           const rect = viewport.getBoundingClientRect();
           // Mouse position relative to the center of the viewport
           const mouseX = e.clientX - rect.left - rect.width / 2;
           const mouseY = e.clientY - rect.top - rect.height / 2;

           // Calculate new translation to keep mouse point stable
           // new_tx = mx - (mx - old_tx) * ratio
           const newX = mouseX - (mouseX - prev.x) * ratio;
           const newY = mouseY - (mouseY - prev.y) * ratio;

           return { scale: newScale, x: newX, y: newY };
        });
      }
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Start Panning if left click (button 0) or middle click (button 1)
    // Only if not resizing
    if (!resizing && (e.button === 0 || e.button === 1)) {
        e.preventDefault(); // CRITICAL: Prevent default browser drag to ensure custom pan works
        setIsPanning(true);
        startDrag.current.mouseX = e.clientX;
        startDrag.current.mouseY = e.clientY;
        startDrag.current.transformX = transform.x;
        startDrag.current.transformY = transform.y;
    }
  };

  const startResize = (e: React.MouseEvent, handle: ResizeHandle, label: YoloLabel, idx: number) => {
    e.stopPropagation(); // Prevent panning
    e.preventDefault();
    onSelectLabel(idx); // Ensure selection when clicking border/corner
    setResizing(handle);
    startDrag.current = {
      ...startDrag.current,
      mouseX: e.clientX,
      mouseY: e.clientY,
      label: { ...label }
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // 1. Resizing/Moving Logic
      if (resizing && contentRef.current) {
        e.preventDefault();
        const { width: contentW, height: contentH } = contentRef.current.getBoundingClientRect();
        
        if (contentW === 0 || contentH === 0) return;

        const deltaX = (e.clientX - startDrag.current.mouseX) / contentW;
        const deltaY = (e.clientY - startDrag.current.mouseY) / contentH;

        const start = startDrag.current.label;
        
        // CASE: MOVING (Drag the whole box via borders)
        if (resizing === 'move') {
            const newX = Math.max(0, Math.min(1, start.x + deltaX));
            const newY = Math.max(0, Math.min(1, start.y + deltaY));
            onUpdateLabel({ ...start, x: newX, y: newY });
            return;
        }

        // CASE: RESIZING (Drag corners)
        // Calculate current box edges (normalized 0-1)
        const currentLeft = start.x - start.w / 2;
        const currentRight = start.x + start.w / 2;
        const currentTop = start.y - start.h / 2;
        const currentBottom = start.y + start.h / 2;

        let newLeft = currentLeft;
        let newRight = currentRight;
        let newTop = currentTop;
        let newBottom = currentBottom;

        if (resizing.includes('l')) newLeft += deltaX;
        if (resizing.includes('r')) newRight += deltaX;
        if (resizing.includes('t')) newTop += deltaY;
        if (resizing.includes('b')) newBottom += deltaY;

        // Constraints to prevent flipping
        if (newRight - newLeft < 0.005) {
            if (resizing.includes('l')) newLeft = newRight - 0.005; else newRight = newLeft + 0.005;
        }
        if (newBottom - newTop < 0.005) {
            if (resizing.includes('t')) newTop = newBottom - 0.005; else newBottom = newTop + 0.005;
        }

        const newW = newRight - newLeft;
        const newH = newBottom - newTop;
        const newX = newLeft + newW / 2;
        const newY = newTop + newH / 2;

        onUpdateLabel({ ...start, x: newX, y: newY, w: newW, h: newH });
        return;
      }

      // 2. Panning Logic
      if (isPanning) {
          e.preventDefault();
          const dx = e.clientX - startDrag.current.mouseX;
          const dy = e.clientY - startDrag.current.mouseY;
          setTransform(prev => ({
              ...prev,
              x: startDrag.current.transformX + dx,
              y: startDrag.current.transformY + dy
          }));
      }
    };

    const handleMouseUp = () => {
      setResizing(null);
      setIsPanning(false);
    };

    if (resizing || isPanning) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, isPanning, transform, onUpdateLabel]);

  return (
    <div 
      ref={viewportRef}
      onMouseDown={handleMouseDown}
      className={`flex-1 bg-slate-950 flex items-center justify-center overflow-hidden relative ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
    >
        {/* Reset View Button */}
        <div className="absolute top-4 right-4 z-50 flex flex-col gap-2">
            {(transform.scale !== 1 || transform.x !== 0 || transform.y !== 0) && (
                <button 
                    onClick={() => setTransform({scale: 1, x: 0, y: 0})} 
                    className="bg-slate-800/80 hover:bg-slate-700 text-white p-2 rounded shadow-lg backdrop-blur text-xs font-bold flex items-center gap-2 border border-slate-600 transition-all pointer-events-auto"
                >
                    <RotateCcw size={14} /> Reset View
                </button>
            )}
        </div>
        
        <div className="absolute bottom-4 left-4 z-50 text-slate-500 text-xs pointer-events-none select-none bg-black/20 p-1 rounded backdrop-blur-sm">
            Ctrl + Scroll to Zoom • Drag Empty Space to Pan • Drag Box Borders to Move
        </div>

      {/* Transformable Content Wrapper */}
      <div 
        ref={contentRef}
        className="relative shadow-2xl transition-transform duration-75 ease-out origin-center pointer-events-none"
        style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
        }}
      >
        <img
          src={image.url}
          alt="Workset"
          className="max-h-[85vh] max-w-full object-contain block select-none pointer-events-none"
          draggable={false}
        />
        
        {/* Overlay Layer */}
        <div className="absolute inset-0 pointer-events-none">
          {labels.map((label, idx) => {
            const isSelected = idx === currentLabelIndex;
            
            const left = (label.x - label.w / 2) * 100;
            const top = (label.y - label.h / 2) * 100;
            const width = label.w * 100;
            const height = label.h * 100;
            
            const color = getColor(label.classId);
            const borderColor = isSelected ? '#facc15' : color;
            const borderWidth = isSelected ? '3px' : '2px';
            const opacityClass = isSelected ? 'opacity-100 z-50' : 'opacity-70 hover:opacity-100 z-10 hover:z-40';

            return (
              <div
                key={idx}
                className={`absolute transition-opacity pointer-events-none ${opacityClass}`}
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${width}%`,
                  height: `${height}%`,
                  backgroundColor: isSelected ? 'rgba(250, 204, 21, 0.1)' : 'transparent',
                }}
              >
                {/* 
                  Constructing the Borders as separate interactive divs.
                  This allows clicks in the empty center to pass through to the image (for panning),
                  while clicks on the border trigger selection/moving.
                */}
                
                {/* Top Border */}
                <div 
                  onMouseDown={(e) => startResize(e, 'move', label, idx)}
                  className="absolute top-0 left-0 w-full cursor-move pointer-events-auto"
                  style={{ height: borderWidth, backgroundColor: borderColor, transform: 'translateY(-50%)' }}
                />
                
                {/* Bottom Border */}
                <div 
                  onMouseDown={(e) => startResize(e, 'move', label, idx)}
                  className="absolute bottom-0 left-0 w-full cursor-move pointer-events-auto"
                  style={{ height: borderWidth, backgroundColor: borderColor, transform: 'translateY(50%)' }}
                />
                
                {/* Left Border */}
                <div 
                  onMouseDown={(e) => startResize(e, 'move', label, idx)}
                  className="absolute top-0 left-0 h-full cursor-move pointer-events-auto"
                  style={{ width: borderWidth, backgroundColor: borderColor, transform: 'translateX(-50%)' }}
                />
                
                {/* Right Border */}
                <div 
                  onMouseDown={(e) => startResize(e, 'move', label, idx)}
                  className="absolute top-0 right-0 h-full cursor-move pointer-events-auto"
                  style={{ width: borderWidth, backgroundColor: borderColor, transform: 'translateX(50%)' }}
                />


                {/* Label Tag */}
                {(isSelected || width > 0) && (
                   <div 
                    className="absolute bottom-full left-0 mb-1 px-1.5 py-0.5 text-xs font-bold text-white whitespace-nowrap bg-black/75 rounded shadow-sm pointer-events-none transform origin-bottom-left"
                    style={{ 
                        borderLeft: `3px solid ${color}`,
                    }}
                   >
                     {classes[label.classId] || label.classId}
                   </div>
                )}

                {/* Resize Handles - Only visible when selected */}
                {isSelected && (
                  <>
                    <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-yellow-400 border border-black cursor-nwse-resize z-50 rounded-sm pointer-events-auto"
                         onMouseDown={(e) => startResize(e, 'tl', label, idx)} />
                    <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-yellow-400 border border-black cursor-nesw-resize z-50 rounded-sm pointer-events-auto"
                         onMouseDown={(e) => startResize(e, 'tr', label, idx)} />
                    <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-yellow-400 border border-black cursor-nesw-resize z-50 rounded-sm pointer-events-auto"
                         onMouseDown={(e) => startResize(e, 'bl', label, idx)} />
                    <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-yellow-400 border border-black cursor-nwse-resize z-50 rounded-sm pointer-events-auto"
                         onMouseDown={(e) => startResize(e, 'br', label, idx)} />
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