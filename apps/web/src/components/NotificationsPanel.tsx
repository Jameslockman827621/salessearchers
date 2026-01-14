'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Bell,
  X,
  Check,
  CheckCheck,
  Calendar,
  Briefcase,
  Mail,
  CheckSquare,
  FileText,
  User,
  Loader2,
  Archive,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const typeIcons: Record<string, React.ReactNode> = {
  MEETING_SCHEDULED: <Calendar className="h-4 w-4 text-blue-400" />,
  MEETING_STARTED: <Calendar className="h-4 w-4 text-emerald-400" />,
  MEETING_COMPLETED: <Calendar className="h-4 w-4 text-gray-400" />,
  MEETING_INSIGHTS_READY: <Calendar className="h-4 w-4 text-purple-400" />,
  TASK_ASSIGNED: <CheckSquare className="h-4 w-4 text-pink-400" />,
  TASK_DUE_SOON: <CheckSquare className="h-4 w-4 text-amber-400" />,
  TASK_OVERDUE: <CheckSquare className="h-4 w-4 text-red-400" />,
  DEAL_STAGE_CHANGED: <Briefcase className="h-4 w-4 text-blue-400" />,
  DEAL_WON: <Briefcase className="h-4 w-4 text-emerald-400" />,
  DEAL_LOST: <Briefcase className="h-4 w-4 text-red-400" />,
  EMAIL_REPLIED: <Mail className="h-4 w-4 text-blue-400" />,
  EMAIL_BOUNCED: <Mail className="h-4 w-4 text-red-400" />,
  SEQUENCE_COMPLETED: <Mail className="h-4 w-4 text-emerald-400" />,
  DATA_ROOM_VIEWED: <FileText className="h-4 w-4 text-cyan-400" />,
  DATA_ROOM_CONTENT_DOWNLOADED: <FileText className="h-4 w-4 text-cyan-400" />,
  CONTACT_ENRICHED: <User className="h-4 w-4 text-purple-400" />,
  LINKEDIN_ACTION_COMPLETED: <User className="h-4 w-4 text-blue-400" />,
  TEAM_INVITE_ACCEPTED: <User className="h-4 w-4 text-emerald-400" />,
  MENTION: <User className="h-4 w-4 text-indigo-400" />,
  SYSTEM: <Bell className="h-4 w-4 text-gray-400" />,
};

export function NotificationsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: unreadCount } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.getUnreadNotificationCount(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: notificationsData, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.getNotifications({ limit: 20 }),
    enabled: isOpen,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.archiveNotification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleNotificationClick = (notification: {
    id: string;
    actionUrl: string | null;
    isRead: boolean;
  }) => {
    if (!notification.isRead) {
      markReadMutation.mutate(notification.id);
    }
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
      >
        <Bell className="h-5 w-5" />
        {(unreadCount?.count ?? 0) > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center text-xs font-medium bg-red-500 text-white rounded-full">
            {(unreadCount?.count ?? 0) > 99 ? '99+' : unreadCount?.count}
          </span>
        )}
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
            <div className="flex items-center gap-2">
              {(unreadCount?.count ?? 0) > 0 && (
                <button
                  onClick={() => markAllReadMutation.mutate()}
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                >
                  <CheckCheck className="h-3 w-3" />
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-gray-400 hover:text-white rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-[60vh] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
              </div>
            ) : notificationsData?.data.length ? (
              <div>
                {notificationsData.data.map((notification) => (
                  <div
                    key={notification.id}
                    className={`flex items-start gap-3 px-4 py-3 border-b border-gray-800/50 hover:bg-gray-800/50 cursor-pointer transition-colors ${
                      !notification.isRead ? 'bg-indigo-900/10' : ''
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    {/* Icon */}
                    <div className="mt-0.5">
                      {typeIcons[notification.type] ?? <Bell className="h-4 w-4 text-gray-400" />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${notification.isRead ? 'text-gray-300' : 'text-white font-medium'}`}>
                        {notification.title}
                      </p>
                      {notification.body && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                          {notification.body}
                        </p>
                      )}
                      <p className="text-xs text-gray-600 mt-1">
                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      {!notification.isRead && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markReadMutation.mutate(notification.id);
                          }}
                          className="p-1 text-gray-500 hover:text-white rounded"
                          title="Mark as read"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          archiveMutation.mutate(notification.id);
                        }}
                        className="p-1 text-gray-500 hover:text-white rounded"
                        title="Archive"
                      >
                        <Archive className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Unread Indicator */}
                    {!notification.isRead && (
                      <span className="h-2 w-2 bg-indigo-500 rounded-full" />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center">
                <Bell className="h-10 w-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No notifications</p>
                <p className="text-gray-500 text-xs mt-1">You&apos;re all caught up!</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-gray-800">
            <button
              onClick={() => {
                router.push('/settings/notifications');
                setIsOpen(false);
              }}
              className="text-xs text-gray-400 hover:text-white"
            >
              Notification Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

