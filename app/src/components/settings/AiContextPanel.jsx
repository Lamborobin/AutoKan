import { useState, useEffect } from 'react';
import {
  FileText, Lock, BookOpen, Pencil, X, AlertTriangle,
  Save, Check, Clock,
} from 'lucide-react';
import { docsApi } from '../../api';
import { useStore } from '../../store';
import VersionHistoryModal, { formatDate } from './VersionHistoryModal';

// Groups + files come entirely from the API (driven by agent.config.json)

// ─── Markdown renderer ────────────────────────────────────────────────────────
function renderInline(text) {
  const parts = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const raw = match[0];
    if (raw.startsWith('`')) {
      parts.push(
        <code key={match.index} className="px-1 py-0.5 rounded-md bg-surface-3 text-xs font-mono text-accent/90 border border-border">
          {raw.slice(1, -1)}
        </code>
      );
    } else {
      parts.push(<strong key={match.index} className="font-semibold text-gray-200">{raw.slice(2, -2)}</strong>);
    }
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

function DocMarkdown({ content }) {
  if (!content) return null;
  const lines = content.split('\n');
  const nodes = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trimStart().startsWith('```')) {
      i++;
      const codeLines = [];
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) { codeLines.push(lines[i]); i++; }
      i++;
      nodes.push(
        <pre key={key++} className="my-3 rounded-xl bg-surface-3 border border-border overflow-x-auto">
          <code className="block px-4 py-3 text-xs font-mono text-gray-300 leading-relaxed whitespace-pre">{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    if (/^---+$/.test(line.trim())) { nodes.push(<hr key={key++} className="my-4 border-border" />); i++; continue; }

    const h1 = line.match(/^# (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    const h4 = line.match(/^#### (.+)/);
    if (h1) { nodes.push(<h1 key={key++} className="text-lg font-bold text-gray-100 mt-5 mb-2">{renderInline(h1[1])}</h1>); i++; continue; }
    if (h2) { nodes.push(<h2 key={key++} className="text-base font-semibold text-gray-200 mt-4 mb-1.5">{renderInline(h2[1])}</h2>); i++; continue; }
    if (h3) { nodes.push(<h3 key={key++} className="text-sm font-semibold text-gray-300 mt-3 mb-1">{renderInline(h3[1])}</h3>); i++; continue; }
    if (h4) { nodes.push(<h4 key={key++} className="text-sm font-medium text-gray-400 mt-2 mb-1">{renderInline(h4[1])}</h4>); i++; continue; }

    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) { tableLines.push(lines[i]); i++; }
      const rows = tableLines.filter(l => !/^\s*\|[\s\-|:]+\|\s*$/.test(l));
      const parseRow = (l) => l.trim().slice(1, -1).split('|').map(c => c.trim());
      const [header, ...body] = rows;
      nodes.push(
        <div key={key++} className="my-3 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead><tr className="border-b border-border">{parseRow(header).map((cell, ci) => <th key={ci} className="text-left px-3 py-1.5 text-gray-400 font-semibold">{renderInline(cell)}</th>)}</tr></thead>
            <tbody>{body.map((row, ri) => <tr key={ri} className="border-b border-border/50 hover:bg-surface-3/30 transition-colors">{parseRow(row).map((cell, ci) => <td key={ci} className="px-3 py-1.5 text-gray-400">{renderInline(cell)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^[-*•] /.test(line.trim())) {
      const items = [];
      while (i < lines.length && (/^[-*•] /.test(lines[i].trim()) || (lines[i].trim() === '' && /^[-*•] /.test(lines[i + 1]?.trim())))) {
        if (lines[i].trim() === '') { i++; continue; }
        items.push(<li key={i} className="flex gap-2"><span className="text-gray-600 shrink-0 mt-0.5">•</span><span>{renderInline(lines[i].replace(/^[-*•] /, '').trim())}</span></li>);
        i++;
      }
      nodes.push(<ul key={key++} className="my-1.5 space-y-0.5 text-xs text-gray-400">{items}</ul>);
      continue;
    }

    if (/^\d+\. /.test(line.trim())) {
      const items = [];
      while (i < lines.length && (/^\d+\. /.test(lines[i].trim()) || (lines[i].trim() === '' && /^\d+\. /.test(lines[i + 1]?.trim())))) {
        if (lines[i].trim() === '') { i++; continue; }
        const m = lines[i].trim().match(/^(\d+)\. (.*)/);
        items.push(<li key={i} className="flex gap-2"><span className="text-gray-600 shrink-0 tabular-nums">{m[1]}.</span><span>{renderInline(m[2])}</span></li>);
        i++;
      }
      nodes.push(<ol key={key++} className="my-1.5 space-y-0.5 text-xs text-gray-400">{items}</ol>);
      continue;
    }

    if (line.trim() === '') { i++; continue; }
    nodes.push(<p key={key++} className="text-xs text-gray-400 leading-relaxed">{renderInline(line)}</p>);
    i++;
  }

  return <div className="space-y-0.5">{nodes}</div>;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AiContextPanel() {
  const { isSuperAdmin } = useStore();

  const [groups, setGroups]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selectedKey, setSelectedKey] = useState(null);

  const [editing, setEditing]         = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [savedKey, setSavedKey]       = useState(null);

  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    setLoading(true);
    docsApi.list()
      .then(setGroups)
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, []);

  // Flatten groups → files for easy lookup
  const allFiles = groups.flatMap(g => g.files);
  const selected = allFiles.find(f => f.key === selectedKey) || null;

  // Only one file total — skip the picker, go straight to its content.
  // The moment a second file is added, the list reappears on its own.
  useEffect(() => {
    const files = groups.flatMap(g => g.files);
    if (files.length === 1) setSelectedKey(files[0].key);
  }, [groups]);

  function selectDoc(key) {
    if (editing) return;
    setSelectedKey(key);
    setSaveError('');
    setSavedKey(null);
  }

  function handleEditClick() {
    if (!selected) return;
    setEditContent(selected.content);
    setEditing(true);
    setSaveError('');
  }

  function handleCancelEdit() {
    setEditing(false);
    setEditContent('');
    setSaveError('');
    setShowConfirm(false);
  }

  // Called from version history modal — pre-fills edit mode with restored content
  function handleRestore(content) {
    setEditContent(content);
    setEditing(true);
    setSaveError('');
  }

  async function handleConfirmSave() {
    if (!selected) return;
    setSaving(true);
    setSaveError('');
    setShowConfirm(false);
    try {
      const { last_modified } = await docsApi.update(selected.key, editContent);
      setGroups(prev => prev.map(g => ({
        ...g,
        files: g.files.map(f =>
          f.key === selected.key ? { ...f, content: editContent, last_modified } : f
        ),
      })));
      setSavedKey(selected.key);
      setEditing(false);
      setEditContent('');
      setTimeout(() => setSavedKey(null), 3000);
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── File list — hidden when there's only one file total ─────────────── */}
      {allFiles.length > 1 && (
      <div className="w-52 shrink-0 border-r border-border overflow-y-auto py-3 px-2 space-y-4">
        {loading ? (
          <p className="text-xs text-gray-600 px-2">Loading…</p>
        ) : (
          groups.map(group => (
            <div key={group.key}>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest px-2 mb-1">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.files.map(file => {
                  const isSelected = selectedKey === file.key;
                  return (
                    <button
                      key={file.key}
                      onClick={() => selectDoc(file.key)}
                      disabled={editing && !isSelected}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                        isSelected
                          ? 'bg-accent/15 text-accent'
                          : editing
                          ? 'text-gray-600 cursor-not-allowed'
                          : 'text-gray-400 hover:bg-surface-3 hover:text-gray-200'
                      }`}
                    >
                      <FileText size={11} className="shrink-0" />
                      <span className="text-xs truncate">{file.label}</span>
                      {savedKey === file.key && (
                        <Check size={9} className="ml-auto shrink-0 text-green-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
      )}

      {/* ── Content panel ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 px-8 py-4 border-b border-border shrink-0">
              <FileText size={14} className="text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-gray-200">{selected.label}</h2>
                  {!editing ? (
                    <span className="flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full bg-surface-3 text-gray-500 border border-border uppercase tracking-wide">
                      <Lock size={8} className="text-amber-400" /> read only
                    </span>
                  ) : (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 uppercase tracking-wide">
                      editing
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-0.5">
                  Last updated {formatDate(selected.last_modified)}
                </p>
              </div>

              {/* Actions */}
              {isSuperAdmin && !editing && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowHistory(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-surface-3 rounded-lg transition-colors"
                  >
                    <Clock size={11} /> History
                  </button>
                  <button
                    onClick={handleEditClick}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-surface-3 rounded-lg transition-colors"
                  >
                    <Pencil size={11} className="text-accent" /> Edit
                  </button>
                </div>
              )}
              {editing && (
                <div className="flex items-center gap-2">
                  {saveError && <span className="text-xs text-red-400">{saveError}</span>}
                  <button
                    onClick={() => setShowConfirm(true)}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent/80 rounded-lg transition-colors disabled:opacity-40"
                  >
                    <Save size={11} /> {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-100 hover:bg-surface-3 rounded-lg transition-colors"
                  >
                    <X size={11} /> Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Edit warning banner */}
            {editing && (
              <div className="shrink-0 flex items-start gap-2.5 px-8 py-3 bg-amber-500/8 border-b border-amber-500/20">
                <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-400/90 leading-relaxed">
                  You are editing a system context file. Changes take effect immediately on the next agent run and will affect <strong className="text-amber-400">all agents across all boards</strong>. Incorrect changes can break agent behavior entirely.
                </p>
              </div>
            )}

            {/* Content */}
            {editing ? (
              <textarea
                className="flex-1 w-full bg-surface-0 text-gray-300 text-sm leading-relaxed px-8 py-6 outline-none resize-none"
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                spellCheck={false}
                autoFocus
              />
            ) : (
              <div className="flex-1 overflow-y-auto px-8 py-6">
                <DocMarkdown content={selected.content} />
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-600 gap-3">
            <BookOpen size={28} className="opacity-30" />
            <p className="text-sm font-medium text-gray-500">Select a file to view</p>
            <p className="text-sm text-gray-600 max-w-xs">
              Read-only context files that guide agent behavior across all boards.
            </p>
          </div>
        )}
      </div>

      {/* ── Save confirmation modal ───────────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" data-modal-backdrop="static">
          <div className="bg-surface-1 border border-border rounded-xl w-96 shadow-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                <AlertTriangle size={15} className="text-amber-400" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-200">Save changes to {selected?.label}?</p>
                <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                  This will immediately update the context file used by all agents. Any running or future agent run will pick up these changes — incorrect edits can break existing and future agent behavior across all boards.
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleConfirmSave}
                className="flex-1 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
              >
                Yes, save changes
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2 text-sm text-gray-400 hover:text-gray-200 rounded-lg border border-border transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Version history modal ─────────────────────────────────────────── */}
      {showHistory && selected && (
        <VersionHistoryModal
          label={selected.label}
          fetchVersions={() => docsApi.versions(selected.key)}
          fetchVersion={(filename) => docsApi.getVersion(selected.key, filename)}
          onRestore={handleRestore}
          onClose={() => setShowHistory(false)}
          renderContent={(content) => <DocMarkdown content={content} />}
        />
      )}
    </div>
  );
}
