import { useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, Clock, Lock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useStore } from '../../store';
import { PRIORITY_STYLES } from '../../constants/tasks';

export default function TaskCard({ task }) {
  const { agents, setSelectedTask, isDraggingAgent } = useStore();
  const isLocked = task.is_locked;

  const { attributes, listeners, setNodeRef: setSortableRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: isLocked,
  });

  // Separate drop zone for agent assignment — always enabled so dnd-kit registers it
  // before the drag activates (disabled prop causes deregistration which misses the drop)
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `agent-drop:${task.id}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const assignedAgent = agents.find(a => a.id === task.assigned_agent_id);
  const tags = Array.isArray(task.tags) ? task.tags : [];

  // A description-less Backlog task is a "needs attention" draft (e.g. from a task
  // split) — it can't be planned until someone says what it actually covers.
  const needsAttention = task.column_id === 'col_backlog'
    && !(task.description && task.description.trim())
    && task.pm_approval_status !== 'approved';

  return (
    <div
      ref={node => { setSortableRef(node); setDropRef(node); }}
      style={style}
      {...attributes}
      {...(isLocked ? {} : listeners)}
      onClick={() => setSelectedTask(task)}
      className={`group relative bg-surface-2 border rounded-xl p-3.5 transition-all duration-150 animate-slide-in select-none
        ${isLocked
          ? 'border-amber-500/25 cursor-pointer'
          : isDraggingAgent && isOver
            ? 'border-accent/60 bg-accent/5 cursor-copy'
            : isDraggingAgent
              ? 'border-border/60 cursor-copy'
              : 'border-border cursor-grab hover:border-accent/40 hover:bg-surface-3'
        }`}
    >
      {/* Agent drop hint overlay */}
      {isDraggingAgent && isOver && (
        <div className="absolute inset-0 rounded-xl border-2 border-accent/40 border-dashed pointer-events-none z-10 flex items-center justify-center">
          <span className="text-[10px] font-medium text-accent bg-surface-2/90 px-2 py-1 rounded-lg">
            Drop to assign
          </span>
        </div>
      )}

      {/* Lock banner */}
      {isLocked && (
        <div className="flex items-center gap-1.5 mb-2.5 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <Lock size={9} className="text-amber-400 shrink-0" />
          <span className="text-[10px] font-medium text-amber-400">Locked · Planning phase</span>
        </div>
      )}

      {/* Needs-attention banner — draft task awaiting a description */}
      {needsAttention && !isLocked && (
        <div className="flex items-center gap-1.5 mb-2.5 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <AlertTriangle size={9} className="text-amber-400 shrink-0" />
          <span className="text-[10px] font-medium text-amber-400">Needs attention · add a description</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-sm font-medium text-gray-100 leading-snug line-clamp-2 flex-1">
          {task.title}
        </span>
        {task.requires_human_action === 1 && (
          <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
        )}
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-xs text-gray-500 line-clamp-2 mb-3 leading-relaxed">
          {task.description}
        </p>
      )}

      {/* Progress */}
      {task.progress > 0 && (
        <div className="mb-3">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-500">Progress</span>
            <span className="text-xs text-gray-400">{task.progress}%</span>
          </div>
          <div className="h-1 bg-surface-4 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
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

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {tags.slice(0, 3).map(tag => (
            <span key={tag} className="tag bg-surface-4 text-gray-400">{tag}</span>
          ))}
          {tags.length > 3 && (
            <span className="tag bg-surface-4 text-gray-500">+{tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`tag ${PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium}`}>
            {task.priority}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-600">
          {assignedAgent && (
            <span className="flex items-center gap-1">
              <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                   style={{ background: assignedAgent.color }}>
                {assignedAgent.name[0]}
              </div>
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock size={10} />
            {formatDistanceToNow(new Date(task.created_at.replace(' ', 'T') + 'Z'), { addSuffix: true })}
          </span>
        </div>
      </div>
    </div>
  );
}
