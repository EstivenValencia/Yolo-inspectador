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
  
  // Local state for smooth dragging without saving on every frame
  const [activeEdit, setActiveEdit] = useState<{ index: number, label: YoloLabel } | null>(null);

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
    setActiveEdit(null);
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
    
    // Initialize active edit state for smooth local updates
    setActiveEdit({ index: idx, label: { ...label } });

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

      // 2. RESIZING / MOVING (LOCAL UPDATE)
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
            // Update local state only
            setActiveEdit({ index: idx, label: { ...start, x: newX, y: newY } });
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

        // Update local state only
        setActiveEdit({ index: idx, label: { ...start, x: newX, y: newY, w: newW, h: newH } });
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
      // Commit Creation
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

      // Commit Resize/Move to Parent (Disk Save)
      if (resizing && activeEdit && onUpdateLabel) {
          onUpdateLabel(activeEdit.label, activeEdit.index);
      }
      
      setActiveEdit(null);
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
  }, [resizing, isPanning, transform, onUpdateLabel, isCreating, creationStart, ghostBox, onCreateLabel, activeEdit]);

  // --- DYNAMIC SCALING CALCULATIONS ---
  const scaleFactor = transform.scale;
  
  // Dimensions in Screen Pixels
  // Larger hit area for easier grabbing
  const SCREEN_HIT_AREA = 24; 
  // Smaller visual handle to stay sharp
  const SCREEN_VISUAL_HANDLE = 7; 
  const SCREEN_BORDER = 2;
  const SCREEN_BORDER_SELECTED = 2.5;

  // Scaled Dimensions (for React inline styles)
  const hitAreaSize = SCREEN_HIT_AREA / scaleFactor; 
  const visualHandleSize = SCREEN_VISUAL_HANDLE / scaleFactor;
  const borderW = SCREEN_BORDER / scaleFactor;
  const borderSelectedW = SCREEN_BORDER_SELECTED / scaleFactor;
  
  // Offset to center the hit area on the corner
  const handleOffset = -(hitAreaSize / 2);
  
  // Color for the hit area (transparent)
  const hitAreaColor = 'rgba(255, 0, 0, 0.0)'; 

  // Helper to render a corner handle
  const renderCornerHandle = (type: ResizeHandle, cursor: string, top?: number, bottom?: number, left?: number, right?: number, label?: YoloLabel, idx?: number) => (
    <div
        onMouseDown={(e) => startResize(e, type, label!, idx!)}
        className={`absolute z-[100] group flex items-center justify-center pointer-events-auto cursor-${cursor}-resize`}
        style={{
            top: top !== undefined ? top : 'auto',
            bottom: bottom !== undefined ? bottom : 'auto',
            left: left !== undefined ? left : 'auto',
            right: right !== undefined ? right : 'auto',
            width: hitAreaSize,
            height: hitAreaSize,
            backgroundColor: hitAreaColor,
        }}
    >
        {/* The Visual White Box */}
        <div 
            className="bg-white border border-black shadow-sm transition-transform duration-100 group-hover:scale-[1.75]"
            style={{ width: visualHandleSize, height: visualHandleSize }} 
        />
    </div>
  );

  // Helper to render an edge handle
  const renderEdgeHandle = (type: ResizeHandle, cursor: string, style: React.CSSProperties, label?: YoloLabel, idx?: number) => (
    <div
        onMouseDown={(e) => startResize(e, type, label!, idx!)}
        className={`absolute z-[90] group flex items-center justify-center pointer-events-auto cursor-${cursor}-resize`}
        style={{ ...style, backgroundColor: hitAreaColor }}
    >
        {/* Visual Line/Dot indicator for edge - expands on hover */}
        <div 
            className="bg-white/90 shadow-sm transition-transform duration-100 group-hover:scale-150 rounded-full"
            style={{ 
                width: (type === 'l' || type === 'r') ? borderSelectedW : visualHandleSize, 
                height: (type === 't' || type === 'b') ? borderSelectedW : visualHandleSize,
             }} 
        />
    </div>
  );

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
          {labels.map((propLabel, idx) => {
            // Check if we are currently dragging/editing this label locally
            const label = (activeEdit && activeEdit.index === idx) ? activeEdit.label : propLabel;

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
            
            const currentBorderW = isSelected ? borderSelectedW : borderW;
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

                {/* VISUAL BORDERS (Purely visual, not for interaction) */}
                <div className="absolute inset-0 pointer-events-none" style={{
                    border: isModel ? `${currentBorderW}px dashed ${color}` : `${currentBorderW}px solid ${color}`,
                    boxShadow: modelGlow
                }} />

                {/* EDGE HIT AREAS */}
                {/* TOP */}
                <div 
                  onMouseDown={(e) => startResize(e, 'move', label, idx)}
                  className="absolute top-0 left-0 w-full flex items-center justify-center cursor-move pointer-events-auto"
                  style={{ height: hitW, transform: 'translateY(-50%)', zIndex: 60, backgroundColor: hitAreaColor }}
                />
                
                {/* BOTTOM */}
                <div 
                  onMouseDown={(e) => startResize(e, 'move', label, idx)}
                  className="absolute bottom-0 left-0 w-full flex items-center justify-center cursor-move pointer-events-auto"
                  style={{ height: hitW, transform: 'translateY(50%)', zIndex: 60, backgroundColor: hitAreaColor }}
                />

                {/* LEFT */}
                <div 
                  onMouseDown={(e) => startResize(e, 'move', label, idx)}
                  className="absolute top-0 left-0 h-full flex items-center justify-center cursor-move pointer-events-auto"
                  style={{ width: hitW, transform: 'translateX(-50%)', zIndex: 60, backgroundColor: hitAreaColor }}
                />

                {/* RIGHT */}
                <div 
                  onMouseDown={(e) => startResize(e, 'move', label, idx)}
                  className="absolute top-0 right-0 h-full flex items-center justify-center cursor-move pointer-events-auto"
                  style={{ width: hitW, transform: 'translateX(50%)', zIndex: 60, backgroundColor: hitAreaColor }}
                />

                {/* LABEL TAG */}
                {(isSelected || width > 0) && (
                   <div 
                    onMouseDown={(e) => startResize(e, 'move', label, idx)}
                    className={`absolute left-0 font-bold whitespace-nowrap rounded shadow-sm pointer-events-auto cursor-pointer transform hover:scale-105 transition-transform ${isPending ? 'bg-white text-black' : 'bg-black/75 text-white'}`}
                    style={{ 
                        zIndex: 70,
                        fontSize: `${11 / scaleFactor}px`,
                        padding: `${2 / scaleFactor}px ${6 / scaleFactor}px`,
                        borderLeft: `${4 / scaleFactor}px solid ${color}`,
                        ...(label.isPredicted 
                            ? { top: '100%', marginTop: `${8/scaleFactor}px`, origin: 'top left' }
                            : { bottom: '100%', marginBottom: `${8/scaleFactor}px`, origin: 'bottom left' }
                        )
                    }}
                   >
                     {labelText}
                   </div>
                )}

                {/* RESIZE HANDLES - Only when selected and not pending */}
                {isSelected && !isPending && (
                  <>
                    {/* Corners */}
                    {renderCornerHandle('tl', 'nwse', handleOffset, undefined, handleOffset, undefined, label, idx)}
                    {renderCornerHandle('tr', 'nesw', handleOffset, undefined, undefined, handleOffset, label, idx)}
                    {renderCornerHandle('bl', 'nesw', undefined, handleOffset, handleOffset, undefined, label, idx)}
                    {renderCornerHandle('br', 'nwse', undefined, handleOffset, undefined, handleOffset, label, idx)}
                    
                    {/* Edges */}
                    {renderEdgeHandle('t', 'ns', { top: 0, left: '50%', width: '60%', height: hitW, transform: 'translate(-50%, -50%)' }, label, idx)}
                    {renderEdgeHandle('b', 'ns', { bottom: 0, left: '50%', width: '60%', height: hitW, transform: 'translate(-50%, 50%)' }, label, idx)}
                    {renderEdgeHandle('l', 'ew', { left: 0, top: '50%', height: '60%', width: hitW, transform: 'translate(-50%, -50%)' }, label, idx)}
                    {renderEdgeHandle('r', 'ew', { right: 0, top: '50%', height: '60%', width: hitW, transform: 'translate(50%, -50%)' }, label, idx)}
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