import { useState, useEffect } from 'react';
import { GitBranch, FolderOpen, Github, X, Check, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { projectsApi } from '../../api';
import { useStore } from '../../store';

/**
 * Inline repo settings panel shown inside BoardsModal when a board card is expanded.
 * Lets the user connect a GitHub URL (clone) or select an existing local folder under client/.
 */
export default function BoardRepoSettings({ project, onClose, onUpdated }) {
  const { updateProject } = useStore();

  const [mode, setMode] = useState(project.repo_url ? 'github' : project.client_path ? 'local' : null);
  const [repoUrl, setRepoUrl] = useState(project.repo_url || '');
  const [folderName, setFolderName] = useState('');
  const [localPath, setLocalPath] = useState(project.client_path || '');
  const [clientRepos, setClientRepos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Derive folder name suggestion from URL
  useEffect(() => {
    if (repoUrl) {
      const suggested = repoUrl.split('/').pop().replace(/\.git$/, '').replace(/[^a-zA-Z0-9_-]/g, '-');
      setFolderName(suggested);
    }
  }, [repoUrl]);

  // Load existing client/ folders
  useEffect(() => {
    if (mode === 'local') {
      setLoading(true);
      projectsApi.clientRepos()
        .then(setClientRepos)
        .catch(() => setClientRepos([]))
        .finally(() => setLoading(false));
    }
  }, [mode]);

  async function handleClone() {
    if (!repoUrl.trim()) return;
    setCloning(true);
    setError('');
    setSuccess('');
    try {
      const result = await projectsApi.clone(project.id, {
        repo_url: repoUrl.trim(),
        folder_name: folderName.trim() || undefined,
      });
      onUpdated(result.project);
      setSuccess(result.already_existed
        ? `Folder already existed — connected to ${result.client_path}`
        : `Cloned to ${result.client_path}`);
    } catch (e) {
      setError(e.response?.data?.error || 'Clone failed');
    } finally {
      setCloning(false);
    }
  }

  async function handleConnectLocal() {
    if (!localPath) return;
    setLoading(true);
    setError('');
    try {
      const updated = await updateProject(project.id, { client_path: localPath, repo_url: null });
      onUpdated(updated);
      setSuccess(`Connected to ${localPath}`);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to connect');
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    try {
      const updated = await updateProject(project.id, { client_path: null, repo_url: null });
      onUpdated(updated);
      setMode(null);
      setRepoUrl('');
      setLocalPath('');
      setSuccess('Disconnected');
    } catch (e) {
      setError('Failed to disconnect');
    } finally {
      setLoading(false);
    }
  }

  const isConnected = !!project.client_path;

  return (
    <div className="mt-2 p-3 bg-surface-1 border border-border rounded-xl space-y-3 text-sm">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-gray-400 font-medium">
          <GitBranch size={12} />
          <span>Repository</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-200 p-0.5">
          <X size={12} />
        </button>
      </div>

      {/* Current status */}
      {isConnected && (
        <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs ${
          project.path_exists
            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
            : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
        }`}>
          {project.path_exists
            ? <Check size={11} />
            : <AlertTriangle size={11} />}
          <span className="flex-1 truncate">{project.client_path}</span>
          {project.path_exists
            ? <span className="shrink-0">Connected</span>
            : <span className="shrink-0">Folder not found</span>}
        </div>
      )}

      {/* Mode selector — only show when not connected or want to change */}
      {(!isConnected || !project.path_exists) && (
        <div className="flex gap-2">
          <button
            onClick={() => { setMode('github'); setError(''); setSuccess(''); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border transition-colors ${
              mode === 'github'
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-gray-500 hover:text-gray-100 hover:border-gray-500'
            }`}
          >
            <Github size={12} />
            <span>GitHub URL</span>
          </button>
          <button
            onClick={() => { setMode('local'); setError(''); setSuccess(''); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border transition-colors ${
              mode === 'local'
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-gray-500 hover:text-gray-100 hover:border-gray-500'
            }`}
          >
            <FolderOpen size={12} />
            <span>Local folder</span>
          </button>
        </div>
      )}

      {/* GitHub clone form */}
      {mode === 'github' && (
        <div className="space-y-2">
          <input
            value={repoUrl}
            onChange={e => setRepoUrl(e.target.value)}
            placeholder="https://github.com/user/repo.git"
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50"
          />
          <div className="flex items-center gap-2">
            <span className="text-gray-600 shrink-0">client/</span>
            <input
              value={folderName}
              onChange={e => setFolderName(e.target.value)}
              placeholder="folder-name"
              className="flex-1 bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50"
            />
          </div>
          <button
            onClick={handleClone}
            disabled={cloning || !repoUrl.trim()}
            className="w-full flex items-center justify-center gap-1.5 py-2 bg-accent hover:bg-accent/80 disabled:opacity-40 text-white rounded-lg transition-colors font-medium"
          >
            {cloning ? <Loader2 size={12} className="animate-spin" /> : <Github size={12} />}
            {cloning ? 'Cloning…' : 'Clone & Connect'}
          </button>
        </div>
      )}

      {/* Local folder picker */}
      {mode === 'local' && (
        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 py-1">
              <Loader2 size={12} className="animate-spin" />
              <span>Scanning client/ folder…</span>
            </div>
          ) : clientRepos.length === 0 ? (
            <p className="text-gray-600 py-1">No folders found in <span>client/</span></p>
          ) : (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {clientRepos.map(r => (
                <button
                  key={r.client_path}
                  onClick={() => setLocalPath(r.client_path)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors text-left ${
                    localPath === r.client_path
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-gray-400 hover:text-gray-200 hover:border-gray-500'
                  }`}
                >
                  <FolderOpen size={11} />
                  <span className="flex-1">{r.client_path}</span>
                  {r.is_git && <span className="text-xs text-gray-600">git</span>}
                </button>
              ))}
            </div>
          )}

          {/* Manual path input as fallback */}
          <div className="flex items-center gap-2">
            <span className="text-gray-600 shrink-0">client/</span>
            <input
              value={localPath.replace(/^client\//, '')}
              onChange={e => setLocalPath(e.target.value ? `client/${e.target.value}` : '')}
              placeholder="folder-name"
              className="flex-1 bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50"
            />
          </div>

          <button
            onClick={handleConnectLocal}
            disabled={loading || !localPath}
            className="w-full flex items-center justify-center gap-1.5 py-2 bg-accent hover:bg-accent/80 disabled:opacity-40 text-white rounded-lg transition-colors font-medium"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {loading ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      )}

      {/* Disconnect button — shown when connected */}
      {isConnected && (
        <button
          onClick={handleDisconnect}
          disabled={loading}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-gray-400 hover:text-red-400 border border-transparent hover:border-red-400/20 rounded-lg transition-colors text-xs"
        >
          <X size={11} />
          Disconnect repository
        </button>
      )}

      {/* Feedback */}
      {error && (
        <p className="text-red-400 text-xs flex items-center gap-1.5">
          <AlertTriangle size={11} />
          {error}
        </p>
      )}
      {success && (
        <p className="text-emerald-400 text-xs flex items-center gap-1.5">
          <Check size={11} />
          {success}
        </p>
      )}
    </div>
  );
}
