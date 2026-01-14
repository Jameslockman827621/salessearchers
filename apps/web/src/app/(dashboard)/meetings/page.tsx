'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Plus, Video, Loader2, X, Calendar, ExternalLink, MoreVertical, XCircle } from 'lucide-react';

const statusColors: Record<string, string> = {
  SCHEDULED: 'badge-primary',
  BOT_JOINING: 'badge-warning',
  RECORDING: 'bg-red-500/20 text-red-400',
  PROCESSING: 'badge-warning',
  READY: 'badge-success',
  FAILED: 'badge-danger',
  CANCELLED: 'badge-neutral',
};

const platformIcons: Record<string, string> = {
  ZOOM: '🎦',
  GOOGLE_MEET: '📹',
  TEAMS: '💼',
  WEBEX: '🌐',
  OTHER: '📺',
};

export default function MeetingsPage() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [meetingUrl, setMeetingUrl] = useState('');
  const [meetingTitle, setMeetingTitle] = useState('');

  const { data: meetings, isLoading } = useQuery({
    queryKey: ['meetings'],
    queryFn: () => api.getMeetings({ pageSize: 50 }),
  });

  const { data: stats } = useQuery({
    queryKey: ['meetingStats'],
    queryFn: () => api.getMeetingStats(),
  });

  const createMutation = useMutation({
    mutationFn: () => api.createMeeting({ meetingUrl, title: meetingTitle || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['meetingStats'] });
      setShowAddModal(false);
      setMeetingUrl('');
      setMeetingTitle('');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancelMeeting(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
  });

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-100">Meetings</h1>
          <p className="mt-1 text-surface-400">Record, transcribe, and analyze your sales calls.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          Add Meeting
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="mb-6 grid gap-4 sm:grid-cols-4">
          <div className="card p-4">
            <p className="text-sm text-surface-400">Total Meetings</p>
            <p className="mt-1 text-2xl font-bold text-surface-100">{stats.total}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-surface-400">This Week</p>
            <p className="mt-1 text-2xl font-bold text-surface-100">{stats.thisWeek}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-surface-400">Recorded</p>
            <p className="mt-1 text-2xl font-bold text-green-400">{stats.recorded}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-surface-400">With Insights</p>
            <p className="mt-1 text-2xl font-bold text-primary-400">{stats.withInsights}</p>
          </div>
        </div>
      )}

      {/* Meetings list */}
      <div className="card">
        <div className="border-b border-surface-800 p-4">
          <h2 className="font-semibold text-surface-100">All Meetings</h2>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="animate-spin text-surface-500" size={24} />
          </div>
        ) : !meetings || meetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-4 rounded-full bg-surface-800 p-4">
              <Video className="text-surface-500" size={32} />
            </div>
            <h3 className="mb-2 font-semibold text-surface-200">No meetings yet</h3>
            <p className="mb-6 max-w-sm text-sm text-surface-400">
              Connect your calendar or add a meeting URL to start recording and transcribing your sales calls.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowAddModal(true)}
                className="btn-primary flex items-center gap-2"
              >
                <Plus size={18} />
                Add Meeting
              </button>
              <Link href="/settings/integrations" className="btn-secondary flex items-center gap-2">
                <Calendar size={18} />
                Connect Calendar
              </Link>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-surface-800">
            {meetings.map((meeting) => (
              <div
                key={meeting.id}
                className="flex items-center justify-between p-4 transition-colors hover:bg-surface-800/50"
              >
                <Link href={`/meetings/${meeting.id}`} className="flex flex-1 items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-800 text-xl">
                    {platformIcons[meeting.platform] ?? platformIcons.OTHER}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-surface-100">
                      {meeting.title || meeting.calendarEvent?.title || 'Untitled Meeting'}
                    </p>
                    <div className="flex items-center gap-2 text-sm text-surface-500">
                      <span>{meeting.platform.replace('_', ' ')}</span>
                      <span>•</span>
                      <span>
                        {meeting.scheduledAt
                          ? new Date(meeting.scheduledAt).toLocaleString()
                          : 'No date'}
                      </span>
                      {meeting.hasInsights && (
                        <>
                          <span>•</span>
                          <span className="text-primary-400">Has insights</span>
                        </>
                      )}
                    </div>
                  </div>
                </Link>

                <div className="flex items-center gap-4">
                  <span className={statusColors[meeting.status] ?? 'badge-neutral'}>
                    {meeting.status.replace('_', ' ')}
                  </span>

                  {['SCHEDULED', 'BOT_JOINING'].includes(meeting.status) && (
                    <button
                      onClick={() => cancelMutation.mutate(meeting.id)}
                      disabled={cancelMutation.isPending}
                      className="btn-ghost text-red-400 hover:text-red-300"
                      title="Cancel recording"
                    >
                      <XCircle size={18} />
                    </button>
                  )}

                  <a
                    href={meeting.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost"
                    title="Open meeting link"
                  >
                    <ExternalLink size={18} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Meeting Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-lg animate-slide-up">
            <div className="flex items-center justify-between border-b border-surface-800 p-4">
              <h2 className="text-lg font-semibold text-surface-100">Add Meeting</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-surface-400 hover:bg-surface-800 hover:text-surface-100"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
              className="p-4"
            >
              <div className="space-y-4">
                <div>
                  <label htmlFor="meetingUrl" className="mb-2 block text-sm font-medium text-surface-300">
                    Meeting URL *
                  </label>
                  <input
                    id="meetingUrl"
                    type="url"
                    value={meetingUrl}
                    onChange={(e) => setMeetingUrl(e.target.value)}
                    className="input"
                    placeholder="https://zoom.us/j/... or https://meet.google.com/..."
                    required
                  />
                  <p className="mt-1 text-xs text-surface-500">
                    Supports Zoom, Google Meet, Microsoft Teams, and Webex
                  </p>
                </div>

                <div>
                  <label htmlFor="meetingTitle" className="mb-2 block text-sm font-medium text-surface-300">
                    Title (optional)
                  </label>
                  <input
                    id="meetingTitle"
                    type="text"
                    value={meetingTitle}
                    onChange={(e) => setMeetingTitle(e.target.value)}
                    className="input"
                    placeholder="Sales call with Acme Corp"
                  />
                </div>
              </div>

              {createMutation.isError && (
                <div className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
                  {(createMutation.error as Error).message}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || !meetingUrl}
                  className="btn-primary"
                >
                  {createMutation.isPending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    'Start Recording'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
