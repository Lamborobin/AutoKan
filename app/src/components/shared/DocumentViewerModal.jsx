import { useState, useEffect } from 'react';
import { X, Download, Loader2 } from 'lucide-react';
import { tasksApi } from '../../api';

// Fetches a produced/verified document (agentRunner.js's produce_document/
// verify_document write task.metadata.produced_document_path / verified_document_path)
// and shows it raw in a modal. Rendered as preformatted text rather than through
// MarkdownText — that renderer only handles bold/lists/paragraphs, not the headers
// and tables a real document uses, and raw markdown is the accurate source anyway.
export default function DocumentViewerModal({ taskId, field, filename, onClose }) {
  const [content, setContent] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    tasksApi.getDocument(taskId, field)
      .then(text => { if (!cancelled) setContent(text); })
      .catch(err => { if (!cancelled) setError(err.response?.data?.error || 'Could not load the document'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [taskId, field]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-fade-in" data-modal-backdrop="static">
      <div className="bg-surface-1 border border-border rounded-xl w-full max-w-2xl shadow-xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-sm font-medium text-gray-200 truncate font-mono">{filename || 'Document'}</h2>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => tasksApi.downloadDocument(taskId, field, filename)}
              className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg bg-surface-3 text-gray-300 border border-border hover:text-gray-100 transition-colors"
            >
              <Download size={12} /> Download
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-surface-3 transition-colors" aria-label="Close">
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && <p className="text-sm text-gray-600 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading…</p>}
          {!loading && error && <p className="text-sm text-red-400">{error}</p>}
          {!loading && !error && (
            <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{content}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
