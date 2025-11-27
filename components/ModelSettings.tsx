
import React, { useState } from 'react';
import { Cpu, X, Server, AlertCircle, CheckCircle } from 'lucide-react';
import { BackendConfig, checkBackendHealth } from '../utils/apiHelper';

interface ModelSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  config: BackendConfig;
  onConfigChange: (newConfig: BackendConfig) => void;
  isBackendConnected: boolean;
}

export const ModelSettings: React.FC<ModelSettingsProps> = ({ 
  isOpen, 
  onClose, 
  config, 
  onConfigChange,
  isBackendConnected
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

  return (
    <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Cpu className="text-indigo-400" /> Python Backend Settings
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
                <X size={24} />
            </button>
        </div>

        <div className="space-y-6">
            {/* Backend URL */}
            <div>
                <label className="block text-sm font-bold text-slate-300 mb-2">Backend URL</label>
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
                        {checking ? '...' : 'Test'}
                    </button>
                </div>
                
                {testResult === 'ok' && (
                    <div className="mt-2 text-emerald-400 text-xs flex items-center gap-1">
                        <CheckCircle size={12} /> Connection Successful
                    </div>
                )}
                {testResult === 'fail' && (
                    <div className="mt-2 text-red-400 text-xs flex items-center gap-1">
                        <AlertCircle size={12} /> Connection Failed. Check if python script is running.
                    </div>
                )}
            </div>

            {/* Thresholds */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">Confidence Threshold</label>
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
                    <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">NMS IoU Threshold</label>
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

            <div className="bg-slate-900/50 p-3 rounded text-xs text-slate-400">
                <p>Run <code>python backend.py</code> in your terminal.</p>
                <p className="mt-1">Press <kbd className="bg-slate-700 text-white px-1 rounded">T</kbd> to detect.</p>
            </div>
            
            <div className="flex justify-end">
                <button 
                    onClick={onClose}
                    className={`px-4 py-2 rounded font-bold transition-colors ${isBackendConnected ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'}`}
                >
                    {isBackendConnected ? 'Connected & Ready' : 'Close'}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};
