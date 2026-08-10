import { useEffect, useRef } from 'react';
import { Bell, X } from 'lucide-react';
import { useStore } from '../../store';

function formatRelativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr + (dateStr.endsWith('Z') ? '' : 'Z')).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationPopover({ anchorRef, onClose }) {
  const { notifications, unreadCount, markNotificationRead, markAllNotificationsRead, setSelectedTask, tasks } = useStore();
  const popoverRef = useRef(null);

  useEffect(() => {
    function onMouseDown(e) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        anchorRef?.current && !anchorRef.current.contains(e.target)
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [onClose, anchorRef]);

  function handleNotificationClick(notif) {
    if (!notif.read_at) markNotificationRead(notif.id);
    if (notif.link) {
      const match = notif.link.match(/[?&]task=([^&]+)/);
      if (match) {
        const task = tasks.find(t => t.id === match[1]);
        if (task) setSelectedTask(task);
      }
    }
    onClose();
  }

  return (
    <div
      ref={popoverRef}
      className="absolute left-full top-0 ml-2 z-[100] w-80 bg-surface-1 border border-border rounded-2xl shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bell size={14} className="text-gray-400" />
          <span className="text-sm font-semibold text-gray-200">Notifications</span>
          {unreadCount > 0 && (
            <span className="text-xs bg-accent/20 text-accent px-1.5 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={() => markAllNotificationsRead()}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded-lg hover:bg-surface-3"
            >
              Mark all read
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-600 hover:text-gray-400 hover:bg-surface-3 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-gray-600">
            <Bell size={22} className="opacity-30" />
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          notifications.map(notif => (
            <button
              key={notif.id}
              onClick={() => handleNotificationClick(notif)}
              className={`w-full text-left px-4 py-3 hover:bg-surface-3 transition-colors border-b border-border/40 last:border-0 ${!notif.read_at ? 'bg-accent/5' : ''}`}
            >
              <div className="flex items-start gap-2.5">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${!notif.read_at ? 'bg-accent' : 'bg-transparent'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${!notif.read_at ? 'text-gray-200 font-medium' : 'text-gray-400'}`}>
                    {notif.title}
                  </p>
                  {notif.body && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-snug">{notif.body}</p>
                  )}
                  <p className="text-[10px] text-gray-600 mt-1">{formatRelativeTime(notif.created_at)}</p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
