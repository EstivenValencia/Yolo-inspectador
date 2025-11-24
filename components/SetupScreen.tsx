import React, { useState, useRef, useEffect } from 'react';
import { Upload, FolderInput, FileText, AlertCircle } from 'lucide-react';
import { ImageAsset } from '../types';

interface SetupScreenProps {
  onComplete: (images: ImageAsset[], labels: Map<string, string>, classes: string[]) => void;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({ onComplete }) => {
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [classes, setClasses] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const classInputRef = useRef<HTMLInputElement>(null);

  // Set webkitdirectory attributes manually to avoid React warnings/errors
  useEffect(() => {
    if (imageInputRef.current) {
      imageInputRef.current.setAttribute("webkitdirectory", "true");
      imageInputRef.current.setAttribute("directory", "true");
    }
    if (labelInputRef.current) {
      labelInputRef.current.setAttribute("webkitdirectory", "true");
      labelInputRef.current.setAttribute("directory", "true");
    }
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const fileList: File[] = Array.from(e.target.files);
      const imageFiles = fileList.filter(f => f.type.startsWith('image/'));
      
      const loadedImages = imageFiles.map(f => ({
        name: f.name,
        url: URL.createObjectURL(f),
        file: f
      })).sort((a, b) => a.name.localeCompare(b.name));

      setImages(loadedImages);
    }
  };

  const handleLabelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const fileList: File[] = Array.from(e.target.files);
      const txtFiles = fileList.filter(f => f.name.endsWith('.txt'));
      
      const newLabels = new Map<string, string>();
      
      for (const file of txtFiles) {
        const text = await file.text();
        // Key is filename without extension (assumed matching image name without extension)
        const key = file.name.replace(/\.[^/.]+$/, "");
        newLabels.set(key, text);
      }
      setLabels(newLabels);
    }
  };

  const handleClassUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const text = await e.target.files[0].text();
      const parsedClasses = text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
      setClasses(parsedClasses);
    }
  };

  const handleStart = () => {
    if (images.length === 0) {
      setError("Please load a folder containing images.");
      return;
    }
    // We allow empty labels or classes, though it's less useful.
    if (classes.length === 0) {
      // Default dummy classes if none provided
      const dummyClasses = Array.from({ length: 80 }, (_, i) => `Class ${i}`);
      onComplete(images, labels, dummyClasses);
    } else {
      onComplete(images, labels, classes);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-6">
      <div className="bg-slate-800 p-8 rounded-xl shadow-2xl border border-slate-700 max-w-2xl w-full">
        <h1 className="text-3xl font-bold text-white mb-2 text-center">YOLO Defect Inspector</h1>
        <p className="text-slate-400 text-center mb-8">Load your dataset to begin inspection and correction.</p>

        <div className="space-y-6">
          
          {/* Images Section */}
          <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 text-indigo-400 font-semibold">
                <FolderInput size={20} />
                Images Folder
              </label>
              <span className="text-xs text-slate-500">{images.length} files loaded</span>
            </div>
            <input
              type="file"
              multiple
              ref={imageInputRef}
              onChange={handleImageUpload}
              className="block w-full text-sm text-slate-400
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-indigo-600 file:text-white
                hover:file:bg-indigo-700 cursor-pointer"
            />
          </div>

          {/* Labels Section */}
          <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
             <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 text-emerald-400 font-semibold">
                <FolderInput size={20} />
                Labels Folder (YOLO .txt)
              </label>
              <span className="text-xs text-slate-500">{labels.size} files loaded</span>
            </div>
            <input
              type="file"
              multiple
              ref={labelInputRef}
              onChange={handleLabelUpload}
              className="block w-full text-sm text-slate-400
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-emerald-600 file:text-white
                hover:file:bg-emerald-700 cursor-pointer"
            />
          </div>

          {/* Classes Section */}
          <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
             <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 text-amber-400 font-semibold">
                <FileText size={20} />
                Classes File (classes.txt)
              </label>
              <span className="text-xs text-slate-500">{classes.length > 0 ? `${classes.length} classes` : 'Optional'}</span>
            </div>
            <input
              type="file"
              accept=".txt"
              ref={classInputRef}
              onChange={handleClassUpload}
              className="block w-full text-sm text-slate-400
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-amber-600 file:text-white
                hover:file:bg-amber-700 cursor-pointer"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 bg-red-900/20 p-3 rounded-lg border border-red-900/50">
              <AlertCircle size={18} />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <button
            onClick={handleStart}
            disabled={images.length === 0}
            className={`w-full py-3 rounded-lg font-bold text-lg transition-all flex items-center justify-center gap-2
              ${images.length > 0 
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/20' 
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
          >
            Load Workspace <Upload size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};