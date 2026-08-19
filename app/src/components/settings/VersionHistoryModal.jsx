import { useState, useEffect } from 'react';
import { Clock, RotateCcw, ChevronRight, Loader2, X } from 'lucide-react';

export function formatDate(iso) {
  if (!iso) return 'Today';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

// Shared version-history browser for any markdown file that archives prior
// versions server-side (System Behavior via docsApi, Board/Workspace/Capability
// Behavior via instructionsApi). Callers supply the fetch functions for their
// own API + scope; this component only knows how to list, preview, and restore.
export default function VersionHistoryModal({ label, fetchVersions, fetchVersion, onRestore, onClose, renderContent }) {
  const [versions, setVersions]             = useState([]);
  const [loadingList, setLoadingList]       = useState(true);
  const [preview, setPreview]               = useState(null); // { filename, content, saved_at }
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    fetchVersions()
      .then(setVersions)
      .catch(() => setVersions([]))
      .finally(() => setLoadingList(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSelectVersion(v) {
    setLoadingPreview(true);
    try {
      const data = await fetchVersion(v.filename);
      setPreview(data);
    } catch { setPreview(null); }
    finally { setLoadingPreview(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" data-modal-backdrop="static">
      <div className="bg-surface-1 border border-border rounded-xl shadow-xl flex overflow-hidden"
        style={{ width: 780, height: 520 }}>

        {/* Version list */}
        <div className="w-56 shrink-0 border-r border-border flex flex-col">
          <div className="px-4 py-3.5 border-b border-border shrink-0">
            <p className="text-base font-semibold text-gray-200">Version history</p>
            <p className="text-xs text-gray-500 mt-0.5">{label} · up to {10} versions</p>
          </div>
          <div className="flex-1 overflow-y-auto py-1.5">
            {loadingList ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={14} className="animate-spin text-gray-600" />
              </div>
            ) : versions.length === 0 ? (
              <p className="text-sm text-gray-400 text-center px-4 py-8">No versions saved yet</p>
            ) : (
              versions.map(v => {
                const isSelected = preview?.filename === v.filename;
                return (
                  <button
                    key={v.filename}
                    onClick={() => handleSelectVersion(v)}
                    className={`w-full text-left px-4 py-2.5 transition-colors flex items-center gap-2 ${
                      isSelected ? 'bg-accent/15 text-accent' : 'text-gray-400 hover:bg-surface-3 hover:text-gray-200'
                    }`}
                  >
                    <Clock size={10} className="shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs truncate">{formatDate(v.saved_at)}</p>
                    </div>
                    {isSelected && <ChevronRight size={10} className="ml-auto shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Preview pane */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 py-3.5 border-b border-border shrink-0 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-200">
                {preview ? `Saved ${formatDate(preview.saved_at)}` : 'Select a version to preview'}
              </p>
              {preview && (
                <p className="text-xs text-gray-500 mt-0.5">Read-only snapshot</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {preview && (
                <button
                  onClick={() => { onRestore(preview.content); onClose(); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent/80 rounded-lg transition-colors"
                >
                  <RotateCcw size={11} /> Restore
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-surface-3 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {loadingPreview ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 size={16} className="animate-spin text-gray-600" />
              </div>
            ) : preview ? (
              renderContent ? renderContent(preview.content) : (
                <pre className="whitespace-pre-wrap text-xs text-gray-400 font-mono leading-relaxed">{preview.content}</pre>
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
                <Clock size={22} className="opacity-30" />
                <p className="text-sm">Select a version from the list</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
