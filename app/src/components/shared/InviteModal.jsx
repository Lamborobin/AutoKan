import { useEffect, useState } from 'react';
import { X, UserPlus, Trash2, Copy, Check, Mail } from 'lucide-react';
import { invitesApi } from '../../api';
import { formatDistanceToNow } from 'date-fns';

export default function InviteModal({ onClose }) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [invites, setInvites] = useState([]);
  const [feedback, setFeedback] = useState(null); // { type: 'success'|'error'|'link', message, link? }
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    invitesApi.list().then(setInvites).catch(() => {});
  }, []);

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setSending(true);
    setFeedback(null);
    try {
      const result = await invitesApi.send(trimmed);
      setEmail('');
      setInvites(prev => {
        const exists = prev.find(i => i.id === result.invite.id);
        return exists ? prev : [result.invite, ...prev];
      });
      if (result.warning) {
        setFeedback({ type: 'link', message: result.warning, link: result.inviteUrl });
      } else {
        setFeedback({ type: 'success', message: `Invite sent to ${trimmed}` });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.response?.data?.error || 'Failed to send invite' });
    } finally {
      setSending(false);
    }
  }

  async function handleRevoke(id) {
    try {
      await invitesApi.remove(id);
      setInvites(prev => prev.filter(i => i.id !== id));
    } catch {}
  }

  function copyLink(link) {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md bg-surface-1 border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <UserPlus size={15} className="text-accent" />
            <span className="text-sm font-semibold text-gray-200">Invite team member</span>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-300 transition-colors p-0.5">
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-5 p-5 overflow-y-auto max-h-[70vh]">

          {/* Send invite form */}
          <form onSubmit={handleSend} className="flex flex-col gap-3">
            <label className="text-xs font-medium text-gray-400">Email address</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50 transition-colors"
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !email.trim()}
                className="px-3 py-2 bg-accent hover:bg-accent/80 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Mail size={12} />
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>

            {feedback && (
              <div className={`px-3 py-2 rounded-lg text-xs border ${
                feedback.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' :
                feedback.type === 'error'   ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                                             'bg-amber-500/10 border-amber-500/20 text-amber-300'
              }`}>
                {feedback.message}
                {feedback.link && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      readOnly
                      value={feedback.link}
                      className="flex-1 bg-surface-3 border border-border rounded px-2 py-1 text-[10px] text-gray-400 font-mono outline-none"
                      onClick={e => e.target.select()}
                    />
                    <button
                      type="button"
                      onClick={() => copyLink(feedback.link)}
                      className="flex items-center gap-1 px-2 py-1 bg-surface-3 border border-border rounded text-[10px] text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      {copied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </form>

          {/* Pending invites list */}
          {invites.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Pending invites</span>
              <div className="flex flex-col gap-1.5">
                {invites.map(invite => (
                  <div key={invite.id} className={`flex items-center gap-3 px-3 py-2.5 bg-surface-2 border rounded-lg ${
                    invite.is_expired || invite.used_at ? 'border-border opacity-50' : 'border-border'
                  }`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-200 font-medium truncate">{invite.email}</div>
                      <div className="text-[10px] text-gray-600 mt-0.5">
                        {invite.used_at
                          ? `Accepted ${formatDistanceToNow(new Date(invite.used_at), { addSuffix: true })}`
                          : invite.is_expired
                          ? 'Expired'
                          : `Expires ${formatDistanceToNow(new Date(invite.expires_at), { addSuffix: true })}`
                        }
                        {invite.invited_by_name && (
                          <span className="text-gray-700"> · by {invite.invited_by_name}</span>
                        )}
                      </div>
                    </div>
                    {!invite.used_at && (
                      <button
                        onClick={() => handleRevoke(invite.id)}
                        className="text-gray-600 hover:text-red-400 transition-colors p-0.5 shrink-0"
                        title="Revoke invite"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {invites.length === 0 && (
            <p className="text-xs text-gray-600 text-center py-2">No invites sent yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
