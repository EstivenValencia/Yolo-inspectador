import React, { useState, useRef, useEffect } from 'react';
import { YoloLabel, ImageAsset } from '../types';
import { getColor } from '../utils/yoloHelper';
import { RotateCcw } from 'lucide-react';

interface ImageViewerProps {
  image: ImageAsset;
  labels: YoloLabel[];
  currentLabelIndex: number;
  classes: string[];
  isCreating?: boolean;
  showBoxFill?: boolean; // New prop for fill mode
  pendingLabelIndex?: number | null; // New prop for pending state
  onSelectLabel: (index: number) => void;
  onUpdateLabel: (label: YoloLabel, index?: number) => void;
  onCreateLabel?: (label: YoloLabel) => void;
}

type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br' | 'move' | null;

export const ImageViewer: React.FC<ImageViewerProps> = ({
  image,
  labels,
  currentLabelIndex,
  classes,
  isCreating = false,
  showBoxFill = false,
  pendingLabelIndex = null,
  onSelectLabel,
  onUpdateLabel,
  onCreateLabel,
}) => {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [resizing, setResizing] = useState<ResizeHandle>(null);
  
  // Creation State
  const [creationStart, setCreationStart] = useState<{x: number, y: number} | null>(null);
  const [ghostBox, setGhostBox] = useState<{x: number, y: number, w: number, h: number} | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Refs for tracking drag deltas
  const startDrag = useRef<{
    mouseX: number;
    mouseY: number;
    transformX: number;
    transformY: number;
    label: YoloLabel;
    index: number;
  }>({ 
    mouseX: 0, 
    mouseY: 0, 
    transformX: 0,
    transformY: 0,
    label: { classId: 0, x: 0, y: 0, w: 0, h: 0 },
    index: -1 
  });

  // Helper to force focus to this component
  const focusViewer = () => {
    if (viewportRef.current) {
      viewportRef.current.focus();
    }
  };

  // Reset zoom on image change
  useEffect(() => {
    setTransform({ scale: 1, x: 0, y: 0 });
    setCreationStart(null);
    setGhostBox(null);
  }, [image.url]);

  // Handle Wheel Zoom (Non-passive listener required to prevent browser zoom with Ctrl)
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (e: WheelEvent) => {
      // Check for Ctrl key (standard for zoom)
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation(); 
        
        // Normalize deltaY across browsers
        let delta = e.deltaY;
        if (e.deltaMode === 1) { // DOM_DELTA_LINE
            delta *= 33;
        } else if (e.deltaMode === 2) { // DOM_DELTA_PAGE
            delta *= 800; 
        }

        // Exponential zoom factor - adjusted sensitivity
        const s = Math.exp(-delta * 0.0015);
        
        setTransform(prev => {
           // Constraints
           const newScale = Math.min(Math.max(0.1, prev.scale * s), 50); // Increased max zoom
           const ratio = newScale / prev.scale;

           // Zoom to mouse cursor logic
           const rect = viewport.getBoundingClientRect();
           const mouseX = e.clientX - rect.left - rect.width / 2;
           const mouseY = e.clientY - rect.top - rect.height / 2;

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
    // Force focus to main window to enable shortcuts
    focusViewer();

    // 1. CREATION LOGIC
    if (isCreating && contentRef.current) {
        e.preventDefault();
        e.stopPropagation();
        
        const rect = contentRef.current.getBoundingClientRect();
        // Normalized coordinates (0-1) relative to the image content
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        
        setCreationStart({ x, y });
        setGhostBox({ x, y, w: 0, h: 0 });
        return;
    }

    // 2. PANNING LOGIC
    // Only start pan if not resizing and not creating
    if (!resizing && (e.button === 0 || e.button === 1)) {
        e.preventDefault(); 
        setIsPanning(true);
        // Deselect current label if clicking on empty space
        onSelectLabel(-1);
        
        startDrag.current.mouseX = e.clientX;
        startDrag.current.mouseY = e.clientY;
        startDrag.current.transformX = transform.x;
        startDrag.current.transformY = transform.y;
    }
  };

  const startResize = (e: React.MouseEvent, handle: ResizeHandle, label: YoloLabel, idx: number) => {
    focusViewer(); // Ensure focus when clicking a box too
    
    if (isCreating) return; // Disable selection/resize while creating
    e.stopPropagation(); // Prevent panning
    e.preventDefault();
    onSelectLabel(idx); // Ensure selection when clicking border/corner
    setResizing(handle);
    startDrag.current = {
      ...startDrag.current,
      mouseX: e.clientX,
      mouseY: e.clientY,
      label: { ...label },
      index: idx // IMPORTANT: Track the index explicitly to avoid race conditions
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // 1. CREATION DRAG
      if (isCreating && creationStart && contentRef.current) {
          e.preventDefault();
          const rect = contentRef.current.getBoundingClientRect();
          const currentX = (e.clientX - rect.left) / rect.width;
          const currentY = (e.clientY - rect.top) / rect.height;

          // Calculate Top-Left and W/H based on start point and current point
          const minX = Math.min(creationStart.x, currentX);
          const minY = Math.min(creationStart.y, currentY);
          const w = Math.abs(currentX - creationStart.x);
          const h = Math.abs(currentY - creationStart.y);

          setGhostBox({ x: minX, y: minY, w, h });
          return;
      }

      // 2. RESIZING
      if (resizing && contentRef.current) {
        e.preventDefault();
        const { width: contentW, height: contentH } = contentRef.current.getBoundingClientRect();
        
        if (contentW === 0 || contentH === 0) return;

        const deltaX = (e.clientX - startDrag.current.mouseX) / contentW;
        const deltaY = (e.clientY - startDrag.current.mouseY) / contentH;

        const start = startDrag.current.label;
        const idx = startDrag.current.index;
        
        // CASE: MOVING (Drag the whole box via borders)
        if (resizing === 'move') {
            const newX = Math.max(0, Math.min(1, start.x + deltaX));
            const newY = Math.max(0, Math.min(1, start.y + deltaY));
            onUpdateLabel({ ...start, x: newX, y: newY }, idx);
            return;
        }

        // CASE: RESIZING (Drag corners)
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

        // Constraints
        if (newRight - newLeft < 0.001) {
             if (resizing.includes('l')) newLeft = newRight - 0.001; else newRight = newLeft + 0.001;
        }
        if (newBottom - newTop < 0.001) {
             if (resizing.includes('t')) newTop = newBottom - 0.001; else newBottom = newTop + 0.001;
        }

        const newW = newRight - newLeft;
        const newH = newBottom - newTop;
        const newX = newLeft + newW / 2;
        const newY = newTop + newH / 2;

        onUpdateLabel({ ...start, x: newX, y: newY, w: newW, h: newH }, idx);
        return;
      }

      // 3. PANNING
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
      // 1. FINISH CREATION
      if (isCreating && creationStart && ghostBox && onCreateLabel) {
          // Convert Top-Left/W/H to YOLO CenterX/CenterY/W/H
          const centerX = ghostBox.x + ghostBox.w / 2;
          const centerY = ghostBox.y + ghostBox.h / 2;
          
          // Only create if it has some size
          if (ghostBox.w > 0.001 && ghostBox.h > 0.001) {
              onCreateLabel({
                  classId: 0, // App will set the default class
                  x: centerX,
                  y: centerY,
                  w: ghostBox.w,
                  h: ghostBox.h
              });
          }
          setCreationStart(null);
          setGhostBox(null);
      }

      setResizing(null);
      setIsPanning(false);
    };

    if (resizing || isPanning || isCreating) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, isPanning, transform, onUpdateLabel, isCreating, creationStart, ghostBox, onCreateLabel]);

  return (
    <div 
      ref={viewportRef}
      onMouseDown={handleMouseDown}
      tabIndex={-1} // Allow div to receive focus
      className={`flex-1 bg-slate-950 flex items-center justify-center overflow-hidden relative outline-none ${isCreating ? 'cursor-crosshair' : (isPanning ? 'cursor-grabbing' : 'cursor-grab')}`}
    >
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
        
        {isCreating && (
             <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-lg font-bold border border-white/20 animate-pulse pointer-events-none">
                CREATE MODE (Draw a box)
             </div>
        )}
        
        <div className="absolute bottom-4 left-4 z-50 text-slate-500 text-xs pointer-events-none select-none bg-black/20 p-1 rounded backdrop-blur-sm">
            Ctrl + Scroll to Zoom • {isCreating ? 'Click & Drag to Create' : 'Drag to Pan'}
        </div>

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
        
        <div className="absolute inset-0 pointer-events-none">
            {/* Guide Lines for Crosshair in Create Mode */}
            {isCreating && !creationStart && (
                <div className="absolute inset-0 pointer-events-none">
                </div>
            )}

          {labels.map((label, idx) => {
            const isSelected = idx === currentLabelIndex;
            const isPending = idx === pendingLabelIndex;
            
            const left = (label.x - label.w / 2) * 100;
            const top = (label.y - label.h / 2) * 100;
            const width = label.w * 100;
            const height = label.h * 100;
            
            const color = isPending ? 'white' : getColor(label.classId);
            const borderColor = color;
            const borderWidth = isSelected ? '3px' : '2px';
            const borderStyle = isPending ? 'dashed' : (label.isPredicted ? 'dotted' : 'solid'); 
            
            const opacityClass = isSelected ? 'opacity-100 z-50' : 'opacity-80 hover:opacity-100 z-10 hover:z-40';
            const shadow = isSelected && !isPending ? `0 0 0 2px white, 0 0 10px ${color}` : (isPending ? '0 0 10px rgba(255,255,255,0.5)' : 'none');
            
            // Special glow for model predictions
            const modelGlow = label.isPredicted && !isSelected ? `0 0 8px ${color}` : shadow;

            return (
              <div
                key={idx}
                className={`absolute transition-opacity pointer-events-none ${opacityClass}`}
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${width}%`,
                  height: `${height}%`,
                }}
              >
                {/* Internal Fill */}
                {showBoxFill && !isCreating && !isPending && (
                  <div 
                     onMouseDown={(e) => startResize(e, 'move', label, idx)}
                     className="absolute inset-0 cursor-move pointer-events-auto transition-colors"
                     style={{ backgroundColor: color, opacity: 0.2 }}
                  />
                )}

                {/* Borders for interaction */}
                <div 
                  onMouseDown={(e) => startResize(e, 'move', label, idx)}
                  className={`absolute top-0 left-0 w-full ${!isCreating && 'cursor-move pointer-events-auto'}`}
                  style={{ height: borderWidth, backgroundColor: borderColor, borderTopStyle: borderStyle, boxShadow: modelGlow, transform: 'translateY(-50%)' }}
                />
                <div 
                  onMouseDown={(e) => startResize(e, 'move', label, idx)}
                  className={`absolute bottom-0 left-0 w-full ${!isCreating && 'cursor-move pointer-events-auto'}`}
                  style={{ height: borderWidth, backgroundColor: borderColor, borderBottomStyle: borderStyle, boxShadow: modelGlow, transform: 'translateY(50%)' }}
                />
                <div 
                  onMouseDown={(e) => startResize(e, 'move', label, idx)}
                  className={`absolute top-0 left-0 h-full ${!isCreating && 'cursor-move pointer-events-auto'}`}
                  style={{ width: borderWidth, backgroundColor: borderColor, borderLeftStyle: borderStyle, boxShadow: modelGlow, transform: 'translateX(-50%)' }}
                />
                <div 
                  onMouseDown={(e) => startResize(e, 'move', label, idx)}
                  className={`absolute top-0 right-0 h-full ${!isCreating && 'cursor-move pointer-events-auto'}`}
                  style={{ width: borderWidth, backgroundColor: borderColor, borderRightStyle: borderStyle, boxShadow: modelGlow, transform: 'translateX(50%)' }}
                />

                {(isSelected || width > 0) && (
                   <div 
                    className={`absolute bottom-full left-0 mb-1 px-1.5 py-0.5 text-xs font-bold whitespace-nowrap rounded shadow-sm pointer-events-none transform origin-bottom-left ${isPending ? 'bg-white text-black' : 'bg-black/75 text-white'}`}
                    style={{ borderLeft: `4px solid ${color}` }}
                   >
                     {isPending 
                       ? 'Pending Class...' 
                       : (label.isPredicted 
                            ? `M-${classes[label.classId] || label.classId}` 
                            : (classes[label.classId] || label.classId))
                     }
                   </div>
                )}

                {/* Resize Handles */}
                {isSelected && !isCreating && !isPending && (
                  <>
                    <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-black cursor-nwse-resize z-50 rounded-sm pointer-events-auto"
                         onMouseDown={(e) => startResize(e, 'tl', label, idx)} />
                    <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-black cursor-nesw-resize z-50 rounded-sm pointer-events-auto"
                         onMouseDown={(e) => startResize(e, 'tr', label, idx)} />
                    <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-black cursor-nesw-resize z-50 rounded-sm pointer-events-auto"
                         onMouseDown={(e) => startResize(e, 'bl', label, idx)} />
                    <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-black cursor-nwse-resize z-50 rounded-sm pointer-events-auto"
                         onMouseDown={(e) => startResize(e, 'br', label, idx)} />
                  </>
                )}
              </div>
            );
          })}

          {/* GHOST BOX RENDER (Create Mode) */}
          {ghostBox && (
              <div 
                className="absolute border-2 border-emerald-400 bg-emerald-500/20 pointer-events-none z-[100]"
                style={{
                    left: `${ghostBox.x * 100}%`,
                    top: `${ghostBox.y * 100}%`,
                    width: `${ghostBox.w * 100}%`,
                    height: `${ghostBox.h * 100}%`,
                }}
              >
                  {/* Crosshair effect inside the box */}
                  <div className="absolute top-1/2 left-0 w-full h-px bg-emerald-400/50"></div>
                  <div className="absolute top-0 left-1/2 h-full w-px bg-emerald-400/50"></div>
                  <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[10px] px-1 font-bold shadow">New</div>
              </div>
          )}

        </div>
      </div>
    </div>
  );
};