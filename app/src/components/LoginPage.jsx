import { GoogleLogin } from '@react-oauth/google';
import { useStore } from '../store';

export default function LoginPage() {
  const { googleLogin, authError } = useStore();

  return (
    <div className="min-h-screen bg-surface-0 flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(99,102,241,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.04) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      {/* Glow orb */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)' }}
      />

      <div className="relative z-10 flex flex-col items-center gap-10 max-w-sm w-full px-6">
        {/* Logo + name */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <span className="text-2xl">⚡</span>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-100 tracking-tight">AutoKan</h1>
            <p className="text-sm text-gray-500 mt-1">Autonomous AI task orchestration</p>
          </div>
        </div>

        {/* Login card */}
        <div className="w-full bg-surface-1 border border-border rounded-2xl p-8 flex flex-col items-center gap-6 shadow-2xl">
          <div className="text-center">
            <h2 className="text-base font-semibold text-gray-200">Sign in to continue</h2>
            <p className="text-xs text-gray-500 mt-1">Connect your Google account to access your boards</p>
          </div>

          {authError && (
            <div className="w-full px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 text-center">
              {authError}
            </div>
          )}

          <div className="w-full flex justify-center">
            <GoogleLogin
              onSuccess={({ credential }) => googleLogin(credential)}
              onError={() => useStore.getState().setAuthError('Google sign-in failed. Please try again.')}
              theme="filled_black"
              shape="rectangular"
              size="large"
              text="continue_with"
              width="280"
            />
          </div>

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
