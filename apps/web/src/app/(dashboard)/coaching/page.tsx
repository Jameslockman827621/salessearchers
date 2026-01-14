'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Lightbulb,
  TrendingUp,
  MessageSquare,
  Target,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Video,
  Clock,
  BarChart3,
  Award,
} from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';

interface CoachingTip {
  id: string;
  category: string | null;
  severity: string | null;
  title: string;
  tip: string;
  suggestion: string | null;
  isDismissed: boolean;
  meetingInsight: {
    id: string;
    meeting: { id: string; title: string | null; scheduledAt: string | null };
  } | null;
  createdAt: string;
}

const severityConfig = {
  positive: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
  neutral: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  warning: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  critical: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
};

const categoryIcons: Record<string, React.ElementType> = {
  talk_ratio: MessageSquare,
  questions: Target,
  objection_handling: AlertTriangle,
  closing: TrendingUp,
  discovery: Lightbulb,
  default: Lightbulb,
};

export default function CoachingPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [showDismissed, setShowDismissed] = useState(false);

  const pageSize = 20;

  const { data: tipsData, isLoading: tipsLoading } = useQuery({
    queryKey: ['coaching-tips', page, categoryFilter, showDismissed],
    queryFn: () =>
      api.getCoachingTips({
        page,
        pageSize,
        category: categoryFilter || undefined,
        dismissed: showDismissed,
      }),
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['coaching-stats'],
    queryFn: () => api.getCoachingStats(),
  });

  const { data: currentSession } = useQuery({
    queryKey: ['coaching-session-current'],
    queryFn: () => api.get<{
      meetingCount: number;
      totalTalkTime: number;
      totalListenTime: number;
      avgTalkRatio: number | null;
      avgSentiment: number | null;
      questionsAsked: number;
      objectionHandled: number;
      actionItemsCreated: number;
      followUpsMade: number;
      strengths: Array<{ area: string; score: number; examples: string[] }>;
      improvements: Array<{ area: string; score: number; suggestions: string[] }>;
      weeklyGoals: Array<{ goal: string; target: number; progress: number }>;
      overallScore: number | null;
    }>('/api/coaching/sessions/current'),
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => api.dismissCoachingTip(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coaching-tips'] });
      queryClient.invalidateQueries({ queryKey: ['coaching-stats'] });
    },
  });

  const totalPages = tipsData ? Math.ceil(tipsData.total / pageSize) : 0;

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="border-b border-surface-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-surface-100">AI Coaching</h1>
            <p className="text-sm text-surface-500">
              Personalized insights to improve your sales performance
            </p>
          </div>
          {stats && (
            <div className="flex items-center gap-6 text-sm">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary-400">{stats.activeTips}</p>
                <p className="text-surface-500">Active Tips</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-surface-300">{stats.totalTips}</p>
                <p className="text-surface-500">Total Tips</p>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl">
          {/* Performance Overview */}
          {currentSession && (
            <div className="mb-8">
              <h2 className="mb-4 text-lg font-semibold text-surface-100">
                This Week's Performance
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-surface-800 bg-surface-900 p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Video size={18} className="text-primary-400" />
                    <span className="text-sm text-surface-500">Meetings</span>
                  </div>
                  <p className="text-2xl font-bold text-surface-100">
                    {currentSession.meetingCount}
                  </p>
                </div>

                <div className="rounded-xl border border-surface-800 bg-surface-900 p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Clock size={18} className="text-blue-400" />
                    <span className="text-sm text-surface-500">Talk Time</span>
                  </div>
                  <p className="text-2xl font-bold text-surface-100">
                    {formatDuration(currentSession.totalTalkTime)}
                  </p>
                  {currentSession.avgTalkRatio !== null && (
                    <p className="mt-1 text-sm text-surface-500">
                      {Math.round(currentSession.avgTalkRatio * 100)}% talk ratio
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-surface-800 bg-surface-900 p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Target size={18} className="text-green-400" />
                    <span className="text-sm text-surface-500">Questions Asked</span>
                  </div>
                  <p className="text-2xl font-bold text-surface-100">
                    {currentSession.questionsAsked}
                  </p>
                </div>

                <div className="rounded-xl border border-surface-800 bg-surface-900 p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Award size={18} className="text-yellow-400" />
                    <span className="text-sm text-surface-500">Overall Score</span>
                  </div>
                  <p className="text-2xl font-bold text-surface-100">
                    {currentSession.overallScore !== null
                      ? `${Math.round(currentSession.overallScore)}%`
                      : '—'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Category Stats */}
          {stats?.byCategory && stats.byCategory.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-4 text-lg font-semibold text-surface-100">
                Tips by Category
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setCategoryFilter('')}
                  className={clsx(
                    'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                    categoryFilter === ''
                      ? 'bg-primary-600 text-white'
                      : 'bg-surface-800 text-surface-300 hover:bg-surface-700'
                  )}
                >
                  All ({stats.totalTips})
                </button>
                {stats.byCategory.map((cat) => {
                  const Icon = categoryIcons[cat.category] ?? categoryIcons.default;
                  return (
                    <button
                      key={cat.category}
                      onClick={() => setCategoryFilter(cat.category)}
                      className={clsx(
                        'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                        categoryFilter === cat.category
                          ? 'bg-primary-600 text-white'
                          : 'bg-surface-800 text-surface-300 hover:bg-surface-700'
                      )}
                    >
                      <Icon size={14} />
                      {cat.category.replace(/_/g, ' ')} ({cat.count})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Toggle Dismissed */}
          <div className="mb-6 flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-surface-400">
              <input
                type="checkbox"
                checked={showDismissed}
                onChange={(e) => {
                  setShowDismissed(e.target.checked);
                  setPage(1);
                }}
                className="rounded border-surface-600 bg-surface-800 text-primary-500 focus:ring-primary-500"
              />
              Show dismissed tips
            </label>
          </div>

          {/* Tips List */}
          {tipsLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
            </div>
          ) : !tipsData?.tips?.length ? (
            <div className="flex h-64 flex-col items-center justify-center text-surface-500">
              <Lightbulb size={48} className="mb-4 opacity-50" />
              <p>No coaching tips yet</p>
              <p className="mt-2 text-sm">
                Complete more meetings to receive personalized coaching insights
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {tipsData.tips.map((tip) => {
                const config = severityConfig[tip.severity as keyof typeof severityConfig] ?? severityConfig.neutral;
                const Icon = config.icon;
                const CategoryIcon = categoryIcons[tip.category ?? 'default'] ?? categoryIcons.default;

                return (
                  <div
                    key={tip.id}
                    className={clsx(
                      'rounded-xl border p-5 transition-colors',
                      tip.isDismissed
                        ? 'border-surface-800 bg-surface-900/50 opacity-60'
                        : `${config.border} ${config.bg}`
                    )}
                  >
                    <div className="flex items-start gap-4">
                      <div className={clsx('rounded-lg p-2', config.bg)}>
                        <Icon size={20} className={config.color} />
                      </div>
                      <div className="flex-1">
                        <div className="mb-2 flex items-center gap-3">
                          <h3 className="font-semibold text-surface-100">{tip.title}</h3>
                          {tip.category && (
                            <span className="flex items-center gap-1 rounded-full bg-surface-800 px-2 py-0.5 text-xs text-surface-400">
                              <CategoryIcon size={10} />
                              {tip.category.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                        <p className="mb-3 text-surface-300">{tip.tip}</p>
                        {tip.suggestion && (
                          <div className="mb-3 rounded-lg bg-surface-800/50 p-3">
                            <p className="text-sm text-surface-400">
                              <span className="font-medium text-surface-300">Suggestion:</span>{' '}
                              {tip.suggestion}
                            </p>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 text-xs text-surface-500">
                            {tip.meetingInsight && (
                              <a
                                href={`/meetings/${tip.meetingInsight.meeting.id}`}
                                className="flex items-center gap-1 hover:text-primary-400"
                              >
                                <Video size={12} />
                                {tip.meetingInsight.meeting.title ?? 'Meeting'}
                              </a>
                            )}
                            <span>{format(new Date(tip.createdAt), 'MMM d, yyyy')}</span>
                          </div>
                          {!tip.isDismissed && (
                            <button
                              onClick={() => dismissMutation.mutate(tip.id)}
                              disabled={dismissMutation.isPending}
                              className="text-xs text-surface-500 hover:text-surface-300"
                            >
                              Dismiss
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-surface-500">
                Showing {(page - 1) * pageSize + 1} to{' '}
                {Math.min(page * pageSize, tipsData?.total ?? 0)} of {tipsData?.total ?? 0}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-lg border border-surface-700 p-2 text-surface-400 transition-colors hover:bg-surface-800 disabled:opacity-50"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-surface-400">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-lg border border-surface-700 p-2 text-surface-400 transition-colors hover:bg-surface-800 disabled:opacity-50"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
