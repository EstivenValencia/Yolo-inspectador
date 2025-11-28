import React, { useState } from 'react';
import { Cpu, X, CheckCircle, AlertCircle, FolderOutput } from 'lucide-react';
import { BackendConfig, checkBackendHealth } from '../utils/apiHelper';
import { FileSystemDirectoryHandle } from '../types';

interface ModelSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  config: BackendConfig;
  onConfigChange: (newConfig: BackendConfig) => void;
  isBackendConnected: boolean;
  modelOutputHandle: FileSystemDirectoryHandle | null;
  onModelOutputHandleChange: (handle: FileSystemDirectoryHandle | null) => void;
  t: any;
}

export const ModelSettings: React.FC<ModelSettingsProps> = ({ 
  isOpen, 
  onClose, 
  config, 
  onConfigChange,
  isBackendConnected,
  modelOutputHandle,
  onModelOutputHandleChange,
  t
}) => {
  const [checking, setChecking] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
      setChecking(true);
      setTestResult(null);
      const isOk = await checkBackendHealth(config.apiUrl);
      setTestResult(isOk ? 'ok' : 'fail');
      setChecking(false);
  };

  const handleSelectOutputFolder = async () => {
    try {
        const handle = await window.showDirectoryPicker({ id: 'labels_output', mode: 'readwrite' });
        onModelOutputHandleChange(handle);
    } catch (e) {
        // cancelled
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Cpu className="text-indigo-400" /> {t.modelSettings.title}
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
                <X size={24} />
            </button>
        </div>

        <div className="space-y-6">
             {/* Output Folder Selection */}
             <div className="bg-slate-900/30 p-4 rounded-lg border border-slate-700">
                <label className="block text-sm font-bold text-slate-300 mb-2 flex items-center gap-2">
                    <FolderOutput size={16} className="text-purple-400" />
                    {t.modelSettings.outputFolder}
                </label>
                <p className="text-xs text-slate-500 mb-3">
                   {t.modelSettings.outputDesc}
                </p>
                <div className="flex flex-col gap-2">
                    <div className="text-xs text-slate-400 bg-slate-900 p-2 rounded border border-slate-800 break-all">
                        <span className="font-bold text-slate-500 uppercase mr-2">{t.modelSettings.currentFolder}:</span>
                        {modelOutputHandle ? modelOutputHandle.name : t.modelSettings.defaultFolder}
                    </div>
                    <button 
                        onClick={handleSelectOutputFolder}
                        className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded text-xs font-bold transition-colors border border-slate-600 self-start"
                    >
                        {t.modelSettings.selectFolder}
                    </button>
                </div>
            </div>

            <hr className="border-slate-700" />

            {/* Backend URL */}
            <div>
                <label className="block text-sm font-bold text-slate-300 mb-2">{t.modelSettings.url}</label>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={config.apiUrl}
                        onChange={(e) => onConfigChange({...config, apiUrl: e.target.value})}
                        className="flex-1 bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="http://localhost:5000"
                    />
                    <button 
                        onClick={handleTestConnection}
                        disabled={checking}
                        className="bg-slate-700 hover:bg-slate-600 text-white px-4 rounded-lg font-bold text-sm transition-colors border border-slate-600"
                    >
                        {checking ? '...' : t.modelSettings.test}
                    </button>
                </div>
                
                {testResult === 'ok' && (
                    <div className="mt-2 text-emerald-400 text-xs flex items-center gap-1">
                        <CheckCircle size={12} /> {t.modelSettings.connectionSuccess}
                    </div>
                )}
                {testResult === 'fail' && (
                    <div className="mt-2 text-red-400 text-xs flex items-center gap-1">
                        <AlertCircle size={12} /> {t.modelSettings.connectionFail}
                    </div>
                )}
            </div>

            {/* Main Thresholds */}
            <div>
                <h3 className="text-sm font-bold text-slate-400 mb-2 uppercase">{t.modelSettings.thresholds}</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">{t.modelSettings.confidence}</label>
                        <input 
                            type="number" 
                            step="0.05"
                            min="0.1"
                            max="1.0"
                            value={config.confidenceThreshold}
                            onChange={(e) => onConfigChange({...config, confidenceThreshold: parseFloat(e.target.value)})}
                            className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">{t.modelSettings.iou}</label>
                        <input 
                            type="number" 
                            step="0.05"
                            min="0.1"
                            max="1.0"
                            value={config.iouThreshold}
                            onChange={(e) => onConfigChange({...config, iouThreshold: parseFloat(e.target.value)})}
                            className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                </div>
            </div>

            <hr className="border-slate-700" />

            {/* SAHI Parameters */}
            <div>
                 <h3 className="text-sm font-bold text-indigo-300 mb-3">{t.modelSettings.sahi}</h3>
                 <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">{t.modelSettings.width}</label>
                        <input 
                            type="number" 
                            step="32"
                            min="32"
                            value={config.sliceWidth}
                            onChange={(e) => onConfigChange({...config, sliceWidth: parseInt(e.target.value)})}
                            className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">{t.modelSettings.height}</label>
                        <input 
                            type="number" 
                            step="32"
                            min="32"
                            value={config.sliceHeight}
                            onChange={(e) => onConfigChange({...config, sliceHeight: parseInt(e.target.value)})}
                            className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">{t.modelSettings.overlapW}</label>
                        <input 
                            type="number" 
                            step="0.05"
                            min="0"
                            max="0.5"
                            value={config.overlapWidthRatio}
                            onChange={(e) => onConfigChange({...config, overlapWidthRatio: parseFloat(e.target.value)})}
                            className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">{t.modelSettings.overlapH}</label>
                        <input 
                            type="number" 
                            step="0.05"
                            min="0"
                            max="0.5"
                            value={config.overlapHeightRatio}
                            onChange={(e) => onConfigChange({...config, overlapHeightRatio: parseFloat(e.target.value)})}
                            className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                 </div>
            </div>

            <div className="bg-slate-900/50 p-3 rounded text-xs text-slate-400">
                <p>{t.modelSettings.instructions}</p>
                <p className="mt-1">Press <kbd className="bg-slate-700 text-white px-1 rounded">Z</kbd> to detect.</p>
            </div>
            
            <div className="flex justify-end">
                <button 
                    onClick={onClose}
                    className={`px-4 py-2 rounded font-bold transition-colors ${isBackendConnected ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'}`}
                >
                    {isBackendConnected ? t.modelSettings.close : t.modelSettings.close}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};