import React, { useEffect, useRef, useState } from 'react';
import { YoloLabel, ImageAsset } from '../types';
import { ChevronLeft, ChevronRight, AlertTriangle, Tag, MousePointerClick, Maximize2, Trash2, Info, Plus } from 'lucide-react';
import { getColor } from '../utils/yoloHelper';

interface DetailPanelProps {
  width: number;
  currentLabel: YoloLabel | null;
  currentImage: ImageAsset | null;
  classes: string[];
  totalLabels: number;
  currentLabelIndex: number;
  onNextLabel: () => void;
  onPrevLabel: () => void;
  onUpdateLabel: (updatedLabel: YoloLabel) => void;
  onDeleteLabel: () => void;
  isCreating: boolean;
  onToggleCreateMode: () => void;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  width,
  currentLabel,
  currentImage,
  classes,
  totalLabels,
  currentLabelIndex,
  onNextLabel,
  onPrevLabel,
  onUpdateLabel,
  onDeleteLabel,
  isCreating,
  onToggleCreateMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomContainerRef = useRef<HTMLDivElement>(null);
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);
  
  // Context Padding (Scale Multiplier)
  // 0 = Tight crop (approx 1.2x size)
  // 100 = Wide crop (approx 5x size)
  const [contextPadding, setContextPadding] = useState(30);
  
  // Zoom & Pan for Right Panel
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Reset zoom/pan when label changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [currentLabelIndex, currentImage]);

  // Load image object for canvas operations
  useEffect(() => {
    if (!currentImage) return;
    const img = new Image();
    img.src = currentImage.url;
    img.onload = () => setImgElement(img);
  }, [currentImage]);

  // Draw crop
  useEffect(() => {
    if (!currentLabel || !imgElement || !canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const imgW = imgElement.naturalWidth;
    const imgH = imgElement.naturalHeight;
    
    // NEW LOGIC: Crop is relative to the defect size
    // Calculate expansion factor based on slider (0-100) maps to (1.2x - 6.0x) size
    // This ensures small defects are ZOOMED IN, not lost in a large crop
    const expansionFactor = 1.2 + (contextPadding / 100) * 4.0; 

    // Calculate crop dimensions relative to label size
    const cropW = currentLabel.w * expansionFactor;
    const cropH = currentLabel.h * expansionFactor;

    // Calculate crop boundaries (0-1 coordinates)
    // Clamp to image boundaries
    const cLeft = Math.max(0, currentLabel.x - cropW / 2);
    const cRight = Math.min(1, currentLabel.x + cropW / 2);
    const cTop = Math.max(0, currentLabel.y - cropH / 2);
    const cBottom = Math.min(1, currentLabel.y + cropH / 2);

    // Convert to pixels
    const pxLeft = cLeft * imgW;
    const pxTop = cTop * imgH;
    const pxWidth = (cRight - cLeft) * imgW;
    const pxHeight = (cBottom - cTop) * imgH;

    // Set canvas size to the Pixel dimensions of the crop
    // This forces the browser to scale this UP to fit the CSS container, creating the "Zoom" effect
    canvasRef.current.width = Math.max(1, pxWidth);
    canvasRef.current.height = Math.max(1, pxHeight);

    // Draw image portion
    ctx.clearRect(0, 0, pxWidth, pxHeight);
    // Draw source (pxLeft, pxTop, pxWidth, pxHeight) to destination (0, 0, pxWidth, pxHeight)
    ctx.drawImage(imgElement, pxLeft, pxTop, pxWidth, pxHeight, 0, 0, pxWidth, pxHeight);

    // Draw the Box on the canvas
    // We need to translate the global coordinates to the crop-local coordinates
    const boxX = (currentLabel.x * imgW) - (currentLabel.w * imgW) / 2 - pxLeft;
    const boxY = (currentLabel.y * imgH) - (currentLabel.h * imgH) / 2 - pxTop;
    const boxW = currentLabel.w * imgW;
    const boxH = currentLabel.h * imgH;

    ctx.strokeStyle = getColor(currentLabel.classId);
    // Dynamic line width relative to crop size so it's always visible but not overwhelming
    ctx.lineWidth = Math.max(2, Math.min(pxWidth, pxHeight) / 50); 
    ctx.strokeRect(boxX, boxY, boxW, boxH);

  }, [currentLabel, imgElement, contextPadding]); 

  // --- Zoom Logic for Right Panel ---
  useEffect(() => {
    const container = zoomContainerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            let delta = e.deltaY;
            if (e.deltaMode === 1) delta *= 33;
            if (e.deltaMode === 2) delta *= 800;
            const s = Math.exp(-delta * 0.0015);
            setZoom(prev => Math.min(Math.max(1, prev * s), 20)); 
        }
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  // --- Pan Logic for Right Panel ---
  const handleMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      setIsPanning(true);
      dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
          if (!isPanning) return;
          e.preventDefault();
          const dx = e.clientX - dragStart.current.x;
          const dy = e.clientY - dragStart.current.y;
          setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
      };
      
      const handleMouseUp = () => setIsPanning(false);

      if (isPanning) {
          window.addEventListener('mousemove', handleMouseMove);
          window.addEventListener('mouseup', handleMouseUp);
      }
      return () => {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
      }
  }, [isPanning]);


  if (!currentImage) {
    return <div style={{ width }} className="h-full bg-slate-800 p-4 text-slate-500 shrink-0">No image loaded</div>;
  }

  if (totalLabels === 0) {
    return (
      <div style={{ width }} className="h-full flex flex-col items-center justify-center p-8 bg-slate-800 border-l border-slate-700 text-slate-400 shrink-0">
        <AlertTriangle className="mb-4 text-amber-500" size={48} />
        <h3 className="text-xl font-bold mb-2">No Labels Found</h3>
        <p className="text-center text-sm mb-6">This image has no annotated defects.</p>
        
        <button 
           onClick={onToggleCreateMode}
           className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold transition-all shadow-lg ${isCreating ? 'bg-indigo-600 text-white shadow-indigo-500/30' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'}`}
        >
             <Plus size={20} />
             {isCreating ? 'Draw on Image' : 'Start Adding Labels (E)'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ width }} className="h-full flex flex-col bg-slate-800 border-l border-slate-700 overflow-hidden shrink-0 shadow-xl transition-all duration-75">
      
      {/* Zoom / Crop View */}
      <div className="p-4 bg-slate-900 border-b border-slate-700 flex flex-col gap-3">
        <div className="flex justify-between items-center mb-1">
           <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <MousePointerClick size={16} /> 
            Zoom View
           </h2>
           <div className="flex items-center gap-2">
               <button 
                  onClick={onToggleCreateMode}
                  className={`p-1 rounded transition-colors ${isCreating ? 'bg-indigo-600 text-white' : 'hover:bg-slate-700 text-slate-400'}`}
                  title="Add New Label (E)"
               >
                   <Plus size={16} />
               </button>
               <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded">
                 {currentLabelIndex + 1} / {totalLabels}
               </span>
           </div>
        </div>

        {/* Context Slider */}
        <div className="flex items-center gap-3 bg-slate-800 p-2 rounded-lg border border-slate-700">
             <Maximize2 size={14} className="text-slate-400" />
             <input 
                type="range" 
                min="0" 
                max="100" 
                value={contextPadding} 
                onChange={(e) => setContextPadding(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                title="Adjust Zoom Level around the defect"
             />
             <span className="text-[10px] w-8 text-right text-slate-400">{contextPadding}%</span>
        </div>
        
        {/* Canvas Container */}
        <div 
            ref={zoomContainerRef}
            onMouseDown={handleMouseDown}
            className={`w-full aspect-video bg-black/40 rounded-lg border border-slate-600 flex items-center justify-center overflow-hidden relative ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
        >
          <div 
             className="relative transition-transform duration-75 ease-out w-full h-full flex items-center justify-center"
             style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            <canvas 
                ref={canvasRef} 
                className="max-w-full max-h-full object-contain pointer-events-none image-pixelated"
                style={{ imageRendering: 'pixelated' }} // Ensures small defects look sharp when zoomed up
            />
          </div>
          
          <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] text-slate-300 pointer-events-none">
              Ctrl+Scroll: {zoom.toFixed(1)}x
          </div>
        </div>
        
        <div className="flex justify-between gap-2 mt-1">
          <button 
            onClick={onPrevLabel}
            className="flex-1 flex items-center justify-center gap-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded transition-colors text-sm"
            title="Previous Defect (S)"
          >
            <ChevronLeft size={16} />
          </button>

          <button
             onClick={onDeleteLabel}
             className="flex items-center justify-center bg-red-900/40 hover:bg-red-600 text-red-200 hover:text-white px-4 rounded transition-colors border border-red-900/50"
             title="Delete current label (Q)"
          >
            <Trash2 size={16} />
          </button>
          
          <button 
            onClick={onNextLabel}
            className="flex-1 flex items-center justify-center gap-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded transition-colors text-sm"
            title="Next Defect (W)"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Editing Controls */}
      <div className="p-6 flex-1 flex flex-col gap-6 overflow-y-auto">
        
        {/* Class Selector */}
        <div className="bg-slate-700/50 p-4 rounded-xl border border-slate-600">
          <label className="flex items-center gap-2 text-sm font-bold text-indigo-300 uppercase tracking-wider mb-2">
            <Tag size={16} />
            Edit Label Class
          </label>
          <div className="relative">
            <select
              value={currentLabel?.classId || 0}
              onChange={(e) => currentLabel && onUpdateLabel({ ...currentLabel, classId: parseInt(e.target.value) })}
              className="w-full bg-slate-800 border-2 border-slate-600 text-white p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none appearance-none cursor-pointer text-lg font-medium shadow-inner"
            >
              {classes.map((cls, idx) => (
                <option key={idx} value={idx}>
                  {idx}: {cls}
                </option>
              ))}
            </select>
            <div 
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border border-white/20 shadow-sm"
              style={{ backgroundColor: getColor(currentLabel?.classId || 0) }}
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-2 text-right">Press <b>R</b> to quick select</p>
        </div>

        {/* Coordinates */}
        <div className="space-y-4 p-4 bg-slate-900/30 rounded-lg border border-slate-700/50">
           <h3 className="text-xs font-bold text-slate-400 uppercase">Coordinates (YOLO Format)</h3>
           <div className="grid grid-cols-2 gap-4 text-xs text-slate-300 font-mono">
              <div className="flex flex-col">
                <span className="text-slate-500 text-[10px] uppercase">Center X</span>
                {currentLabel?.x.toFixed(6)}
              </div>
              <div className="flex flex-col">
                <span className="text-slate-500 text-[10px] uppercase">Center Y</span>
                {currentLabel?.y.toFixed(6)}
              </div>
              <div className="flex flex-col">
                <span className="text-slate-500 text-[10px] uppercase">Width</span>
                {currentLabel?.w.toFixed(6)}
              </div>
              <div className="flex flex-col">
                <span className="text-slate-500 text-[10px] uppercase">Height</span>
                {currentLabel?.h.toFixed(6)}
              </div>
           </div>
        </div>
        
        <div className="mt-auto pt-4 border-t border-slate-700">
             <div className="text-slate-500 text-xs flex items-center justify-center gap-2">
                 <Info size={14} />
                 <span>Changes are auto-saved to disk</span>
             </div>
        </div>

      </div>
    </div>
  );
};