'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  ArrowLeft,
  Video,
  FileText,
  Lightbulb,
  Users,
  Clock,
  Calendar,
  ExternalLink,
  RefreshCw,
  CheckSquare,
  Loader2,
  Play,
  AlertTriangle,
  Target,
  MessageSquare,
  TrendingUp,
} from 'lucide-react';

const statusColors: Record<string, string> = {
  SCHEDULED: 'badge-primary',
  BOT_JOINING: 'badge-warning',
  RECORDING: 'bg-red-500/20 text-red-400',
  PROCESSING: 'badge-warning',
  READY: 'badge-success',
  FAILED: 'badge-danger',
  CANCELLED: 'badge-neutral',
};

export default function MeetingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const meetingId = params.id as string;

  const { data: meeting, isLoading, error } = useQuery({
    queryKey: ['meeting', meetingId],
    queryFn: () => api.getMeeting(meetingId),
  });

  const regenerateMutation = useMutation({
    mutationFn: () => api.regenerateInsights(meetingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] });
    },
  });

  const createTasksMutation = useMutation({
    mutationFn: () => api.createTasksFromMeeting(meetingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="animate-spin text-surface-500" size={32} />
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <p className="text-surface-400">Meeting not found</p>
        <Link href="/meetings" className="btn-secondary mt-4">
          Back to Meetings
        </Link>
      </div>
    );
  }

  const hasRecording = meeting.assets.some((a) => a.type === 'video' || a.type === 'audio');
  const videoAsset = meeting.assets.find((a) => a.type === 'video');
  const audioAsset = meeting.assets.find((a) => a.type === 'audio');
  const insight = meeting.insight;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="rounded-lg p-2 text-surface-400 hover:bg-surface-800 hover:text-surface-100"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-surface-100">
            {meeting.title || 'Untitled Meeting'}
          </h1>
          <div className="mt-1 flex items-center gap-4 text-sm text-surface-400">
            <span className="flex items-center gap-1">
              <Calendar size={14} />
              {meeting.scheduledAt
                ? new Date(meeting.scheduledAt).toLocaleString()
                : 'No date'}
            </span>
            {meeting.duration && (
              <span className="flex items-center gap-1">
                <Clock size={14} />
                {Math.round(meeting.duration / 60)} min
              </span>
            )}
            <span className={statusColors[meeting.status]}>{meeting.status.replace('_', ' ')}</span>
          </div>
        </div>
        <a
          href={meeting.meetingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary flex items-center gap-2"
        >
          <ExternalLink size={16} />
          Open Meeting
        </a>
      </div>

      {/* Processing state */}
      {['SCHEDULED', 'BOT_JOINING', 'RECORDING', 'PROCESSING'].includes(meeting.status) && (
        <div className="mb-6 flex items-center gap-3 rounded-lg bg-primary-500/10 p-4 text-primary-400">
          <Loader2 className="animate-spin" size={20} />
          <span>
            {meeting.status === 'SCHEDULED' && 'Bot is scheduled to join this meeting.'}
            {meeting.status === 'BOT_JOINING' && 'Bot is joining the meeting...'}
            {meeting.status === 'RECORDING' && 'Recording in progress...'}
            {meeting.status === 'PROCESSING' && 'Processing recording and generating insights...'}
          </span>
        </div>
      )}

      {/* Failed state */}
      {meeting.status === 'FAILED' && (
        <div className="mb-6 flex items-center gap-3 rounded-lg bg-red-500/10 p-4 text-red-400">
          <AlertTriangle size={20} />
          <span>Failed to record this meeting. The bot may not have been able to join.</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Recording */}
          {hasRecording && (
            <div className="card">
              <div className="border-b border-surface-800 p-4">
                <h2 className="flex items-center gap-2 font-semibold text-surface-100">
                  <Video size={18} />
                  Recording
                </h2>
              </div>
              <div className="p-4">
                {videoAsset?.url ? (
                  <video
                    src={videoAsset.url}
                    controls
                    className="w-full rounded-lg bg-black"
                  />
                ) : audioAsset?.url ? (
                  <audio src={audioAsset.url} controls className="w-full" />
                ) : (
                  <p className="text-surface-400">Recording not yet available</p>
                )}
              </div>
            </div>
          )}

          {/* Transcript */}
          {meeting.transcript && (
            <div className="card">
              <div className="border-b border-surface-800 p-4">
                <h2 className="flex items-center gap-2 font-semibold text-surface-100">
                  <FileText size={18} />
                  Transcript
                </h2>
              </div>
              <div className="max-h-96 overflow-y-auto p-4">
                {meeting.transcript.text ? (
                  <pre className="whitespace-pre-wrap font-sans text-sm text-surface-300">
                    {meeting.transcript.text}
                  </pre>
                ) : (
                  <p className="text-surface-400">Transcript not yet available</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Summary */}
          {insight?.summary && (
            <div className="card">
              <div className="border-b border-surface-800 p-4">
                <h2 className="flex items-center gap-2 font-semibold text-surface-100">
                  <Lightbulb size={18} />
                  Summary
                </h2>
              </div>
              <div className="p-4">
                <p className="text-sm text-surface-300">{insight.summary}</p>
              </div>
            </div>
          )}

          {/* Action Items */}
          {insight?.actionItems && insight.actionItems.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between border-b border-surface-800 p-4">
                <h2 className="flex items-center gap-2 font-semibold text-surface-100">
                  <CheckSquare size={18} />
                  Action Items
                </h2>
                <button
                  onClick={() => createTasksMutation.mutate()}
                  disabled={createTasksMutation.isPending}
                  className="btn-ghost text-sm text-primary-400"
                >
                  {createTasksMutation.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    'Create Tasks'
                  )}
                </button>
              </div>
              <div className="divide-y divide-surface-800">
                {insight.actionItems.map((item, i) => (
                  <div key={i} className="p-4">
                    <p className="text-sm text-surface-200">{item.text}</p>
                    {item.assignee && (
                      <p className="mt-1 text-xs text-surface-500">Assignee: {item.assignee}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key Topics */}
          {insight?.keyTopics && insight.keyTopics.length > 0 && (
            <div className="card">
              <div className="border-b border-surface-800 p-4">
                <h2 className="flex items-center gap-2 font-semibold text-surface-100">
                  <Target size={18} />
                  Key Topics
                </h2>
              </div>
              <div className="flex flex-wrap gap-2 p-4">
                {insight.keyTopics.map((topic, i) => (
                  <span key={i} className="badge-primary">
                    {topic.topic}
                    {topic.mentions && <span className="ml-1 opacity-60">({topic.mentions})</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Objections */}
          {insight?.objections && insight.objections.length > 0 && (
            <div className="card">
              <div className="border-b border-surface-800 p-4">
                <h2 className="flex items-center gap-2 font-semibold text-surface-100">
                  <MessageSquare size={18} />
                  Objections
                </h2>
              </div>
              <div className="divide-y divide-surface-800">
                {insight.objections.map((obj, i) => (
                  <div key={i} className="p-4">
                    <p className="text-sm text-surface-200">{obj.text}</p>
                    {obj.response && (
                      <p className="mt-2 text-xs text-surface-400">
                        <strong>Response:</strong> {obj.response}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Coaching Tips */}
          {insight?.coachingTips && insight.coachingTips.length > 0 && (
            <div className="card">
              <div className="border-b border-surface-800 p-4">
                <h2 className="flex items-center gap-2 font-semibold text-surface-100">
                  <TrendingUp size={18} />
                  Coaching Tips
                </h2>
              </div>
              <div className="divide-y divide-surface-800">
                {insight.coachingTips.map((tip, i) => (
                  <div key={i} className="p-4">
                    <p className="text-sm text-surface-200">{tip.tip}</p>
                    {tip.category && (
                      <span className="mt-2 inline-block rounded bg-surface-800 px-2 py-0.5 text-xs text-surface-400">
                        {tip.category}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Participants */}
          {meeting.participants.length > 0 && (
            <div className="card">
              <div className="border-b border-surface-800 p-4">
                <h2 className="flex items-center gap-2 font-semibold text-surface-100">
                  <Users size={18} />
                  Participants
                </h2>
              </div>
              <div className="divide-y divide-surface-800">
                {meeting.participants.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-700 text-sm font-medium text-surface-300">
                      {(p.name || p.email)?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-surface-200">
                        {p.name || p.email || 'Unknown'}
                      </p>
                      {p.isExternal && (
                        <span className="text-xs text-primary-400">External</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {meeting.status === 'READY' && meeting.transcript && (
            <div className="card p-4">
              <button
                onClick={() => regenerateMutation.mutate()}
                disabled={regenerateMutation.isPending}
                className="btn-secondary flex w-full items-center justify-center gap-2"
              >
                {regenerateMutation.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    <RefreshCw size={16} />
                    Regenerate Insights
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

