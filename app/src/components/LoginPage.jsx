import { useEffect, useState, useRef } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useStore } from '../store';
import { invitesApi } from '../api';
import heroImg from '../assets/images/hero.png';

// ── Animated kanban preview ──────────────────────────────────────────────────

const COLS = [
  { id: 'backlog',  label: 'Backlog',     color: '#6366f1' },
  { id: 'inprog',  label: 'In Progress',  color: '#ec4899' },
  { id: 'review',  label: 'Human Review',       color: '#f59e0b' },
  { id: 'done',    label: 'Done',         color: '#10b981' },
];

const INITIAL_CARDS = [
  { id: 1, title: 'Design system setup',      col: 'done',    tag: 'UI',      tagColor: '#6366f1' },
  { id: 2, title: 'Auth flow & login page',   col: 'done',    tag: 'Backend', tagColor: '#3b82f6' },
  { id: 3, title: 'Kanban board UI',          col: 'review',  tag: 'UI',      tagColor: '#6366f1' },
  { id: 4, title: 'Agent runner service',     col: 'inprog',  tag: 'Backend', tagColor: '#3b82f6' },
  { id: 5, title: 'Planning clarification flow', col: 'inprog',  tag: 'Test',   tagColor: '#a855f7' },
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
          <span className="text-xs font-semibold text-gray-300 tracking-wide">Project Board</span>
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
                <span className="text-xs font-medium text-gray-400 truncate">{col.label}</span>
                <span className="ml-auto text-xs text-gray-600">{colCards.length}</span>
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
                    <p className="text-xs text-gray-300 leading-tight truncate mb-1.5">{card.title}</p>
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full font-medium"
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

      {/* ── Aurora wash ── One slow drift on the largest blob is the only ambient
           motion on this screen; the other two are static so the page reads as a
           product, not a screensaver. */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-8%]  w-[640px] h-[640px] rounded-full bg-indigo-500/[0.14] blur-[90px] animate-blob-1 motion-reduce:animate-none" style={{ willChange: 'transform', transform: 'translateZ(0)' }} />
        <div className="absolute bottom-[-15%] left-[20%] w-[560px] h-[560px] rounded-full bg-violet-600/[0.10] blur-[80px]" />
        <div className="absolute top-[10%] right-[-12%] w-[500px] h-[500px] rounded-full bg-blue-500/[0.08] blur-[75px]" />
      </div>

      {/* ── Hero ── */}
      <div className="relative z-10 flex flex-col items-center justify-center pt-14 pb-10 px-4">
        <div className="relative flex items-center justify-center w-24 h-24 mb-5">
          {/* Static glow behind the mark — depth without a loop */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none z-10"
            style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.35) 0%, rgba(139,92,246,0.18) 50%, transparent 70%)', filter: 'blur(18px)' }}
          />
          <img src={heroImg} alt="AutoKan" className="w-full h-full object-contain relative z-20" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-100 select-none mb-3">
          AutoKan
        </h1>
        <p className="text-base text-gray-400">Autonomous AI task orchestration</p>
      </div>

      {/* ── Two columns ── */}
      <div className="relative z-10 flex flex-col lg:flex-row items-stretch justify-center gap-6 px-4 sm:px-8 lg:px-10 pb-12 w-full max-w-6xl mx-auto">

        {/* ── Left: login ── */}
        <div className="w-full lg:w-80 xl:w-96 shrink-0 group">
          <div className="
            bg-white/[0.04] border border-white/[0.08] rounded-xl px-6 py-8 2
            flex flex-col gap-6 backdrop-blur-sm shadow-xl h-full justify-center text-left
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
                <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400">
                  {inviteError}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-semibold text-gray-100">Sign in to continue</h2>
                <p className="text-sm text-gray-400">Access your boards and agents</p>
              </div>
            )}

            {authError && (
              <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                {authError}
              </div>
            )}

            {!inviteLoading && (
              <div className="flex flex-col gap-4">
                {/* Google button — full width */}
                <div className="google-btn-wrap relative w-full overflow-hidden group/btn">
                  <GoogleLogin
                    onSuccess={({ credential }) => googleLogin(credential)}
                    onError={() => useStore.getState().setAuthError('Google sign-in failed. Please try again.')}
                    theme="filled_black"
                    shape="rectangular"
                    size="large"
                    text={isInviteFlow ? 'signin_with' : 'continue_with'}
                    width="320"
                  />
                  {/* Google's own hover tint lives inside a cross-origin iframe we can't
                      restyle — smother it with an opaque overlay, then draw the app's own
                      accent-tinted hover on top so the button matches the rest of the UI. */}
                  <div className="absolute inset-0 rounded-lg pointer-events-none bg-black/0 group-hover/btn:bg-black/70 transition-colors duration-300" />
                  <div className="absolute inset-0 rounded-lg pointer-events-none bg-accent/0 group-hover/btn:bg-accent/10 transition-colors duration-300" />
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">
                  By signing in you agree to use this tool responsibly.<br />
                  Your data stays on your own server.
                </p>
              </div>
            )}

          </div>
        </div>

        {/* ── Right: product preview ── */}
        <div className="hidden lg:flex flex-1 min-h-[420px]">
          <div className="w-full border border-white/[0.06] rounded-xl overflow-hidden relative bg-[#0d0d14]">
            <KanbanPreview />
          </div>
        </div>

      </div>

      {/* Footer */}
      <p className="relative z-10 text-sm text-gray-500 text-center pb-8">
        AutoKan · Built for humans &amp; AI agents
      </p>
    </div>
  );
}
