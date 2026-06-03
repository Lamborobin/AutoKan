import { useState, useMemo } from 'react';
import { X, Search, RotateCcw, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useStore } from '../../store';
import { PRIORITY_STYLES } from '../../constants/tasks';

export default function ArchivedTasksModal({ onClose }) {
  const { archivedTasks, columns, agents, unarchiveTask, setSelectedTask } = useStore();
  const [search, setSearch] = useState('');
  const [restoring, setRestoring] = useState(null);

  const columnName = (id) => columns.find(c => c.id === id)?.name ?? id;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return archivedTasks;
    return archivedTasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q)
    );
  }, [archivedTasks, search]);

  async function handleRestore(task) {
    setRestoring(task.id);
    try {
      await unarchiveTask(task.id);
    } finally {
      setRestoring(null);
    }
  }

  function handleOpen(task) {
    setSelectedTask(task);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" data-modal-backdrop="static"
    >
      <div className="bg-surface-2 border border-border rounded-2xl w-full max-w-xl max-h-[80vh] flex flex-col animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">Archived Tasks</h2>
            <p className="text-[10px] text-gray-600 mt-0.5">{archivedTasks.length} task{archivedTasks.length !== 1 ? 's' : ''} archived</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg text-gray-500 hover:text-gray-300">
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 bg-surface-3 border border-border rounded-lg px-3 py-2">
            <Search size={13} className="text-gray-600 shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search archived tasks…"
              className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-600 outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-gray-600 hover:text-gray-400">
                <X size={11} />
              </button>
            )}
          </div>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-600">
                {search ? 'No tasks match your search.' : 'No archived tasks.'}
              </p>
            </div>
          ) : (
            filtered.map(task => {
              const assignedAgent = agents.find(a => a.id === task.assigned_agent_id);
              const tags = Array.isArray(task.tags) ? task.tags : [];
              return (
                <div
                  key={task.id}
                  className="bg-surface-3 border border-border rounded-xl p-3.5 hover:border-border/80 hover:bg-surface-3/80 transition-all cursor-pointer group"
                  onClick={() => handleOpen(task)}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <span className="text-sm font-medium text-gray-300 leading-snug flex-1 line-clamp-2">
                      {task.title}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); handleRestore(task); }}
                      disabled={restoring === task.id}
                      title="Restore task"
                      className="shrink-0 flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-gray-500 hover:text-accent hover:bg-accent/10 border border-border hover:border-accent/30 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    >
                      <RotateCcw size={10} className={restoring === task.id ? 'animate-spin' : ''} />
                      Restore
                    </button>
                  </div>

                  {task.description && (
                    <p className="text-xs text-gray-500 line-clamp-2 mb-2.5 leading-relaxed">
                      {task.description}
                    </p>
                  )}

                  {/* Progress bar */}
                  {task.progress > 0 && (
                    <div className="mb-2.5">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] text-gray-600">Progress</span>
                        <span className="text-[10px] font-mono text-gray-500">{task.progress}%</span>
                      </div>
                      <div className="h-1 bg-surface-4 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${task.progress}%`,
                            background: task.progress === 100
                              ? 'linear-gradient(90deg, #10b981, #34d399)'
                              : 'linear-gradient(90deg, #7c6af7, #a78bfa)'
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {tags.slice(0, 3).map(tag => (
                        <span key={tag} className="tag bg-surface-4 text-gray-500">{tag}</span>
                      ))}
                      {tags.length > 3 && <span className="tag bg-surface-4 text-gray-600">+{tags.length - 3}</span>}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`tag ${PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium}`}>
                        {task.priority}
                      </span>
                      <span className="text-[10px] text-gray-600">
                        {columnName(task.column_id)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-gray-600">
                      {assignedAgent && (
                        <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold"
                             style={{ background: assignedAgent.color }}>
                          {assignedAgent.name[0]}
                        </div>
                      )}
                      <span className="flex items-center gap-1" title={`Created ${formatDistanceToNow(new Date(task.created_at.replace(' ', 'T') + 'Z'), { addSuffix: true })}`}>
                        <Clock size={9} />
                        {task.updated_at && task.updated_at !== task.created_at
                          ? `Modified ${formatDistanceToNow(new Date(task.updated_at.replace(' ', 'T') + 'Z'), { addSuffix: true })}`
                          : `Created ${formatDistanceToNow(new Date(task.created_at.replace(' ', 'T') + 'Z'), { addSuffix: true })}`
                        }
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
