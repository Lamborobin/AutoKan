import { useEffect, useRef, useState } from 'react';
import { Trash2, Send, Pencil, Check, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { commentsApi } from '../../api';
import { useStore } from '../../store';

const MENTION_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g;

function renderContent(text) {
  const parts = [];
  let lastIndex = 0;
  let match;
  const regex = new RegExp(MENTION_REGEX.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={lastIndex}>{text.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
      <span key={match.index} className="text-accent font-medium bg-accent/10 rounded px-1">
        @{match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(<span key={lastIndex}>{text.slice(lastIndex)}</span>);
  return parts;
}

function Avatar({ user, size = 6 }) {
  if (user.picture) {
    return <img src={user.picture} alt="" className={`w-${size} h-${size} rounded-full shrink-0 ring-1 ring-border`} />;
  }
  return (
    <div className={`w-${size} h-${size} rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-[9px] font-bold text-accent shrink-0`}>
      {((user.first_name?.[0] || user.email?.[0] || '?')).toUpperCase()}
    </div>
  );
}

export default function TaskComments({ taskId }) {
  const { user, users } = useStore();
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState('');
  const [mentions, setMentions] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(''); // [{name, id}] — selected from dropdown
  const [submitting, setSubmitting] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    commentsApi.list(taskId).then(setComments).catch(() => {});
  }, [taskId]);

  const filteredUsers = users.filter(u => {
    if (!mentionQuery) return true;
    const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
    return name.includes(mentionQuery.toLowerCase()) || u.email.toLowerCase().includes(mentionQuery.toLowerCase());
  }).slice(0, 6);

  function handleTextareaChange(e) {
    const val = e.target.value;
    setDraft(val);

    const cursor = e.target.selectionStart;
    const textBefore = val.slice(0, cursor);
    const mentionMatch = textBefore.match(/@(\w*)$/);
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1]);
      setShowMentions(true);
      setMentionIndex(0);
    } else {
      setShowMentions(false);
      setMentionQuery('');
    }
  }

  function insertMention(u) {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart;
    const textBefore = draft.slice(0, cursor);
    const textAfter = draft.slice(cursor);
    const mentionMatch = textBefore.match(/@(\w*)$/);
    const replaceStart = mentionMatch ? cursor - mentionMatch[0].length : cursor;
    const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;
    // Show clean @Name in textarea; convert to @[Name](id) on submit
    const mention = `@${fullName} `;
    const newDraft = draft.slice(0, replaceStart) + mention + textAfter;
    setDraft(newDraft);
    setMentions(prev => [...prev, { name: fullName, id: u.id }]);
    setShowMentions(false);
    setMentionQuery('');
    setTimeout(() => {
      ta.focus();
      const pos = replaceStart + mention.length;
      ta.setSelectionRange(pos, pos);
    }, 0);
  }

  function handleKeyDown(e) {
    if (!showMentions) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionIndex(i => Math.min(i + 1, filteredUsers.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (filteredUsers[mentionIndex]) {
        e.preventDefault();
        insertMention(filteredUsers[mentionIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowMentions(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    let content = draft.trim();
    if (!content || submitting) return;

    // Convert display mentions (@Name) → storage format (@[Name](id)) before posting
    // Sort longest-name-first to avoid partial replacements (e.g. "Rob" inside "Robin")
    const sortedMentions = [...mentions].sort((a, b) => b.name.length - a.name.length);
    for (const m of sortedMentions) {
      content = content.replaceAll(`@${m.name}`, `@[${m.name}](${m.id})`);
    }

    setSubmitting(true);
    try {
      const comment = await commentsApi.create(taskId, content);
      setComments(prev => [...prev, comment]);
      setDraft('');
      setMentions([]);
      setShowMentions(false);
    } catch {}
    setSubmitting(false);
  }

  function handleEditStart(c) {
    // Convert storage format @[Name](id) back to display format @Name for editing
    const display = c.content.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1');
    setEditingId(c.id);
    setEditDraft(display);
  }

  function handleEditCancel() {
    setEditingId(null);
    setEditDraft('');
  }

  async function handleEditSave(commentId) {
    let content = editDraft.trim();
    if (!content) return;
    // Re-apply mention storage format for any @Name that matches a known user
    for (const u of users) {
      const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;
      content = content.replaceAll(`@${fullName}`, `@[${fullName}](${u.id})`);
    }
    try {
      const updated = await commentsApi.update(taskId, commentId, content);
      setComments(prev => prev.map(c => c.id === commentId ? updated : c));
      setEditingId(null);
      setEditDraft('');
    } catch {}
  }

  async function handleDelete(commentId) {
    try {
      await commentsApi.remove(taskId, commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch {}
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Comments</span>
        {comments.length > 0 && (
          <span className="text-[10px] text-gray-600 bg-surface-3 px-1.5 py-0.5 rounded-md">{comments.length}</span>
        )}
      </div>

      {/* Comment list */}
      {comments.length > 0 && (
        <div className="flex flex-col gap-3">
          {comments.map(c => (
            <div key={c.id} className="flex gap-2.5 group">
              <Avatar user={c} size={6} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xs font-medium text-gray-300">
                    {`${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email}
                  </span>
                  <span className="text-[10px] text-gray-600">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </span>
                  {c.updated_at !== c.created_at && (
                    <span className="text-[10px] text-gray-700 italic">(edited)</span>
                  )}
                </div>
                {editingId === c.id ? (
                  <div className="flex flex-col gap-1">
                    <textarea
                      value={editDraft}
                      onChange={e => setEditDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleEditSave(c.id);
                        if (e.key === 'Escape') handleEditCancel();
                      }}
                      rows={2}
                      autoFocus
                      className="w-full bg-surface-2 border border-accent/40 rounded-lg px-2 py-1.5 text-xs text-gray-200 outline-none resize-none leading-relaxed"
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEditSave(c.id)}
                        className="flex items-center gap-1 px-2 py-1 bg-accent hover:bg-accent/80 text-white text-[10px] font-medium rounded-md transition-colors"
                      >
                        <Check size={9} /> Save
                      </button>
                      <button
                        onClick={handleEditCancel}
                        className="flex items-center gap-1 px-2 py-1 bg-surface-3 hover:bg-surface-2 text-gray-400 text-[10px] rounded-md transition-colors"
                      >
                        <X size={9} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 leading-relaxed break-words">
                    {renderContent(c.content)}
                  </div>
                )}
              </div>
              {user?.id === c.user_id && editingId !== c.id && (
                <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 mt-0.5 shrink-0 transition-all">
                  <button
                    onClick={() => handleEditStart(c)}
                    className="text-gray-700 hover:text-accent p-0.5"
                    title="Edit comment"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="text-gray-700 hover:text-red-400 p-0.5"
                    title="Delete comment"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 relative">
        {/* @mention dropdown */}
        {showMentions && filteredUsers.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute bottom-full mb-1 left-0 z-50 w-56 bg-surface-2 border border-border rounded-xl shadow-xl overflow-hidden"
          >
            {filteredUsers.map((u, i) => (
              <button
                key={u.id}
                type="button"
                onClick={() => insertMention(u)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  i === mentionIndex ? 'bg-accent/10 text-gray-200' : 'text-gray-400 hover:bg-surface-3'
                }`}
              >
                <Avatar user={u} size={5} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">
                    {`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email}
                  </div>
                  <div className="text-[10px] text-gray-600 truncate">{u.email}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-start">
          {user && <Avatar user={{ ...user, picture: user.picture }} size={6} />}
          <div className="flex-1 flex flex-col gap-1">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Add a comment… type @ to mention someone"
              rows={2}
              className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-accent/40 transition-colors resize-none leading-relaxed"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-700">@ to mention</span>
              <button
                type="submit"
                disabled={!draft.trim() || submitting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent/80 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors"
              >
                <Send size={10} />
                {submitting ? 'Posting…' : 'Comment'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
