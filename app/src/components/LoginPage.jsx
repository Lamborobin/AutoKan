import { useEffect, useState, useRef } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useStore } from '../store';
import { invitesApi } from '../api';
import heroImg from '../assets/images/hero.png';

// ── Animated kanban preview ──────────────────────────────────────────────────

const COLS = [
  { id: 'backlog',  label: 'Backlog',     color: '#6366f1' },
  { id: 'inprog',  label: 'In Progress',  color: '#ec4899' },
  { id: 'review',  label: 'Review',       color: '#f59e0b' },
  { id: 'done',    label: 'Done',         color: '#10b981' },
];

const INITIAL_CARDS = [
  { id: 1, title: 'Design system setup',      col: 'done',    tag: 'UI',      tagColor: '#6366f1' },
  { id: 2, title: 'Auth flow & login page',   col: 'done',    tag: 'Backend', tagColor: '#3b82f6' },
  { id: 3, title: 'Kanban board UI',          col: 'review',  tag: 'UI',      tagColor: '#6366f1' },
  { id: 4, title: 'Agent runner service',     col: 'inprog',  tag: 'Backend', tagColor: '#3b82f6' },
  { id: 5, title: 'Planning clarification flow', col: 'inprog',  tag: 'Agent',   tagColor: '#a855f7' },
  { id: 6, title: 'Notification system',      col: 'backlog', tag: 'Backend', tagColor: '#3b82f6' },
  { id: 7, title: 'Mobile responsive layout', col: 'backlog', tag: 'UI',      tagColor: '#6366f1' },
  { id: 8, title: 'Analytics dashboard',      col: 'backlog', tag: 'Feature', tagColor: '#f59e0b' },
];

const MOVE_SEQUENCE = [
  { cardId: 6, to: 'inprog'  },
  { cardId: 3, to: 'done'    },
  { cardId: 7, to: 'inprog'  },
  { cardId: 5, to: 'review'  },
  { cardId: 8, to: 'inprog'  },
  { cardId: 7, to: 'review'  },
  { cardId: 6, to: 'review'  },
  { cardId: 4, to: 'review'  },
];

function KanbanPreview() {
  const [cards, setCards] = useState(INITIAL_CARDS);
  const [activeCard, setActiveCard] = useState(null);
  const stepRef = useRef(0);

  useEffect(() => {
    const tick = () => {
      const step = MOVE_SEQUENCE[stepRef.current % MOVE_SEQUENCE.length];
      setActiveCard(step.cardId);
      setTimeout(() => {
        setCards(prev => prev.map(c => c.id === step.cardId ? { ...c, col: step.to } : c));
        setActiveCard(null);
        stepRef.current += 1;
      }, 700);
    };
    const interval = setInterval(tick, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full h-full flex flex-col p-5 gap-4 select-none" aria-hidden="true">
      {/* Top bar */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <span className="text-[11px] font-semibold text-gray-300 tracking-wide">Project Board</span>
        </div>
        <div className="flex items-center gap-1.5">
          {['#6366f1','#ec4899','#10b981'].map(c => (
            <div key={c} className="w-5 h-5 rounded-full border border-white/10" style={{ background: c + '40' }} />
          ))}
        </div>
      </div>

      {/* Columns */}
      <div className="flex gap-3 flex-1 min-h-0 overflow-hidden">
        {COLS.map(col => {
          const colCards = cards.filter(c => c.col === col.id);
          return (
            <div key={col.id} className="flex-1 flex flex-col gap-2 min-w-0">
              {/* Column header */}
              <div className="flex items-center gap-1.5 mb-1 shrink-0">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: col.color }} />
                <span className="text-[10px] font-medium text-gray-400 truncate">{col.label}</span>
                <span className="ml-auto text-[10px] text-gray-600">{colCards.length}</span>
              </div>
              {/* Cards */}
              <div className="flex flex-col gap-1.5 flex-1 overflow-hidden">
                {colCards.map(card => (
                  <div
                    key={card.id}
                    className="rounded-lg px-2.5 py-2 border transition-all duration-500"
                    style={{
                      background: activeCard === card.id ? col.color + '18' : 'rgba(255,255,255,0.03)',
                      borderColor: activeCard === card.id ? col.color + '60' : 'rgba(255,255,255,0.06)',
                      boxShadow: activeCard === card.id ? `0 0 12px ${col.color}30` : 'none',
                      transform: activeCard === card.id ? 'scale(1.02)' : 'scale(1)',
                    }}
                  >
                    <p className="text-[10px] text-gray-300 leading-tight truncate mb-1.5">{card.title}</p>
                    <span
                      className="text-[8px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: card.tagColor + '20', color: card.tagColor }}
                    >
                      {card.tag}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom status bar */}
      <div className="flex items-center justify-between shrink-0 pt-1 border-t border-white/[0.05]">
        <span className="text-[10px] text-gray-600">{cards.length} tasks · 3 agents active</span>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[10px] text-gray-600">Live</span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage({ inviteToken }) {
  const { googleLogin, authError } = useStore();
  const [inviteState, setInviteState] = useState(null);

  useEffect(() => {
    if (!inviteToken) return;
    setInviteState({ loading: true });
    invitesApi.verify(inviteToken).then(result => {
      if (result.valid) {
        setInviteState({ valid: true, email: result.email });
      } else {
        const reasons = {
          not_found:    'This invite link is invalid.',
          expired:      'This invite link has expired. Ask for a new one.',
          already_used: 'This invite link has already been used.',
        };
        setInviteState({ error: reasons[result.reason] || 'This invite link is not valid.' });
      }
    }).catch(() => {
      setInviteState({ error: 'Could not verify invite link. Please try again.' });
    });
  }, [inviteToken]);

  // Left-align the Google button text once it renders into the DOM
  useEffect(() => {
    const apply = () => {
      const btn = document.querySelector('.google-btn-wrap [role="button"]');
      if (!btn) return false;
      btn.style.textAlign = 'left';
      return true;
    };
    if (apply()) return;
    const observer = new MutationObserver(() => { if (apply()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const isInviteFlow  = !!inviteToken;
  const inviteValid   = inviteState?.valid;
  const inviteError   = inviteState?.error;
  const inviteLoading = inviteState?.loading;

  return (
    <div className="min-h-screen bg-[#080810] flex flex-col relative overflow-hidden">

      {/* ── Aurora background blobs ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-8%]  w-[640px] h-[640px] rounded-full bg-indigo-500/[0.16] blur-[90px] animate-blob-1" style={{ willChange: 'transform', transform: 'translateZ(0)' }} />
        <div className="absolute bottom-[-15%] left-[20%] w-[560px] h-[560px] rounded-full bg-violet-600/[0.13] blur-[80px] animate-blob-2" style={{ willChange: 'transform', transform: 'translateZ(0)' }} />
        <div className="absolute top-[10%] right-[-12%] w-[500px] h-[500px] rounded-full bg-blue-500/[0.11] blur-[75px] animate-blob-3" style={{ willChange: 'transform', transform: 'translateZ(0)' }} />
      </div>

      {/* ── Jumbo hero ── */}
      <div className="relative z-10 flex flex-col items-center justify-center pt-14 pb-10 px-4">
        <div className="relative flex items-center justify-center w-28 h-28 mb-5">
          <div className="absolute inset-0 rounded-full animate-spin-reverse pointer-events-none"
            style={{ border: '1px dashed rgba(99,102,241,0.28)', transform: 'scale(1.55)' }} />
          <div className="absolute inset-0 rounded-full animate-spin-slow pointer-events-none"
            style={{
              background: 'conic-gradient(from 0deg, rgba(99,102,241,0.6) 0%, rgba(139,92,246,0.4) 20%, transparent 50%, rgba(99,102,241,0.1) 80%, rgba(99,102,241,0.6) 100%)',
              transform: 'scale(1.28)', borderRadius: '50%',
              mask: 'radial-gradient(transparent 88%, black 89%)',
              WebkitMask: 'radial-gradient(transparent 88%, black 89%)',
            }} />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="animate-orbit-dot">
              <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_6px_2px_rgba(99,102,241,0.8)]" />
            </div>
          </div>
          {/* Glow layer — opacity only, fully GPU composited */}
          <div
            className="absolute inset-0 rounded-full animate-logo-glow pointer-events-none z-10"
            style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.45) 0%, rgba(139,92,246,0.25) 50%, transparent 70%)', filter: 'blur(18px)' }}
          />
          <img src={heroImg} alt="AutoKan" className="w-full h-full object-contain relative z-20" />
        </div>
        <h1
          className="text-3xl sm:text-4xl font-bold tracking-tight select-none animate-shimmer mb-3"
          style={{
            backgroundImage: 'linear-gradient(90deg, #a5b4fc 0%, #818cf8 20%, #c4b5fd 40%, #6366f1 60%, #a78bfa 80%, #a5b4fc 100%)',
            backgroundSize: '300% auto',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
          }}
        >AutoKan</h1>
        <p className="text-base text-gray-500 tracking-wide">Autonomous AI task orchestration</p>
      </div>

      {/* ── Two columns ── */}
      <div className="relative z-10 flex flex-col lg:flex-row items-stretch justify-center gap-6 px-4 sm:px-8 lg:px-10 pb-12 w-full max-w-5xl mx-auto">

        {/* ── Left: login ── */}
        <div className="w-full lg:w-80 xl:w-96 shrink-0 group">
          <div className="
            bg-white/[0.04] border border-white/[0.08] rounded-2xl px-6 py-8 sm:p-8
            flex flex-col gap-6 backdrop-blur-sm shadow-2xl h-full justify-center text-left
            transition-all duration-300
            hover:border-white/[0.14] hover:shadow-[0_0_50px_rgba(99,102,241,0.12)]
          ">

            {inviteLoading ? (
              <p className="text-sm text-gray-500">Verifying invite…</p>
            ) : inviteValid ? (
              <div className="flex flex-col gap-1">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 mb-2">
                  <span className="text-lg">🎉</span>
                </div>
                <h2 className="text-xl font-semibold text-gray-100">You've been invited!</h2>
                <p className="text-sm text-gray-500">
                  Sign in with the Google account for{' '}
                  <span className="text-gray-300 font-medium">{inviteState.email}</span>
                </p>
              </div>
            ) : inviteError ? (
              <div className="flex flex-col gap-3">
                <h2 className="text-xl font-semibold text-gray-100">Sign in to continue</h2>
                <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                  {inviteError}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-semibold text-gray-100">Sign in to continue</h2>
                <p className="text-sm text-gray-600">Access your boards and agents</p>
              </div>
            )}

            {authError && (
              <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                {authError}
              </div>
            )}

            {!inviteLoading && (
              <div className="flex flex-col gap-4">
                {/* Google button — full width */}
                <div className="google-btn-wrap relative w-full overflow-hidden rounded-lg group/btn">
                  <GoogleLogin
                    onSuccess={({ credential }) => googleLogin(credential)}
                    onError={() => useStore.getState().setAuthError('Google sign-in failed. Please try again.')}
                    theme="filled_black"
                    shape="rectangular"
                    size="large"
                    text={isInviteFlow ? 'signin_with' : 'continue_with'}
                    width="320"
                  />
                  {/* Overlay to cancel Google's gray hover tint */}
                  <div className="absolute inset-0 rounded-lg pointer-events-none bg-black/0 group-hover/btn:bg-black/40 transition-colors duration-300" />
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  By signing in you agree to use this tool responsibly.<br />
                  Your data stays on your own server.
                </p>
              </div>
            )}

          </div>
        </div>

        {/* ── Right: product preview ── */}
        <div className="hidden lg:flex flex-1 min-h-[420px]">
          <div className="w-full border border-white/[0.06] rounded-2xl overflow-hidden relative bg-[#0d0d14]">
            <KanbanPreview />
          </div>
        </div>

      </div>

      {/* Footer */}
      <p className="relative z-10 text-xs text-gray-500 text-center pb-8">
        AutoKan · Built for humans &amp; AI agents
      </p>
    </div>
  );
}
