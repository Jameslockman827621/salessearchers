'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Calendar, RefreshCw, Trash2, Plus, CheckCircle2, AlertCircle, Loader2, Mail, Star } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function IntegrationsPage() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Show notifications from OAuth callbacks
  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');

    if (success === 'google') {
      setNotification({
        type: 'success',
        message: 'Google Calendar connected successfully!',
      });
    } else if (success === 'microsoft') {
      setNotification({
        type: 'success',
        message: 'Microsoft Outlook connected successfully!',
      });
    } else if (success === 'email_connected') {
      setNotification({
        type: 'success',
        message: 'Email account connected successfully!',
      });
      queryClient.invalidateQueries({ queryKey: ['emailConnections'] });
    } else if (error) {
      setNotification({
        type: 'error',
        message: error === 'invalid_state' ? 'Invalid session. Please try again.' 
          : error === 'max_connections' ? 'Maximum of 5 email connections reached.'
          : error === 'oauth_failed' ? 'OAuth failed. Please try again.'
          : `Connection failed: ${error}`,
      });
    }

    // Clear notification after 5 seconds
    if (success || error) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, queryClient]);

  const { data: connections, isLoading } = useQuery({
    queryKey: ['calendarConnections'],
    queryFn: () => api.getCalendarConnections(),
  });

  // Email connections
  interface EmailConnectionData {
    id: string;
    provider: string;
    email: string;
    displayName: string | null;
    isActive: boolean;
    isPrimary: boolean;
    dailySentCount: number;
    dailySendLimit: number;
    lastSyncAt: string | null;
  }

  const { data: emailConnections, isLoading: emailLoading } = useQuery({
    queryKey: ['emailConnections'],
    queryFn: () => api.get<EmailConnectionData[]>('/email/connections'),
  });

  const connectGoogleMutation = useMutation({
    mutationFn: () => api.getGoogleAuthUrl(),
    onSuccess: (data) => {
      window.location.href = data.authUrl;
    },
  });

  const connectMicrosoftMutation = useMutation({
    mutationFn: () => api.getMicrosoftAuthUrl(),
    onSuccess: (data) => {
      window.location.href = data.authUrl;
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => api.disconnectCalendar(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendarConnections'] });
      setNotification({ type: 'success', message: 'Calendar disconnected' });
    },
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => api.syncCalendar(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendarConnections'] });
      setNotification({ type: 'success', message: 'Sync started' });
    },
  });

  const scheduleRecordingsMutation = useMutation({
    mutationFn: (id: string) => api.scheduleRecordings(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['calendarConnections'] });
      setNotification({
        type: 'success',
        message: `Scheduled ${data.scheduled} recordings, skipped ${data.skipped}`,
      });
    },
  });

  // Email mutations
  const connectGmailMutation = useMutation({
    mutationFn: async () => {
      const redirectUri = `${window.location.origin}/api/email/connections/gmail/callback`;
      const data = await api.get<{ url: string }>(`/email/connections/gmail/auth-url?redirectUri=${encodeURIComponent(redirectUri)}`);
      return data;
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });

  const disconnectEmailMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/email/connections/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emailConnections'] });
      setNotification({ type: 'success', message: 'Email disconnected' });
    },
  });

  const syncEmailMutation = useMutation({
    mutationFn: (id: string) => api.post(`/email/connections/${id}/sync`),
    onSuccess: () => {
      setNotification({ type: 'success', message: 'Email sync started' });
    },
  });

  const setPrimaryEmailMutation = useMutation({
    mutationFn: (id: string) => api.put(`/email/connections/${id}/primary`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emailConnections'] });
      setNotification({ type: 'success', message: 'Primary email updated' });
    },
  });

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-surface-100">Integrations</h1>
        <p className="mt-1 text-surface-400">Connect your calendars and other services.</p>
      </div>

      {/* Notification */}
      {notification && (
        <div
          className={`mb-6 flex items-center gap-3 rounded-lg p-4 ${
            notification.type === 'success'
              ? 'bg-green-500/10 text-green-400'
              : 'bg-red-500/10 text-red-400'
          }`}
        >
          {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Calendar Connections */}
      <div className="card">
        <div className="border-b border-surface-800 p-4">
          <h2 className="font-semibold text-surface-100">Calendar Connections</h2>
          <p className="mt-1 text-sm text-surface-400">
            Connect your calendar to automatically detect and record meetings.
          </p>
        </div>

        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-surface-500" size={24} />
            </div>
          ) : connections && connections.length > 0 ? (
            <div className="space-y-4">
              {connections.map((connection) => (
                <div
                  key={connection.id}
                  className="flex items-center justify-between rounded-lg border border-surface-700 bg-surface-800/50 p-4"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                        connection.provider === 'GOOGLE' ? 'bg-red-500/20' : 'bg-blue-500/20'
                      }`}
                    >
                      <Calendar
                        className={connection.provider === 'GOOGLE' ? 'text-red-400' : 'text-blue-400'}
                        size={20}
                      />
                    </div>
                    <div>
                      <p className="font-medium text-surface-100">
                        {connection.provider === 'GOOGLE' ? 'Google Calendar' : 'Microsoft Outlook'}
                      </p>
                      <p className="text-sm text-surface-400">{connection.email}</p>
                      <p className="text-xs text-surface-500">
                        {connection.eventCount} events •{' '}
                        {connection.lastSyncAt
                          ? `Last sync: ${new Date(connection.lastSyncAt).toLocaleString()}`
                          : 'Never synced'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => scheduleRecordingsMutation.mutate(connection.id)}
                      disabled={scheduleRecordingsMutation.isPending}
                      className="btn-ghost"
                      title="Schedule recordings for upcoming events"
                    >
                      <Plus size={16} />
                    </button>
                    <button
                      onClick={() => syncMutation.mutate(connection.id)}
                      disabled={syncMutation.isPending}
                      className="btn-ghost"
                      title="Sync now"
                    >
                      <RefreshCw size={16} className={syncMutation.isPending ? 'animate-spin' : ''} />
                    </button>
                    <button
                      onClick={() => disconnectMutation.mutate(connection.id)}
                      disabled={disconnectMutation.isPending}
                      className="btn-ghost text-red-400 hover:text-red-300"
                      title="Disconnect"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-surface-500">No calendars connected yet.</p>
          )}

          {/* Connect buttons */}
          <div className="mt-6 flex flex-wrap gap-4">
            <button
              onClick={() => connectGoogleMutation.mutate()}
              disabled={connectGoogleMutation.isPending}
              className="btn-secondary flex items-center gap-2"
            >
              {connectGoogleMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Calendar size={16} className="text-red-400" />
              )}
              Connect Google Calendar
            </button>
            <button
              onClick={() => connectMicrosoftMutation.mutate()}
              disabled={connectMicrosoftMutation.isPending}
              className="btn-secondary flex items-center gap-2"
            >
              {connectMicrosoftMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Calendar size={16} className="text-blue-400" />
              )}
              Connect Microsoft Outlook
            </button>
          </div>
        </div>
      </div>

      {/* Email Connections */}
      <div className="card mt-6">
        <div className="border-b border-surface-800 p-4">
          <h2 className="font-semibold text-surface-100">Email Connections</h2>
          <p className="mt-1 text-sm text-surface-400">
            Connect up to 5 email accounts to send sequences and manage your inbox.
          </p>
        </div>

        <div className="p-4">
          {emailLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-surface-500" size={24} />
            </div>
          ) : emailConnections && emailConnections.length > 0 ? (
            <div className="space-y-4">
              {emailConnections.map((connection: any) => (
                <div
                  key={connection.id}
                  className="flex items-center justify-between rounded-lg border border-surface-700 bg-surface-800/50 p-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/20">
                      <Mail className="text-indigo-400" size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-surface-100">
                          {connection.displayName || connection.email}
                        </p>
                        {connection.isPrimary && (
                          <span className="px-2 py-0.5 text-xs bg-indigo-600 text-white rounded-full">Primary</span>
                        )}
                      </div>
                      <p className="text-sm text-surface-400">{connection.email}</p>
                      <p className="text-xs text-surface-500">
                        {connection.dailySentCount}/{connection.dailySendLimit} emails sent today •{' '}
                        {connection.lastSyncAt
                          ? `Last sync: ${new Date(connection.lastSyncAt).toLocaleString()}`
                          : 'Never synced'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!connection.isPrimary && (
                      <button
                        onClick={() => setPrimaryEmailMutation.mutate(connection.id)}
                        disabled={setPrimaryEmailMutation.isPending}
                        className="btn-ghost"
                        title="Set as primary"
                      >
                        <Star size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => syncEmailMutation.mutate(connection.id)}
                      disabled={syncEmailMutation.isPending}
                      className="btn-ghost"
                      title="Sync now"
                    >
                      <RefreshCw size={16} className={syncEmailMutation.isPending ? 'animate-spin' : ''} />
                    </button>
                    <button
                      onClick={() => disconnectEmailMutation.mutate(connection.id)}
                      disabled={disconnectEmailMutation.isPending}
                      className="btn-ghost text-red-400 hover:text-red-300"
                      title="Disconnect"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-surface-500">No email accounts connected yet.</p>
          )}

          {/* Connect email button */}
          {(!emailConnections || emailConnections.length < 5) && (
            <div className="mt-6">
              <button
                onClick={() => connectGmailMutation.mutate()}
                disabled={connectGmailMutation.isPending}
                className="btn-secondary flex items-center gap-2"
              >
                {connectGmailMutation.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Mail size={16} className="text-indigo-400" />
                )}
                Connect Gmail Account
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Other integrations placeholder */}
      <div className="card mt-6">
        <div className="border-b border-surface-800 p-4">
          <h2 className="font-semibold text-surface-100">Other Integrations</h2>
        </div>
        <div className="p-8 text-center text-surface-500">
          <p>More integrations coming soon: Salesforce, HubSpot, Slack, LinkedIn, and more.</p>
        </div>
      </div>
    </div>
  );
}

