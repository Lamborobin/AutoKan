import { useState, useEffect } from 'react';
import { X, Settings, Layers, Bot, GitBranch, Github, FolderOpen, Check, Loader2, AlertTriangle } from 'lucide-react';
import { useStore } from '../store';
import { projectsApi } from '../api';

export default function SettingsModal({ onClose }) {
  const { columns, agents, currentProjectId, projects, updateProject, loadProjects } = useStore();
  const [tab, setTab] = useState('board');

  const activeColumns = columns.filter(c => !c.archived_at);
  const activeAgents = agents.filter(a => a.active);
  const currentProject = projects.find(p => p.id === currentProjectId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Settings size={15} className="text-accent" />
            <span className="text-sm font-semibold text-gray-100">Settings</span>
            {currentProject && (
              <span className="text-xs text-gray-500">— {currentProject.name}</span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-300 transition-colors p-1 rounded">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-5">
          {[
            { id: 'board', label: 'Board', icon: Layers },
            { id: 'agents', label: 'Agents', icon: Bot },
            { id: 'connections', label: 'Connections', icon: GitBranch },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium border-b-2 transition-colors ${
                tab === id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              <Icon size={12} />
              {label}
              {id === 'connections' && currentProject?.client_path && (
                <span className={`w-1.5 h-1.5 rounded-full ml-0.5 ${currentProject.path_exists ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[28rem] overflow-y-auto">
          {tab === 'board' && (
            <div>
              <p className="text-xs font-medium text-gray-400 mb-3">
                Columns <span className="text-gray-600 font-normal">({activeColumns.length} active)</span>
              </p>
              <div className="space-y-1.5">
                {activeColumns.map(col => (
                  <div key={col.id} className="flex items-center gap-3 px-3 py-2.5 bg-surface-2 border border-border rounded-lg">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: col.color }} />
                    <span className="text-xs text-gray-300 flex-1">{col.name}</span>
                    <span className="text-[10px] font-mono text-gray-600">{col.id}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'agents' && (
            <div>
              <p className="text-xs font-medium text-gray-400 mb-3">
                Agents <span className="text-gray-600 font-normal">({activeAgents.length} active)</span>
              </p>
              <div className="space-y-1.5">
                {activeAgents.map(agent => (
                  <div key={agent.id} className="flex items-center gap-3 px-3 py-2.5 bg-surface-2 border border-border rounded-lg">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                      style={{ background: agent.color }}
                    >
                      {agent.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-300">{agent.name}</p>
                      <p className="text-[10px] font-mono text-gray-600 truncate">{agent.model}</p>
                    </div>
                    {agent.is_template && (
                      <span className="text-[8px] font-medium px-1 py-px rounded uppercase tracking-wide bg-accent/15 text-accent border border-accent/20">
                        T
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'connections' && currentProject && (
            <ConnectionsTab
              project={currentProject}
              onUpdated={() => loadProjects()}
              updateProject={updateProject}
            />
          )}
        </div>

        <div className="px-5 py-3 border-t border-border">
          <p className="text-[10px] text-gray-600">AutoKan v0.1.0</p>
        </div>
      </div>
    </div>
  );
}

function ConnectionsTab({ project, onUpdated, updateProject }) {
  const [repoUrl, setRepoUrl] = useState(project.repo_url || '');
  const [clientRepos, setClientRepos] = useState([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isConnected = !!project.client_path;

  useEffect(() => {
    setLoadingFolders(true);
    projectsApi.clientRepos()
      .then(setClientRepos)
      .catch(() => setClientRepos([]))
      .finally(() => setLoadingFolders(false));
  }, []);

  async function handleSaveGithub() {
    if (!repoUrl.trim()) return;
    setCloning(true);
    setError('');
    setSuccess('');
    try {
      const result = await projectsApi.clone(project.id, { repo_url: repoUrl.trim() });
      onUpdated(result.project);
      setSuccess(result.already_existed
        ? `Redan klonad — kopplad till ${result.client_path}`
        : `Klonad till ${result.client_path} ✓`);
    } catch (e) {
      setError(e.response?.data?.error || 'Kloning misslyckades');
    } finally {
      setCloning(false);
    }
  }

  async function handleConnectLocal(client_path) {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await updateProject(project.id, { client_path, repo_url: null });
      onUpdated();
      setSuccess(`Kopplad till ${client_path} ✓`);
    } catch (e) {
      setError('Misslyckades att koppla');
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setSaving(true);
    try {
      await updateProject(project.id, { client_path: null, repo_url: null });
      setRepoUrl('');
      onUpdated();
      setSuccess('Frånkopplad');
    } catch {
      setError('Misslyckades');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">

      {/* Current status */}
      <div>
        <p className="text-xs font-medium text-gray-400 mb-2">Status</p>
        {isConnected ? (
          <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-xs ${
            project.path_exists
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/25 text-amber-300'
          }`}>
            {project.path_exists
              ? <Check size={13} className="shrink-0" />
              : <AlertTriangle size={13} className="shrink-0" />}
            <span className="font-mono flex-1 truncate">{project.client_path}</span>
            <span className="text-[10px] opacity-70 shrink-0">
              {project.path_exists ? 'Ansluten' : 'Mappen saknas'}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border bg-surface-2 text-xs text-gray-500">
            <GitBranch size={13} className="shrink-0" />
            Inget repo kopplat
          </div>
        )}
      </div>

      {/* GitHub URL */}
      <div>
        <p className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-1.5">
          <Github size={12} />
          GitHub URL
        </p>
        <div className="flex gap-2">
          <input
            value={repoUrl}
            onChange={e => setRepoUrl(e.target.value)}
            placeholder="https://github.com/user/repo"
            className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50 font-mono"
          />
          <button
            onClick={handleSaveGithub}
            disabled={cloning || !repoUrl.trim()}
            className="flex items-center gap-1.5 px-3 py-2 bg-accent hover:bg-accent/80 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
          >
            {cloning ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {cloning ? 'Klonar…' : 'Spara & klona'}
          </button>
        </div>
        <p className="text-[10px] text-gray-600 mt-1.5">
          Repot klonas automatiskt till <span className="font-mono">client/</span> när du sparar.
        </p>
      </div>

      {/* Local folders */}
      <div>
        <p className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-1.5">
          <FolderOpen size={12} />
          Lokal mapp <span className="font-mono text-gray-600">(client/)</span>
        </p>
        {loadingFolders ? (
          <div className="flex items-center gap-2 text-gray-500 text-xs py-1">
            <Loader2 size={12} className="animate-spin" />
            Söker mappar…
          </div>
        ) : clientRepos.length === 0 ? (
          <p className="text-xs text-gray-600 py-1">
            Inga mappar hittades i <span className="font-mono">client/</span>. Klona ett repo ovan så skapas det automatiskt.
          </p>
        ) : (
          <div className="space-y-1">
            {clientRepos.map(r => (
              <button
                key={r.client_path}
                onClick={() => handleConnectLocal(r.client_path)}
                disabled={saving}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs transition-colors text-left ${
                  project.client_path === r.client_path
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-gray-400 hover:text-gray-200 hover:border-gray-500 bg-surface-2'
                }`}
              >
                <FolderOpen size={12} className="shrink-0" />
                <span className="font-mono flex-1">{r.client_path}</span>
                {r.is_git && <span className="text-[10px] text-gray-600 shrink-0">git</span>}
                {project.client_path === r.client_path && <Check size={11} className="shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Disconnect */}
      {isConnected && (
        <button
          onClick={handleDisconnect}
          disabled={saving}
          className="text-[11px] text-gray-600 hover:text-red-400 transition-colors flex items-center gap-1.5"
        >
          <X size={11} />
          Koppla ifrån
        </button>
      )}

      {/* Feedback */}
      {error && (
        <p className="text-red-400 text-xs flex items-center gap-1.5">
          <AlertTriangle size={12} /> {error}
        </p>
      )}
      {success && (
        <p className="text-emerald-400 text-xs flex items-center gap-1.5">
          <Check size={12} /> {success}
        </p>
      )}
    </div>
  );
}
