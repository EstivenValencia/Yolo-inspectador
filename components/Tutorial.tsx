import React, { useState } from 'react';
import { X, ArrowRight, MousePointerClick, BoxSelect, Edit3, Save, ChevronLeft, LayoutGrid, Settings, FolderOutput } from 'lucide-react';
import { translations } from '../utils/translations';

interface TutorialProps {
  onClose: () => void;
  lang: 'en' | 'es';
}

export const Tutorial: React.FC<TutorialProps> = ({ onClose, lang = 'en' }) => {
  const [step, setStep] = useState(0);
  const t = translations[lang].tutorial;

  const steps = [
    {
      title: t.step1Title,
      icon: <BoxSelect size={48} className="text-indigo-400" />,
      content: t.step1Content,
    },
    {
      title: t.step2Title,
      icon: <LayoutGrid size={48} className="text-emerald-400" />,
      content: t.step2Content
    },
    {
      title: t.step3Title,
      icon: <MousePointerClick size={48} className="text-amber-400" />,
      content: (
        <div className="text-left space-y-2 text-sm bg-slate-900/50 p-4 rounded-lg border border-slate-700">
           <p className="mb-2 text-slate-300">{t.step3Content}</p>
           <ul className="space-y-1 font-mono text-xs">
              <li><span className="text-indigo-400">•</span> {t.shortcuts.nav}</li>
              <li><span className="text-emerald-400">•</span> {t.shortcuts.edit}</li>
              <li><span className="text-blue-400">•</span> {t.shortcuts.view}</li>
              <li><span className="text-amber-400">•</span> {t.shortcuts.model}</li>
           </ul>
        </div>
      )
    },
    {
      title: t.step4Title,
      icon: <Settings size={48} className="text-blue-400" />,
      content: t.step4Content,
    },
    {
        title: t.step5Title,
        icon: <FolderOutput size={48} className="text-purple-400" />,
        content: t.step5Content
    }
  ];

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
          <X size={24} />
        </button>
        
        <div className="absolute top-4 left-6 text-xs font-bold text-slate-500 uppercase tracking-widest">
            {t.title}
        </div>

        <div className="p-8 flex flex-col items-center text-center flex-1 mt-6">
          <div className="mb-6 bg-slate-700/50 p-6 rounded-full ring-4 ring-slate-700/30">
            {steps[step].icon}
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-4">{steps[step].title}</h2>
          <div className="text-slate-300 leading-relaxed mb-4 text-sm">
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
                     <ChevronLeft size={16} /> {t.back}
                   </button>
                )}
                <button 
                  onClick={() => {
                      if (step < steps.length - 1) setStep(s => s + 1);
                      else onClose();
                  }}
                  className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-indigo-500/20 transition-all"
                >
                  {step === steps.length - 1 ? t.close : t.next} <ArrowRight size={16} />
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};