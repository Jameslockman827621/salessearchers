'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  Video,
  Calendar,
  ArrowRight,
  Lightbulb,
  Target,
  Loader2,
  FolderOpen,
  Linkedin,
  Mail,
  Users,
  Activity,
} from 'lucide-react';

export default function DashboardPage() {
  const { data: taskStats } = useQuery({
    queryKey: ['taskStats'],
    queryFn: () => api.getTaskStats(),
  });

  const { data: meetingStats } = useQuery({
    queryKey: ['meetingStats'],
    queryFn: () => api.getMeetingStats(),
  });

  const { data: recentMeetings, isLoading: loadingMeetings } = useQuery({
    queryKey: ['recentMeetings'],
    queryFn: () => api.getMeetings({ pageSize: 5 }),
  });

  const { data: overdueTasks, isLoading: loadingTasks } = useQuery({
    queryKey: ['overdueTasks'],
    queryFn: () => api.getTasks({ pageSize: 5, overdue: true }),
  });

  const { data: upcomingEvents, isLoading: loadingEvents } = useQuery({
    queryKey: ['upcomingEvents'],
    queryFn: () => api.getCalendarEvents(),
  });

  const { data: dataRooms } = useQuery({
    queryKey: ['dataRooms'],
    queryFn: () => api.getDataRooms({ status: 'ACTIVE' }),
  });

  const { data: linkedInStats } = useQuery({
    queryKey: ['linkedInStats'],
    queryFn: () => api.getLinkedInStats(),
  });

  const { data: activitySummary } = useQuery({
    queryKey: ['activitySummary'],
    queryFn: () => api.getActivitySummary(7),
  });

  const { data: recentActivities } = useQuery({
    queryKey: ['recentActivities'],
    queryFn: () => api.getActivities({ limit: 5 }),
  });

  const stats = [
    {
      name: 'Overdue Tasks',
      value: taskStats?.overdue ?? 0,
      icon: AlertTriangle,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
      href: '/tasks',
    },
    {
      name: 'Due Today',
      value: taskStats?.dueToday ?? 0,
      icon: Clock,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10',
      href: '/tasks',
    },
    {
      name: 'Meetings This Week',
      value: meetingStats?.thisWeek ?? 0,
      icon: Video,
      color: 'text-primary-400',
      bgColor: 'bg-primary-500/10',
      href: '/meetings',
    },
    {
      name: 'Active Data Rooms',
      value: dataRooms?.length ?? 0,
      icon: FolderOpen,
      color: 'text-indigo-400',
      bgColor: 'bg-indigo-500/10',
      href: '/data-rooms',
    },
    {
      name: 'LinkedIn Pending',
      value: linkedInStats?.pendingCount ?? 0,
      icon: Linkedin,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      href: '/linkedin',
    },
    {
      name: 'Activities (7d)',
      value: activitySummary?.totalActivities ?? 0,
      icon: Activity,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      href: '/activities',
    },
  ];

  const statusColors: Record<string, string> = {
    SCHEDULED: 'badge-primary',
    BOT_JOINING: 'badge-warning',
    RECORDING: 'bg-red-500/20 text-red-400',
    PROCESSING: 'badge-warning',
    READY: 'badge-success',
    FAILED: 'badge-danger',
    CANCELLED: 'badge-neutral',
  };

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-surface-100">Dashboard</h1>
        <p className="mt-1 text-surface-400">Here's what needs your attention today.</p>
      </div>

      {/* Stats grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.name}
              href={stat.href}
              className="card p-6 transition-colors hover:border-surface-700"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-surface-400">{stat.name}</p>
                  <p className="mt-1 text-3xl font-bold text-surface-100">{stat.value}</p>
                </div>
                <div className={`rounded-lg p-3 ${stat.bgColor}`}>
                  <Icon className={stat.color} size={24} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Four column layout */}
      <div className="grid gap-6 lg:grid-cols-4">
        {/* Overdue tasks */}
        <div className="card">
          <div className="flex items-center justify-between border-b border-surface-800 p-4">
            <h2 className="font-semibold text-surface-100">Overdue Tasks</h2>
            <Link href="/tasks" className="text-sm text-primary-400 hover:text-primary-300">
              View all
            </Link>
          </div>
          {loadingTasks ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="animate-spin text-surface-500" size={20} />
            </div>
          ) : !overdueTasks || overdueTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <CheckCircle2 className="mb-2 text-green-400" size={32} />
              <p className="text-surface-400">No overdue tasks 🎉</p>
            </div>
          ) : (
            <div className="divide-y divide-surface-800">
              {overdueTasks.slice(0, 5).map((task) => (
                <div key={task.id} className="p-4">
                  <p className="font-medium text-surface-200">{task.title}</p>
                  <p className="mt-1 text-xs text-red-400">
                    Due: {task.dueAt ? new Date(task.dueAt).toLocaleDateString() : 'No date'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent meetings */}
        <div className="card">
          <div className="flex items-center justify-between border-b border-surface-800 p-4">
            <h2 className="font-semibold text-surface-100">Recent Meetings</h2>
            <Link href="/meetings" className="text-sm text-primary-400 hover:text-primary-300">
              View all
            </Link>
          </div>
          {loadingMeetings ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="animate-spin text-surface-500" size={20} />
            </div>
          ) : !recentMeetings || recentMeetings.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Video className="mb-2 text-surface-500" size={32} />
              <p className="text-surface-400">No meetings yet</p>
              <Link href="/meetings" className="mt-2 text-sm text-primary-400 hover:text-primary-300">
                Add a meeting
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-surface-800">
              {recentMeetings.slice(0, 5).map((meeting) => (
                <Link
                  key={meeting.id}
                  href={`/meetings/${meeting.id}`}
                  className="block p-4 transition-colors hover:bg-surface-800/50"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-surface-200 truncate">
                      {meeting.title || 'Untitled'}
                    </p>
                    <span className={`text-xs ${statusColors[meeting.status]}`}>
                      {meeting.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-surface-500">
                    {meeting.scheduledAt
                      ? new Date(meeting.scheduledAt).toLocaleString()
                      : 'No date'}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming calendar events */}
        <div className="card">
          <div className="flex items-center justify-between border-b border-surface-800 p-4">
            <h2 className="font-semibold text-surface-100">Upcoming Events</h2>
            <Link
              href="/settings/integrations"
              className="text-sm text-primary-400 hover:text-primary-300"
            >
              Connect calendar
            </Link>
          </div>
          {loadingEvents ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="animate-spin text-surface-500" size={20} />
            </div>
          ) : !upcomingEvents || upcomingEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Calendar className="mb-2 text-surface-500" size={32} />
              <p className="text-surface-400">No upcoming events</p>
              <Link
                href="/settings/integrations"
                className="mt-2 text-sm text-primary-400 hover:text-primary-300"
              >
                Connect your calendar
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-surface-800">
              {upcomingEvents.slice(0, 5).map((event) => (
                <div key={event.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-surface-200 truncate">
                      {event.title || 'No title'}
                    </p>
                    {event.meeting ? (
                      <span className="badge-success text-xs">Recording</span>
                    ) : event.meetingUrl ? (
                      <span className="badge-neutral text-xs">Has link</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-surface-500">
                    {new Date(event.startTime).toLocaleString()}
                  </p>
                  {event.calendarConnection && (
                    <p className="mt-1 text-xs text-surface-600">
                      {event.calendarConnection.provider} • {event.calendarConnection.email}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card">
          <div className="flex items-center justify-between border-b border-surface-800 p-4">
            <h2 className="font-semibold text-surface-100">Recent Activity</h2>
            <Link href="/activities" className="text-sm text-primary-400 hover:text-primary-300">
              View all
            </Link>
          </div>
          {!recentActivities?.data || recentActivities.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Activity className="mb-2 text-surface-500" size={32} />
              <p className="text-surface-400">No recent activity</p>
            </div>
          ) : (
            <div className="divide-y divide-surface-800">
              {recentActivities.data.slice(0, 5).map((activity) => (
                <div key={activity.id} className="p-4">
                  <p className="font-medium text-surface-200 truncate">{activity.title}</p>
                  {activity.description && (
                    <p className="mt-0.5 text-xs text-surface-400 truncate">{activity.description}</p>
                  )}
                  <div className="mt-1 flex items-center gap-2 text-xs text-surface-500">
                    {activity.contact && (
                      <span className="flex items-center gap-1">
                        <Users size={10} />
                        {activity.contact.firstName ?? activity.contact.email}
                      </span>
                    )}
                    <span>{new Date(activity.occurredAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-8">
        <h2 className="mb-4 font-semibold text-surface-100">Quick Actions</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/meetings"
            className="card flex items-center gap-4 p-4 transition-colors hover:border-surface-700"
          >
            <div className="rounded-lg bg-primary-500/10 p-3">
              <Video className="text-primary-400" size={20} />
            </div>
            <div>
              <p className="font-medium text-surface-100">Add Meeting</p>
              <p className="text-sm text-surface-400">Record a new call</p>
            </div>
            <ArrowRight className="ml-auto text-surface-500" size={16} />
          </Link>

          <Link
            href="/tasks"
            className="card flex items-center gap-4 p-4 transition-colors hover:border-surface-700"
          >
            <div className="rounded-lg bg-green-500/10 p-3">
              <Target className="text-green-400" size={20} />
            </div>
            <div>
              <p className="font-medium text-surface-100">Add Task</p>
              <p className="text-sm text-surface-400">Create a follow-up</p>
            </div>
            <ArrowRight className="ml-auto text-surface-500" size={16} />
          </Link>

          <Link
            href="/settings/integrations"
            className="card flex items-center gap-4 p-4 transition-colors hover:border-surface-700"
          >
            <div className="rounded-lg bg-blue-500/10 p-3">
              <Calendar className="text-blue-400" size={20} />
            </div>
            <div>
              <p className="font-medium text-surface-100">Connect Calendar</p>
              <p className="text-sm text-surface-400">Auto-record meetings</p>
            </div>
            <ArrowRight className="ml-auto text-surface-500" size={16} />
          </Link>

          <Link
            href="/settings/recording"
            className="card flex items-center gap-4 p-4 transition-colors hover:border-surface-700"
          >
            <div className="rounded-lg bg-yellow-500/10 p-3">
              <TrendingUp className="text-yellow-400" size={20} />
            </div>
            <div>
              <p className="font-medium text-surface-100">Recording Rules</p>
              <p className="text-sm text-surface-400">Configure auto-record</p>
            </div>
            <ArrowRight className="ml-auto text-surface-500" size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
