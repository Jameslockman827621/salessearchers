'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Activity,
  Mail,
  Phone,
  Video,
  Users,
  Building2,
  Layers,
  FolderOpen,
  MessageSquare,
  Calendar,
  Check,
  TrendingUp,
  Filter,
  Linkedin,
  Eye,
} from 'lucide-react';
import Link from 'next/link';

const ACTIVITY_ICONS: Record<string, typeof Activity> = {
  email_sent: Mail,
  email_opened: Mail,
  email_clicked: Mail,
  email_replied: Mail,
  meeting_scheduled: Calendar,
  meeting_held: Video,
  call_made: Phone,
  task_created: Check,
  task_completed: Check,
  deal_created: Layers,
  deal_stage_changed: TrendingUp,
  contact_created: Users,
  linkedin_profile_view: Linkedin,
  linkedin_connection_request: Linkedin,
  linkedin_message: Linkedin,
  data_room_created: FolderOpen,
  data_room_viewed: Eye,
};

const ACTIVITY_COLORS: Record<string, string> = {
  email_sent: 'bg-blue-500/20 text-blue-400',
  email_opened: 'bg-emerald-500/20 text-emerald-400',
  email_replied: 'bg-emerald-500/20 text-emerald-400',
  meeting_scheduled: 'bg-purple-500/20 text-purple-400',
  meeting_held: 'bg-purple-500/20 text-purple-400',
  call_made: 'bg-orange-500/20 text-orange-400',
  task_completed: 'bg-emerald-500/20 text-emerald-400',
  deal_created: 'bg-amber-500/20 text-amber-400',
  deal_stage_changed: 'bg-amber-500/20 text-amber-400',
  linkedin_profile_view: 'bg-blue-500/20 text-blue-400',
  linkedin_connection_request: 'bg-blue-500/20 text-blue-400',
  data_room_viewed: 'bg-indigo-500/20 text-indigo-400',
};

export default function ActivitiesPage() {
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [dateRange, setDateRange] = useState<string>('7');

  const { data: activitiesData, isLoading } = useQuery({
    queryKey: ['activities', typeFilter],
    queryFn: () => api.getActivities({ type: typeFilter || undefined, limit: 100 }),
  });

  const { data: summary } = useQuery({
    queryKey: ['activity-summary', dateRange],
    queryFn: () => api.getActivitySummary(parseInt(dateRange)),
  });

  const { data: activityTypes } = useQuery({
    queryKey: ['activity-types'],
    queryFn: () => api.getActivityTypes(),
  });

  const activities = activitiesData?.data ?? [];

  const getActivityIcon = (type: string) => {
    const Icon = ACTIVITY_ICONS[type] ?? Activity;
    return Icon;
  };

  const getActivityColor = (type: string) => {
    return ACTIVITY_COLORS[type] ?? 'bg-surface-500/20 text-surface-400';
  };

  // Group activities by date
  const groupedActivities = activities.reduce((groups, activity) => {
    const date = format(new Date(activity.occurredAt), 'yyyy-MM-dd');
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(activity);
    return groups;
  }, {} as Record<string, typeof activities>);

  return (
    <div className="min-h-screen bg-surface-950">
      {/* Header */}
      <div className="border-b border-surface-800 bg-surface-900/50">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-surface-100">Activity Timeline</h1>
              <p className="mt-1 text-sm text-surface-400">
                Track all interactions across your sales pipeline
              </p>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="mt-6 grid grid-cols-4 gap-4">
            <div className="rounded-lg border border-surface-700 bg-surface-800/50 p-4">
              <p className="text-sm text-surface-400">Total Activities</p>
              <p className="mt-1 text-2xl font-semibold text-surface-100">
                {summary?.totalActivities ?? 0}
              </p>
              <p className="text-xs text-surface-500 mt-1">Last {dateRange} days</p>
            </div>
            <div className="rounded-lg border border-surface-700 bg-surface-800/50 p-4">
              <p className="text-sm text-surface-400">Emails</p>
              <p className="mt-1 text-2xl font-semibold text-surface-100">
                {(summary?.byType?.email_sent ?? 0) + (summary?.byType?.email_replied ?? 0)}
              </p>
            </div>
            <div className="rounded-lg border border-surface-700 bg-surface-800/50 p-4">
              <p className="text-sm text-surface-400">Meetings</p>
              <p className="mt-1 text-2xl font-semibold text-surface-100">
                {(summary?.byType?.meeting_scheduled ?? 0) + (summary?.byType?.meeting_held ?? 0)}
              </p>
            </div>
            <div className="rounded-lg border border-surface-700 bg-surface-800/50 p-4">
              <p className="text-sm text-surface-400">Active Contacts</p>
              <p className="mt-1 text-2xl font-semibold text-surface-100">
                {summary?.topContacts?.length ?? 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-8">
        <div className="flex gap-8">
          {/* Main Timeline */}
          <div className="flex-1">
            {/* Filters */}
            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-center gap-2 text-sm text-surface-400">
                <Filter size={16} />
                Filter:
              </div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
              >
                <option value="">All Activities</option>
                {activityTypes?.map((t) => (
                  <option key={t.type} value={t.type}>
                    {t.label} ({t.count})
                  </option>
                ))}
              </select>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
              >
                <option value="7">Last 7 days</option>
                <option value="14">Last 14 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
            </div>

            {isLoading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
              </div>
            ) : activities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-800">
                  <Activity size={32} className="text-surface-500" />
                </div>
                <h3 className="mt-4 text-lg font-medium text-surface-100">No activities yet</h3>
                <p className="mt-1 text-sm text-surface-400">
                  Activities will appear here as you interact with contacts
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {Object.entries(groupedActivities).map(([date, dayActivities]) => (
                  <div key={date}>
                    <div className="sticky top-0 z-10 bg-surface-950 py-2">
                      <h3 className="text-sm font-medium text-surface-400">
                        {format(new Date(date), 'EEEE, MMMM d, yyyy')}
                      </h3>
                    </div>
                    <div className="relative ml-4 border-l border-surface-800 pl-6 space-y-4">
                      {dayActivities.map((activity) => {
                        const Icon = getActivityIcon(activity.type);
                        return (
                          <div key={activity.id} className="relative">
                            {/* Timeline dot */}
                            <div
                              className={`absolute -left-[30px] flex h-6 w-6 items-center justify-center rounded-full ${getActivityColor(activity.type)}`}
                            >
                              <Icon size={12} />
                            </div>

                            {/* Activity card */}
                            <div className="rounded-lg border border-surface-800 bg-surface-900 p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h4 className="font-medium text-surface-100">{activity.title}</h4>
                                  {activity.description && (
                                    <p className="mt-1 text-sm text-surface-400">{activity.description}</p>
                                  )}

                                  {/* Related entities */}
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {activity.contact && (
                                      <Link
                                        href={`/contacts/${activity.contact.id}`}
                                        className="flex items-center gap-1 rounded-full bg-surface-800 px-2 py-1 text-xs text-surface-300 hover:bg-surface-700"
                                      >
                                        <Users size={10} />
                                        {activity.contact.firstName ?? activity.contact.email}
                                      </Link>
                                    )}
                                    {activity.company && (
                                      <Link
                                        href={`/companies/${activity.company.id}`}
                                        className="flex items-center gap-1 rounded-full bg-surface-800 px-2 py-1 text-xs text-surface-300 hover:bg-surface-700"
                                      >
                                        <Building2 size={10} />
                                        {activity.company.name}
                                      </Link>
                                    )}
                                    {activity.deal && (
                                      <Link
                                        href={`/pipeline?deal=${activity.deal.id}`}
                                        className="flex items-center gap-1 rounded-full bg-surface-800 px-2 py-1 text-xs text-surface-300 hover:bg-surface-700"
                                      >
                                        <Layers size={10} />
                                        {activity.deal.name}
                                      </Link>
                                    )}
                                    {activity.dataRoom && (
                                      <Link
                                        href={`/data-rooms/${activity.dataRoom.id}`}
                                        className="flex items-center gap-1 rounded-full bg-surface-800 px-2 py-1 text-xs text-surface-300 hover:bg-surface-700"
                                      >
                                        <FolderOpen size={10} />
                                        {activity.dataRoom.name}
                                      </Link>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-3">
                                  {activity.user && (
                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-700 text-xs font-medium text-surface-300">
                                      {activity.user.firstName?.[0] ?? '?'}
                                    </div>
                                  )}
                                  <span className="text-xs text-surface-500">
                                    {format(new Date(activity.occurredAt), 'h:mm a')}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar - Top Contacts */}
          <div className="w-80 flex-shrink-0">
            <div className="rounded-xl border border-surface-800 bg-surface-900 p-5 sticky top-6">
              <h3 className="font-medium text-surface-100 mb-4">Most Active Contacts</h3>
              {summary?.topContacts && summary.topContacts.length > 0 ? (
                <div className="space-y-3">
                  {summary.topContacts.slice(0, 8).map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-700 text-xs font-medium text-surface-300">
                        {item.contact?.firstName?.[0] ?? item.contact?.email?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-surface-100 truncate">
                          {item.contact?.firstName
                            ? `${item.contact.firstName} ${item.contact.lastName ?? ''}`
                            : item.contact?.email ?? 'Unknown'}
                        </p>
                        <p className="text-xs text-surface-500">
                          {item.activityCount} activities
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-surface-500">No active contacts yet</p>
              )}
            </div>

            {/* Activity by Type */}
            {summary?.byType && Object.keys(summary.byType).length > 0 && (
              <div className="mt-6 rounded-xl border border-surface-800 bg-surface-900 p-5">
                <h3 className="font-medium text-surface-100 mb-4">Activity Breakdown</h3>
                <div className="space-y-3">
                  {Object.entries(summary.byType)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 6)
                    .map(([type, count]) => {
                      const Icon = ACTIVITY_ICONS[type] ?? Activity;
                      return (
                        <div key={type} className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${getActivityColor(type)}`}>
                            <Icon size={14} />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-surface-300 capitalize">
                              {type.replace(/_/g, ' ')}
                            </p>
                          </div>
                          <span className="text-sm font-medium text-surface-100">{count}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

