import { useEffect, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useStore } from '../store';
import { invitesApi } from '../api';
import heroImg from '../assets/images/hero.png';

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
          not_found: 'This invite link is invalid.',
          expired: 'This invite link has expired. Ask for a new one.',
          already_used: 'This invite link has already been used.',
        };
        setInviteState({ error: reasons[result.reason] || 'This invite link is not valid.' });
      }
    }).catch(() => {
      setInviteState({ error: 'Could not verify invite link. Please try again.' });
    });
  }, [inviteToken]);

  const isInviteFlow = !!inviteToken;
  const inviteValid = inviteState?.valid;
  const inviteError = inviteState?.error;
  const inviteLoading = inviteState?.loading;

  return (
    <div className="min-h-screen bg-surface-0 flex flex-col items-center justify-center relative overflow-hidden px-4 py-8">

      {/* Background grid */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(99,102,241,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.04) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Large background glow blob — pulses */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] sm:w-[700px] sm:h-[700px] rounded-full pointer-events-none animate-pulse-glow"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.06) 40%, transparent 70%)' }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8 sm:gap-10 w-full max-w-sm">

        {/* ── Animated hero section ── */}
        <div className="flex flex-col items-center gap-4">

          {/* Icon + orbital rings */}
          <div className="relative flex items-center justify-center w-28 h-28 sm:w-36 sm:h-36">

            {/* Outer dashed orbit ring — spins CCW */}
            <div
              className="absolute inset-0 rounded-full animate-spin-reverse pointer-events-none"
              style={{
                border: '1px dashed rgba(99,102,241,0.25)',
                transform: 'scale(1.55)',
              }}
            />

            {/* Inner gradient ring — spins CW */}
            <div
              className="absolute inset-0 rounded-full animate-spin-slow pointer-events-none"
              style={{
                background: 'conic-gradient(from 0deg, rgba(99,102,241,0.6) 0%, rgba(139,92,246,0.4) 20%, transparent 50%, rgba(99,102,241,0.1) 80%, rgba(99,102,241,0.6) 100%)',
                transform: 'scale(1.28)',
                borderRadius: '50%',
                mask: 'radial-gradient(transparent 88%, black 89%)',
                WebkitMask: 'radial-gradient(transparent 88%, black 89%)',
              }}
            />

            {/* Orbiting dot 1 — CW, on the dashed ring */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="animate-orbit-dot">
                <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_6px_2px_rgba(99,102,241,0.8)]" />
              </div>
            </div>

            {/* The hero image — glow breathes */}
            <img
              src={heroImg}
              alt="AutoKan"
              className="w-full h-full object-contain animate-logo-glow relative z-10"
            />
          </div>

          {/* Title + subtitle */}
          <div className="text-center">
            {/* Animated shimmer title */}
            <h1
              className="text-2xl sm:text-3xl font-bold tracking-tight select-none animate-shimmer"
              style={{
                backgroundImage: 'linear-gradient(90deg, #a5b4fc 0%, #818cf8 20%, #c4b5fd 40%, #6366f1 60%, #a78bfa 80%, #a5b4fc 100%)',
                backgroundSize: '300% auto',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                color: 'transparent',
              }}
            >
              AutoKan
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1.5 tracking-wide">
              Autonomous AI task orchestration
            </p>
          </div>
        </div>

        {/* ── Login card ── */}
        <div className="w-full bg-surface-1 border border-border rounded-2xl p-6 sm:p-8 flex flex-col items-center gap-5 shadow-2xl">

          {inviteLoading ? (
            <div className="text-xs text-gray-500 py-2">Verifying invite…</div>
          ) : inviteValid ? (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 mb-3">
                <span className="text-lg">🎉</span>
              </div>
              <h2 className="text-base font-semibold text-gray-200">You've been invited!</h2>
              <p className="text-xs text-gray-500 mt-1">
                Sign in with the Google account for{' '}
                <span className="text-gray-300 font-medium">{inviteState.email}</span>
              </p>
            </div>
          ) : inviteError ? (
            <div className="text-center w-full">
              <h2 className="text-base font-semibold text-gray-200">Sign in to continue</h2>
              <div className="mt-3 w-full px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 text-center">
                {inviteError}
              </div>
            </div>
          ) : (
            <div className="text-center">
              <h2 className="text-base font-semibold text-gray-200">Sign in to continue</h2>
              <p className="text-xs text-gray-500 mt-1">Connect your Google account to access your boards</p>
            </div>
          )}

          {authError && (
            <div className="w-full px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 text-center">
              {authError}
            </div>
          )}

          {!inviteLoading && (
            <div className="w-full flex justify-center">
              <GoogleLogin
                onSuccess={({ credential }) => googleLogin(credential)}
                onError={() => useStore.getState().setAuthError('Google sign-in failed. Please try again.')}
                theme="filled_black"
                shape="rectangular"
                size="large"
                text={isInviteFlow ? 'signin_with' : 'continue_with'}
                width="280"
              />
            </div>
          )}

          <p className="text-[10px] text-gray-600 text-center leading-relaxed">
            By signing in you agree to use this tool responsibly.<br />
            Your data stays on your own server.
          </p>
        </div>

        {/* Footer */}
        <p className="text-[10px] text-gray-700">
          AutoKan · Built for humans &amp; AI agents
        </p>
      </div>
    </div>
  );
}
