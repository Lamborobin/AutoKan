import { X } from 'lucide-react';
import { CONTEXT_INFO, HierarchyDiagram } from './contextInfo';

// Modal that explains what one of the three settings sections is for.
// Driven by a key (`board` / `workspace` / `ai_context`) looked up in CONTEXT_INFO.
// Pass openKey = null to close.

export default function InfoModal({ openKey, onClose }) {
  if (!openKey) return null;
  const info = CONTEXT_INFO[openKey];
  if (!info) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-surface-1 border border-border rounded-2xl w-full max-w-xl shadow-2xl max-h-[88vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-200">{info.title}</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">{info.intro}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-surface-3 transition-colors shrink-0"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="text-[12px] text-gray-400 leading-relaxed space-y-3">
            {info.body}
          </div>

          <div className="pt-2 border-t border-border">
            <HierarchyDiagram highlight={info.highlight} />
          </div>
        </div>
      </div>
    </div>
  );
}
