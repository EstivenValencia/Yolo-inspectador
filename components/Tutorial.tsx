import React, { useState } from 'react';
import { X, ArrowRight, MousePointerClick, BoxSelect, Edit3, Save, ChevronLeft } from 'lucide-react';

interface TutorialProps {
  onClose: () => void;
}

export const Tutorial: React.FC<TutorialProps> = ({ onClose }) => {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "Welcome to YOLO Inspector",
      icon: <BoxSelect size={48} className="text-indigo-400" />,
      content: "This tool helps you validate and correct object detection datasets right in your browser. All changes are saved directly to your hard drive.",
    },
    {
      title: "Navigation & Zoom",
      icon: <MousePointerClick size={48} className="text-emerald-400" />,
      content: (
        <ul className="text-left space-y-2 text-sm">
          <li>• <strong>Pan:</strong> Click and drag the image.</li>
          <li>• <strong>Zoom:</strong> Hold <kbd className="bg-slate-700 px-1 rounded">Ctrl</kbd> + Scroll Wheel.</li>
          <li>• <strong>Next/Prev Image:</strong> Use <kbd className="bg-slate-700 px-1 rounded">A</kbd> and <kbd className="bg-slate-700 px-1 rounded">D</kbd> keys.</li>
          <li>• <strong>Next/Prev Defect:</strong> Use <kbd className="bg-slate-700 px-1 rounded">W</kbd> and <kbd className="bg-slate-700 px-1 rounded">S</kbd> keys.</li>
        </ul>
      )
    },
    {
      title: "Creating & Editing",
      icon: <Edit3 size={48} className="text-amber-400" />,
      content: (
        <ul className="text-left space-y-2 text-sm">
          <li>• <strong>Create Box:</strong> Press <kbd className="bg-slate-700 px-1 rounded">E</kbd> to enter creation mode, then click and drag.</li>
          <li>• <strong>Edit Class:</strong> Select a box and press <kbd className="bg-slate-700 px-1 rounded">R</kbd> to change its class.</li>
          <li>• <strong>Delete:</strong> Press <kbd className="bg-slate-700 px-1 rounded">Q</kbd> to remove a selected box.</li>
          <li>• <strong>Resize:</strong> Drag the corners of any selected box.</li>
        </ul>
      )
    },
    {
      title: "Auto-Saving",
      icon: <Save size={48} className="text-blue-400" />,
      content: "There is no save button! Every time you modify a box, the corresponding .txt file in your Labels folder is updated instantly.",
    }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
          <X size={24} />
        </button>

        <div className="p-8 flex flex-col items-center text-center flex-1">
          <div className="mb-6 bg-slate-700/50 p-6 rounded-full ring-4 ring-slate-700/30">
            {steps[step].icon}
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-4">{steps[step].title}</h2>
          <div className="text-slate-300 leading-relaxed mb-8">
            {steps[step].content}
          </div>
        </div>

        <div className="p-6 bg-slate-900/50 border-t border-slate-700 flex justify-between items-center">
            <div className="flex gap-1">
                {steps.map((_, i) => (
                    <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-indigo-500' : 'w-2 bg-slate-600'}`} />
                ))}
            </div>

            <div className="flex gap-3">
                {step > 0 && (
                     <button 
                     onClick={() => setStep(s => s - 1)}
                     className="px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-700 transition-colors font-medium text-sm flex items-center gap-1"
                   >
                     <ChevronLeft size={16} /> Back
                   </button>
                )}
                <button 
                  onClick={() => {
                      if (step < steps.length - 1) setStep(s => s + 1);
                      else onClose();
                  }}
                  className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-indigo-500/20 transition-all"
                >
                  {step === steps.length - 1 ? "Get Started" : "Next"} <ArrowRight size={16} />
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};