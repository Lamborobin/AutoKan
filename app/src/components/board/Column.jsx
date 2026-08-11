import { useState, useRef, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus, Archive, Trash2, MoreHorizontal, X, Pencil, GripVertical } from 'lucide-react';
import TaskCard from './TaskCard';
import { useStore } from '../../store';
import { COLUMN } from '../../constants/columns';

// Prefix used for the inner task-drop zone so it doesn't conflict with the
// column sortable id (both would otherwise register the same id in dnd-kit).
export const taskZoneId = (colId) => `zone:${colId}`;

export default function Column({ column, tasks }) {
  const { setShowNewTask, archiveColumn, deleteColumn, updateColumn } = useStore();

  const isProtected = !!column.is_protected;
  const isUnassigned = column.id === COLUMN.UNASSIGNED;

  // Outer div: sortable for column reordering (disabled for protected columns)
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id, data: { type: 'column' }, disabled: isProtected });

  // Inner div: separate droppable for task drops (distinct id avoids conflict)
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: taskZoneId(column.id) });

  const [showMenu, setShowMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [error, setError] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(column.name);
  const renameRef = useRef(null);

  useEffect(() => {
    if (renaming) renameRef.current?.select();
  }, [renaming]);

  // Dismiss confirmation chips on any keypress
  useEffect(() => {
    if (!confirmDelete && !confirmArchive) return;
    function dismiss() { setConfirmDelete(false); setConfirmArchive(false); }
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [confirmDelete, confirmArchive]);

  async function handleArchive() {
    if (!confirmArchive) { setConfirmArchive(true); setConfirmDelete(false); return; }
    setShowMenu(false);
    setConfirmArchive(false);
    await archiveColumn(column.id);
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); setConfirmArchive(false); return; }
    setShowMenu(false);
    setConfirmDelete(false);
    try {
      await deleteColumn(column.id);
    } catch (err) {
      if (err.response?.data?.has_dependencies) {
        setError(err.response.data.error);
        setConfirmArchive(true);
      } else {
        setError(err.response?.data?.error || 'Failed to delete');
      }
    }
  }

  function closeMenu() {
    setShowMenu(false);
    setConfirmDelete(false);
    setConfirmArchive(false);
    setError('');
  }

  function startRename() {
    setRenameValue(column.name);
    setRenaming(true);
    setShowMenu(false);
  }

  async function commitRename() {
    setRenaming(false);
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === column.name) return;
    try {
      await updateColumn(column.id, { name: trimmed });
    } catch {
      // stays as-is on failure
    }
  }

  function handleRenameKey(e) {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') { setRenaming(false); setRenameValue(column.name); }
  }

  const colStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setSortableRef}
      style={{ ...colStyle, borderTop: `3px solid ${column.color}` }}
      className="flex flex-col w-72 shrink-0 bg-surface-2/30 rounded-t-lg"
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-1 mb-3 pt-2">
        {isProtected ? (
          <span className="w-4 shrink-0" />
        ) : (
          <button
            {...attributes}
            {...listeners}
            className="p-0.5 text-gray-400 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0 touch-none"
            title="Drag to reorder"
            tabIndex={-1}
          >
            <GripVertical size={13} />
          </button>
        )}

        <div className="flex items-center gap-2 min-w-0 flex-1 ml-1">
          {isUnassigned ? (
            <h3 className="text-base font-semibold text-amber-400 truncate flex items-center gap-1.5">
              <span>⚠</span> Unassigned
            </h3>
          ) : renaming ? (
            <input
              ref={renameRef}
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={handleRenameKey}
              className="text-base font-semibold text-gray-200 bg-surface-3 border border-accent/40 rounded-md px-1.5 py-0.5 outline-none min-w-0 w-full"
            />
          ) : (
            <h3
              className="text-base font-semibold text-gray-200 cursor-pointer hover:text-white transition-colors truncate"
              title="Click to rename"
              onClick={startRename}
            >
              {column.name}
            </h3>
          )}
          <span className="text-sm font-medium text-gray-100 bg-surface-3 px-1.5 py-0.5 rounded-md shrink-0">
            {tasks.length}
          </span>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {column.id === COLUMN.BACKLOG && !isUnassigned && (
            <button
              onClick={() => setShowNewTask(true)}
              className="p-1 rounded-lg text-gray-200 hover:text-white hover:bg-surface-3 transition-colors"
            >
              <Plus size={14} />
            </button>
          )}
          {isUnassigned ? null : isProtected ? (
            <button
              onClick={startRename}
              className="p-1 rounded-lg text-[#d6c3a1] hover:text-[#efe1c6] hover:bg-surface-3 transition-colors"
              title="Rename column"
            >
              <Pencil size={12} />
            </button>
          ) : (
            <div className="relative">
              <button
                onClick={() => { setShowMenu(v => !v); setConfirmDelete(false); setConfirmArchive(false); setError(''); }}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-3 transition-colors"
              >
                <MoreHorizontal size={13} />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-7 z-20 bg-surface-2 border border-border rounded-xl shadow-lg py-1.5 min-w-[160px]">
                  <div className="flex items-center justify-between px-3 py-1 mb-1 border-b border-border">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Column</span>
                    <button onClick={closeMenu} className="text-gray-400 hover:text-gray-200 p-0.5">
                      <X size={10} />
                    </button>
                  </div>
                  {error && (
                    <p className="mx-2 mb-1 px-2 py-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg leading-relaxed">{error}</p>
                  )}
                  <button
                    onClick={startRename}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 hover:bg-surface-3 transition-colors"
                  >
                    <Pencil size={11} />
                    Rename
                  </button>
                  <button
                    onClick={handleArchive}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                      confirmArchive
                        ? 'text-amber-300 bg-amber-500/10'
                        : 'text-gray-400 hover:text-amber-400 hover:bg-surface-3'
                    }`}
                  >
                    <Archive size={11} />
                    Archive
                  </button>
                  {confirmArchive && (
                    <div className="mx-2 mb-1 px-2 py-1.5 text-xs bg-amber-500/15 border border-amber-500/30 text-amber-300 rounded-lg flex items-center justify-between gap-2">
                      <span>Are you sure you want to archive this column?</span>
                      <button onClick={e => { e.stopPropagation(); setConfirmArchive(false); }} className="text-amber-400 hover:text-amber-200 leading-none">✕</button>
                    </div>
                  )}
                  <button
                    onClick={handleDelete}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                      confirmDelete
                        ? 'text-red-300 bg-red-500/10'
                        : 'text-gray-400 hover:text-red-400 hover:bg-surface-3'
                    }`}
                  >
                    <Trash2 size={11} />
                    Delete
                  </button>
                  {confirmDelete && (
                    <div className="mx-2 mb-1 px-2 py-1.5 text-xs bg-red-500/15 border border-red-500/30 text-red-300 rounded-lg flex items-center justify-between gap-2">
                      <span>Are you sure you want to delete this column?</span>
                      <button onClick={e => { e.stopPropagation(); setConfirmDelete(false); }} className="text-red-400 hover:text-red-200 leading-none">✕</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Task drop zone — separate id so it doesn't conflict with the column sortable */}
      <div
        ref={setDropRef}
        className={`flex-1 min-h-24 rounded-xl p-2 transition-colors duration-150 flex flex-col gap-2
          ${isOver ? 'bg-accent/5 border border-accent/20' : 'bg-surface-1/50 border border-border'}`}
      >
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-gray-600">empty</p>
          </div>
        )}
      </div>
    </div>
  );
}
