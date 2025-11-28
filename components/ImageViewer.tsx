
import React, { useState, useRef, useEffect } from 'react';
import { YoloLabel, ImageAsset } from '../types';
import { getColor, getModelColor } from '../utils/yoloHelper';
import { RotateCcw } from 'lucide-react';

interface ImageViewerProps {
  image: ImageAsset;
  labels: YoloLabel[];
  currentLabelIndex: number;
  classes: string[];
  isCreating?: boolean;
  showBoxFill?: boolean; 
  labelsVisible?: boolean; 
  showModelLabels?: boolean; 
  pendingLabelIndex?: number | null; 
  onSelectLabel: (index: number) => void;
  onUpdateLabel: (label: YoloLabel, index?: number) => void;
  onCreateLabel?: (label: YoloLabel) => void;
  t?: any;
}

type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br' | 'move' | 'l' | 'r' | 't' | 'b' | null;

export const ImageViewer: React.FC<ImageViewerProps> = ({
  image,
  labels,
  currentLabelIndex,
  classes,
  isCreating = false,
  showBoxFill = false,
  labelsVisible = true,
  showModelLabels = true,
  pendingLabelIndex = null,
  onSelectLabel,
  onUpdateLabel,
  onCreateLabel,
  t
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

  const focusViewer = () => {
    if (viewportRef.current) {
      viewportRef.current.focus();
    }
  };

  useEffect(() => {
    setTransform({ scale: 1, x: 0, y: 0 });
    setCreationStart(null);
    setGhostBox(null);
  }, [image.url]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation(); 
        
        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 33;
        else if (e.deltaMode === 2) delta *= 800; 

        const s = Math.exp(-delta * 0.0015);
        
        setTransform(prev => {
           const newScale = Math.min(Math.max(0.1, prev.scale * s), 50);
           const ratio = newScale / prev.scale;

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
    focusViewer();

    // If we are resizing, we don't want to trigger creation or panning
    if (resizing) return;

    // 1. CREATION LOGIC
    if (isCreating && contentRef.current) {
        e.preventDefault();
        e.stopPropagation();
        
        const rect = contentRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        
        setCreationStart({ x, y });
        setGhostBox({ x, y, w: 0, h: 0 });
        return;
    }

    // 2. PANNING LOGIC
    if (e.button === 0 || e.button === 1) {
        e.preventDefault(); 
        setIsPanning(true);
        onSelectLabel(-1);
        
        startDrag.current.mouseX = e.clientX;
        startDrag.current.mouseY = e.clientY;
        startDrag.current.transformX = transform.x;
        startDrag.current.transformY = transform.y;
    }
  };

  const startResize = (e: React.MouseEvent, handle: ResizeHandle, label: YoloLabel, idx: number) => {
    // CRITICAL: Stop propagation so we don't trigger the container's MouseDown (which starts creation/panning)
    e.preventDefault();
    e.stopPropagation(); 
    
    focusViewer();
    onSelectLabel(idx);
    setResizing(handle);
    startDrag.current = {
      ...startDrag.current,
      mouseX: e.clientX,
      mouseY: e.clientY,
      label: { ...label },
      index: idx
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
        
        if (resizing === 'move') {
            const newX = Math.max(0, Math.min(1, start.x + deltaX));
            const newY = Math.max(0, Math.min(1, start.y + deltaY));
            onUpdateLabel({ ...start, x: newX, y: newY }, idx);
            return;
        }

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
      if (isCreating && creationStart && ghostBox && onCreateLabel) {
          const centerX = ghostBox.x + ghostBox.w / 2;
          const centerY = ghostBox.y + ghostBox.h / 2;
          
          if (ghostBox.w > 0.001 && ghostBox.h > 0.001) {
              onCreateLabel({
                  classId: 0,
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

  // --- DYNAMIC SCALING CALCULATIONS ---
  // To solve the issue where clicking lines is hard when zoomed out,
  // we calculate sizes that are inversely proportional to scale.
  // This ensures a "constant screen size" for handles and hit areas.
  const scaleFactor = transform.scale;
  
  // Hit area should be roughly 15px on screen regardless of zoom
  const hitAreaSize = Math.max(0.001, 15 / scaleFactor); 
  
  // Visual border width: 2px on screen normal, 3px selected
  const visualBorderBase = 2 / scaleFactor;
  const visualBorderSelected = 3 / scaleFactor;

  // Handles: 10px on screen
  const handleSize = 10 / scaleFactor;
  const handleOffset = -(handleSize / 2);

  return (
    <div 
      ref={viewportRef}
      onMouseDown={handleMouseDown}
      tabIndex={-1} 
      className={`flex-1 bg-slate-950 flex items-center justify-center overflow-hidden relative outline-none ${isCreating ? 'cursor-crosshair' : (isPanning ? 'cursor-grabbing' : 'cursor-grab')}`}
    >
        <div className="absolute top-4 right-4 z-50 flex flex-col gap-2">
            {(transform.scale !== 1 || transform.x !== 0 || transform.y !== 0) && (
                <button 
                    onClick={() => setTransform({scale: 1, x: 0, y: 0})} 
                    className="bg-slate-800/80 hover:bg-slate-700 text-white p-2 rounded shadow-lg backdrop-blur text-xs font-bold flex items-center gap-2 border border-slate-600 transition-all pointer-events-auto"
                >
                    <RotateCcw size={14} /> {t?.app?.resetView || "Reset View"}
                </button>
            )}
        </div>
        
        {isCreating && (
             <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-lg font-bold border border-white/20 animate-pulse pointer-events-none">
                {t?.app?.createMode || "CREATE MODE (Draw a box)"}
             </div>
        )}
        
        <div className="absolute bottom-4 left-4 z-50 text-slate-500 text-xs pointer-events-none select-none bg-black/20 p-1 rounded backdrop-blur-sm">
            {t?.app?.panZoomInfo || "Ctrl + Scroll to Zoom • Drag to Pan"}
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
          {labels.map((label, idx) => {
            if (label.isPredicted && !showModelLabels) return null;
            if (!label.isPredicted && !labelsVisible) return null;

            const isSelected = idx === currentLabelIndex;
            const isPending = idx === pendingLabelIndex;
            const isModel = label.isPredicted || isPending;
            
            const left = (label.x - label.w / 2) * 100;
            const top = (label.y - label.h / 2) * 100;
            const width = label.w * 100;
            const height = label.h * 100;
            
            const color = isPending ? 'white' : (label.isPredicted ? getModelColor(label.classId) : getColor(label.classId));
            
            // Dynamic widths based on scale
            const borderW = isSelected ? visualBorderSelected : visualBorderBase;
            const hitW = hitAreaSize;

            const opacityClass = isSelected ? 'opacity-100 z-50' : 'opacity-80 hover:opacity-100 z-10 hover:z-40';
            const modelGlow = label.isPredicted && !isSelected ? `0 0 ${8 / scaleFactor}px ${color}` : 'none';

            let labelText = '';
            if (isPending) {
                labelText = 'Pending...';
            } else {
                const className = classes[label.classId] || label.classId.toString();
                if (label.isPredicted) {
                    const conf = label.confidence ? Math.round(label.confidence * 100) + '%' : '';
                    labelText = `M-${className} ${conf}`;
                } else {
                    labelText = className;
                }
            }

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
                {/* FILL AREA */}
                {showBoxFill && !isCreating && !isPending && (
                  <div 
                     onMouseDown={(e) => startResize(e, 'move', label, idx)}
                     className="absolute inset-0 cursor-move pointer-events-auto transition-colors"
                     style={{ backgroundColor: color, opacity: 0.2 }}
                  />
                )}

                {/* --- BORDERS (HIT AREAS & VISUALS) --- */}
                {/* We use a solid transparent border for hitting, and an inner border for visuals */}
                
                {/* TOP */}
                <div 
                  onMouseDown={(e) => startResize(e, 'move', label, idx)}
                  className="absolute top-0 left-0 w-full flex items-center justify-center cursor-move pointer-events-auto"
                  style={{ 
                      height: hitW, 
                      transform: 'translateY(-50%)', 
                      zIndex: 20,
                      backgroundColor: 'rgba(255,255,255,0.01)' // Catch click
                  }}
                >
                    <div className="w-full" style={{ 
                        height: borderW, 
                        borderTop: isModel ? `${borderW}px dashed ${color}` : `${borderW}px solid ${color}`,
                        boxShadow: modelGlow 
                    }} />
                </div>

                {/* BOTTOM */}
                <div 
                  onMouseDown={(e) => startResize(e, 'move', label, idx)}
                  className="absolute bottom-0 left-0 w-full flex items-center justify-center cursor-move pointer-events-auto"
                  style={{ 
                      height: hitW, 
                      transform: 'translateY(50%)', 
                      zIndex: 20,
                      backgroundColor: 'rgba(255,255,255,0.01)'
                  }}
                >
                    <div className="w-full" style={{ 
                        height: borderW, 
                        borderBottom: isModel ? `${borderW}px dashed ${color}` : `${borderW}px solid ${color}`,
                        boxShadow: modelGlow 
                    }} />
                </div>

                {/* LEFT */}
                <div 
                  onMouseDown={(e) => startResize(e, 'move', label, idx)}
                  className="absolute top-0 left-0 h-full flex items-center justify-center cursor-move pointer-events-auto"
                  style={{ 
                      width: hitW, 
                      transform: 'translateX(-50%)', 
                      zIndex: 20,
                      backgroundColor: 'rgba(255,255,255,0.01)'
                  }}
                >
                    <div className="h-full" style={{ 
                        width: borderW, 
                        borderLeft: isModel ? `${borderW}px dashed ${color}` : `${borderW}px solid ${color}`,
                        boxShadow: modelGlow 
                    }} />
                </div>

                {/* RIGHT */}
                <div 
                  onMouseDown={(e) => startResize(e, 'move', label, idx)}
                  className="absolute top-0 right-0 h-full flex items-center justify-center cursor-move pointer-events-auto"
                  style={{ 
                      width: hitW, 
                      transform: 'translateX(50%)', 
                      zIndex: 20,
                      backgroundColor: 'rgba(255,255,255,0.01)'
                  }}
                >
                    <div className="h-full" style={{ 
                        width: borderW, 
                        borderRight: isModel ? `${borderW}px dashed ${color}` : `${borderW}px solid ${color}`,
                        boxShadow: modelGlow 
                    }} />
                </div>

                {/* LABEL TAG */}
                {(isSelected || width > 0) && (
                   <div 
                    className={`absolute left-0 font-bold whitespace-nowrap rounded shadow-sm pointer-events-none transform ${isPending ? 'bg-white text-black' : 'bg-black/75 text-white'}`}
                    style={{ 
                        fontSize: `${12 / scaleFactor}px`, // Scale text so it doesn't get huge/tiny
                        padding: `${2 / scaleFactor}px ${6 / scaleFactor}px`,
                        borderLeft: `${4 / scaleFactor}px solid ${color}`,
                        ...(label.isPredicted 
                            ? { top: '100%', marginTop: `${4/scaleFactor}px`, origin: 'top left' } 
                            : { bottom: '100%', marginBottom: `${4/scaleFactor}px`, origin: 'bottom left' }
                        )
                    }}
                   >
                     {labelText}
                   </div>
                )}

                {/* RESIZE HANDLES (Corners and Edges) - Only when selected and not pending */}
                {isSelected && !isPending && (
                  <>
                    <div className="absolute bg-white border border-black cursor-nwse-resize z-50 rounded-sm pointer-events-auto shadow-sm"
                         style={{ top: handleOffset, left: handleOffset, width: handleSize, height: handleSize }}
                         onMouseDown={(e) => startResize(e, 'tl', label, idx)} />
                    <div className="absolute bg-white border border-black cursor-nesw-resize z-50 rounded-sm pointer-events-auto shadow-sm"
                         style={{ top: handleOffset, right: handleOffset, width: handleSize, height: handleSize }}
                         onMouseDown={(e) => startResize(e, 'tr', label, idx)} />
                    <div className="absolute bg-white border border-black cursor-nesw-resize z-50 rounded-sm pointer-events-auto shadow-sm"
                         style={{ bottom: handleOffset, left: handleOffset, width: handleSize, height: handleSize }}
                         onMouseDown={(e) => startResize(e, 'bl', label, idx)} />
                    <div className="absolute bg-white border border-black cursor-nwse-resize z-50 rounded-sm pointer-events-auto shadow-sm"
                         style={{ bottom: handleOffset, right: handleOffset, width: handleSize, height: handleSize }}
                         onMouseDown={(e) => startResize(e, 'br', label, idx)} />
                    
                    {/* Edge Resizers */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 cursor-ns-resize z-50 pointer-events-auto"
                         style={{ width: '50%', height: hitW, transform: 'translateY(-50%)' }}
                         onMouseDown={(e) => startResize(e, 't', label, idx)} />
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 cursor-ns-resize z-50 pointer-events-auto"
                         style={{ width: '50%', height: hitW, transform: 'translateY(50%)' }}
                         onMouseDown={(e) => startResize(e, 'b', label, idx)} />
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 cursor-ew-resize z-50 pointer-events-auto"
                         style={{ height: '50%', width: hitW, transform: 'translateX(-50%)' }}
                         onMouseDown={(e) => startResize(e, 'l', label, idx)} />
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 cursor-ew-resize z-50 pointer-events-auto"
                         style={{ height: '50%', width: hitW, transform: 'translateX(50%)' }}
                         onMouseDown={(e) => startResize(e, 'r', label, idx)} />
                  </>
                )}
              </div>
            );
          })}

          {/* GHOST BOX RENDER */}
          {ghostBox && (
              <div 
                className="absolute border-2 border-emerald-400 bg-emerald-500/20 pointer-events-none z-[100]"
                style={{
                    left: `${ghostBox.x * 100}%`,
                    top: `${ghostBox.y * 100}%`,
                    width: `${ghostBox.w * 100}%`,
                    height: `${ghostBox.h * 100}%`,
                    borderWidth: `${2/scaleFactor}px`
                }}
              >
                  <div className="absolute top-0 right-0 bg-emerald-600 text-white px-1 font-bold shadow"
                    style={{ fontSize: `${10/scaleFactor}px` }}
                  >New</div>
              </div>
          )}

        </div>
      </div>
    </div>
  );
};
