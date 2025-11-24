import React, { useEffect, useRef, useState } from 'react';
import { YoloLabel, ImageAsset } from '../types';
import { ChevronLeft, ChevronRight, Save, AlertTriangle, Tag, MousePointerClick } from 'lucide-react';
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
  onDownloadLabels: () => void;
  hasUnsavedChanges: boolean;
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
  onDownloadLabels,
  hasUnsavedChanges
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);

  // Load image object for canvas operations
  useEffect(() => {
    if (!currentImage) return;
    const img = new Image();
    // Removed crossOrigin="anonymous" to allow local file/blob usage without CORS errors
    img.src = currentImage.url;
    img.onload = () => setImgElement(img);
  }, [currentImage]);

  // Draw crop
  useEffect(() => {
    if (!currentLabel || !imgElement || !canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Calculate crop coordinates
    const imgW = imgElement.naturalWidth;
    const imgH = imgElement.naturalHeight;
    
    // Add some padding to the crop for context (20%)
    const paddingMultiplier = 1.2;
    
    let w = currentLabel.w * imgW * paddingMultiplier;
    let h = currentLabel.h * imgH * paddingMultiplier;
    
    // Clamp width/height
    if (w > imgW) w = imgW;
    if (h > imgH) h = imgH;

    let cx = currentLabel.x * imgW;
    let cy = currentLabel.y * imgH;

    let x = cx - w / 2;
    let y = cy - h / 2;

    // Boundary checks
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + w > imgW) x = imgW - w;
    if (y + h > imgH) y = imgH - h;

    // Set canvas size (keep aspect ratio of crop, but fit in container)
    // We render high res then scale down via CSS
    canvasRef.current.width = w;
    canvasRef.current.height = h;

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(imgElement, x, y, w, h, 0, 0, w, h);

    // Draw a rectangle on the crop to show exactly where the box is relative to the crop
    // Calculate box relative to crop x, y
    const boxX = (currentLabel.x * imgW) - (currentLabel.w * imgW) / 2 - x;
    const boxY = (currentLabel.y * imgH) - (currentLabel.h * imgH) / 2 - y;
    const boxW = currentLabel.w * imgW;
    const boxH = currentLabel.h * imgH;

    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = Math.max(2, w / 100); // Dynamic line width based on resolution
    ctx.strokeRect(boxX, boxY, boxW, boxH);

  }, [currentLabel, imgElement]);


  if (!currentImage) {
    return <div style={{ width }} className="h-full bg-slate-800 p-4 text-slate-500 shrink-0">No image loaded</div>;
  }

  if (totalLabels === 0) {
    return (
      <div style={{ width }} className="h-full flex flex-col items-center justify-center p-8 bg-slate-800 border-l border-slate-700 text-slate-400 shrink-0">
        <AlertTriangle className="mb-4 text-amber-500" size={48} />
        <h3 className="text-xl font-bold mb-2">No Labels Found</h3>
        <p className="text-center text-sm">This image has no annotated defects.</p>
        <p className="text-center text-xs text-slate-600 mt-2">Click on the image to add one (Coming Soon)</p>
      </div>
    );
  }

  return (
    <div style={{ width }} className="h-full flex flex-col bg-slate-800 border-l border-slate-700 overflow-hidden shrink-0 shadow-xl transition-all duration-75">
      
      {/* Zoom / Crop View */}
      <div className="p-4 bg-slate-900 border-b border-slate-700 flex flex-col gap-2">
        <div className="flex justify-between items-center mb-1">
           <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <MousePointerClick size={16} /> 
            Zoom View
           </h2>
           <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded">
             {currentLabelIndex + 1} / {totalLabels}
           </span>
        </div>
        
        <div className="w-full aspect-video bg-black/40 rounded-lg border border-slate-600 flex items-center justify-center overflow-hidden relative">
          <canvas 
            ref={canvasRef} 
            className="max-w-full max-h-full object-contain"
          />
        </div>
        
        <div className="flex justify-between gap-2 mt-2">
          <button 
            onClick={onPrevLabel}
            className="flex-1 flex items-center justify-center gap-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded transition-colors text-sm"
          >
            <ChevronLeft size={16} /> Prev
          </button>
          <button 
            onClick={onNextLabel}
            className="flex-1 flex items-center justify-center gap-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded transition-colors text-sm"
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Editing Controls */}
      <div className="p-6 flex-1 flex flex-col gap-6 overflow-y-auto">
        
        {/* Class Selector - High Priority */}
        <div className="bg-slate-700/50 p-4 rounded-xl border border-slate-600">
          <label className="flex items-center gap-2 text-sm font-bold text-indigo-300 uppercase tracking-wider mb-2">
            <Tag size={16} />
            Edit Label Class
          </label>
          <p className="text-xs text-slate-400 mb-3">
             Select the correct class for this defect. Changes are saved automatically when moving to the next image.
          </p>
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
            {/* Color Indicator */}
            <div 
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border border-white/20 shadow-sm"
              style={{ backgroundColor: getColor(currentLabel?.classId || 0) }}
            />
          </div>
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
           {hasUnsavedChanges ? (
              <div className="mb-4 text-amber-400 text-sm flex items-center gap-2 bg-amber-900/20 p-2 rounded animate-pulse">
                <AlertTriangle size={14} />
                Changes pending save to disk
              </div>
           ) : (
             <div className="mb-4 h-9"></div>
           )}
           
           <button
            onClick={onDownloadLabels}
            className={`w-full flex items-center justify-center gap-2 font-bold py-3 rounded-lg shadow-lg transition-all active:scale-95
               ${hasUnsavedChanges 
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/20' 
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-200'}`}
          >
            <Save size={18} />
            {hasUnsavedChanges ? "Save Changes to File" : "Download File"}
          </button>
          <p className="text-xs text-slate-500 text-center mt-2">
            Downloads the .txt file for the current image.
          </p>
        </div>

      </div>
    </div>
  );
};