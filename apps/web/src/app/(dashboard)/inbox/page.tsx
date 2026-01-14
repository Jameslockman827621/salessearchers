'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';

interface EmailThread {
  id: string;
  subject: string | null;
  snippet: string | null;
  participantEmails: string[];
  isStarred: boolean;
  isArchived: boolean;
  lastMessageAt: string | null;
  messageCount: number;
  unreadCount: number;
  latestMessage?: {
    fromEmail: string;
    fromName: string | null;
    isOutbound: boolean;
  };
  connection?: {
    email: string;
    displayName: string | null;
  };
  contact?: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
}

interface EmailConnection {
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

type FilterType = 'all' | 'unread' | 'starred' | 'sent' | 'archived';

export default function InboxPage() {
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [connections, setConnections] = useState<EmailConnection[]>([]);
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [threadMessages, setThreadMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedConnection, setSelectedConnection] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCompose, setShowCompose] = useState(false);

  const fetchConnections = useCallback(async () => {
    try {
      const response = await api.get<{ data: EmailConnection[] }>('/api/email/connections');
      setConnections(response.data ?? []);
    } catch (error) {
      console.error('Failed to fetch connections:', error);
      setConnections([]);
    }
  }, []);

  const fetchThreads = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedConnection !== 'all') params.set('connectionId', selectedConnection);
      if (filter === 'starred') params.set('isStarred', 'true');
      if (filter === 'archived') params.set('isArchived', 'true');
      if (searchQuery) params.set('search', searchQuery);

      const response = await api.get<{ data: { threads: EmailThread[] } }>(`/api/email/threads?${params.toString()}`);
      setThreads(response.data?.threads ?? []);
    } catch (error) {
      console.error('Failed to fetch threads:', error);
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [selectedConnection, filter, searchQuery]);

  const fetchThreadDetail = useCallback(async (threadId: string) => {
    try {
      const response = await api.get<{ data: { messages: any[] } }>(`/api/email/threads/${threadId}`);
      setThreadMessages(response.data?.messages || []);
    } catch (error) {
      console.error('Failed to fetch thread:', error);
      setThreadMessages([]);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  useEffect(() => {
    if (selectedThread) {
      fetchThreadDetail(selectedThread.id);
    }
  }, [selectedThread, fetchThreadDetail]);

  const handleStarThread = async (threadId: string) => {
    try {
      await api.put(`/api/email/threads/${threadId}/star`);
      await fetchThreads();
    } catch (error) {
      console.error('Failed to star thread:', error);
    }
  };

  const handleArchiveThread = async (threadId: string) => {
    try {
      await api.put(`/api/email/threads/${threadId}/archive`);
      await fetchThreads();
      if (selectedThread?.id === threadId) {
        setSelectedThread(null);
      }
    } catch (error) {
      console.error('Failed to archive thread:', error);
    }
  };

  const handleSyncConnection = async (connectionId: string) => {
    try {
      await api.post(`/api/email/connections/${connectionId}/sync`);
      setTimeout(fetchThreads, 2000);
    } catch (error) {
      console.error('Failed to sync:', error);
    }
  };

  const getDisplayName = (thread: EmailThread) => {
    if (thread.contact) {
      return `${thread.contact.firstName || ''} ${thread.contact.lastName || ''}`.trim() || thread.contact.email;
    }
    if (thread.latestMessage?.fromName) {
      return thread.latestMessage.fromName;
    }
    const email = thread.participantEmails[0] || thread.latestMessage?.fromEmail;
    return email?.split('@')[0] || 'Unknown';
  };

  const filteredThreads = threads.filter(thread => {
    if (filter === 'unread' && thread.unreadCount === 0) return false;
    if (filter === 'sent' && !thread.latestMessage?.isOutbound) return false;
    return true;
  });

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">Inbox</h1>
          <div className="flex items-center gap-2">
            {connections.map(conn => (
              <button
                key={conn.id}
                onClick={() => setSelectedConnection(conn.id)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  selectedConnection === conn.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                {conn.email}
              </button>
            ))}
            <button
              onClick={() => setSelectedConnection('all')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                selectedConnection === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              All
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCompose(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Compose
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-neutral-800">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search emails..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 pl-10 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <svg className="absolute left-3 top-2.5 w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div className="flex items-center gap-1 bg-neutral-800 rounded-lg p-1">
          {(['all', 'unread', 'starred', 'sent', 'archived'] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm rounded-md capitalize transition-colors ${
                filter === f
                  ? 'bg-neutral-700 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Thread List */}
        <div className={`${selectedThread ? 'w-1/3' : 'w-full'} border-r border-neutral-800 overflow-y-auto`}>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-neutral-400">
              <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="text-lg">No emails found</p>
              {connections.length === 0 && (
                <p className="text-sm mt-2">Connect your email in Settings to get started</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-neutral-800">
              {filteredThreads.map((thread) => (
                <div
                  key={thread.id}
                  onClick={() => setSelectedThread(thread)}
                  className={`p-4 cursor-pointer transition-colors ${
                    selectedThread?.id === thread.id
                      ? 'bg-neutral-800'
                      : 'hover:bg-neutral-800/50'
                  } ${thread.unreadCount > 0 ? 'bg-neutral-800/30' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium truncate ${thread.unreadCount > 0 ? 'text-white' : 'text-neutral-300'}`}>
                          {getDisplayName(thread)}
                        </span>
                        {thread.unreadCount > 0 && (
                          <span className="px-1.5 py-0.5 text-xs bg-indigo-600 text-white rounded-full">
                            {thread.unreadCount}
                          </span>
                        )}
                        {thread.messageCount > 1 && (
                          <span className="text-xs text-neutral-500">({thread.messageCount})</span>
                        )}
                      </div>
                      <p className={`text-sm truncate ${thread.unreadCount > 0 ? 'text-neutral-200' : 'text-neutral-400'}`}>
                        {thread.subject || '(no subject)'}
                      </p>
                      <p className="text-xs text-neutral-500 truncate mt-1">
                        {thread.snippet}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-neutral-500">
                        {thread.lastMessageAt && formatDistanceToNow(new Date(thread.lastMessageAt), { addSuffix: true })}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStarThread(thread.id);
                          }}
                          className={`p-1 rounded ${thread.isStarred ? 'text-yellow-500' : 'text-neutral-500 hover:text-yellow-500'}`}
                        >
                          <svg className="w-4 h-4" fill={thread.isStarred ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleArchiveThread(thread.id);
                          }}
                          className="p-1 rounded text-neutral-500 hover:text-neutral-300"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Thread Detail */}
        {selectedThread && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Thread Header */}
            <div className="px-6 py-4 border-b border-neutral-800">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {selectedThread.subject || '(no subject)'}
                  </h2>
                  <p className="text-sm text-neutral-400">
                    {selectedThread.messageCount} messages with {getDisplayName(selectedThread)}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedThread(null)}
                  className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {threadMessages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-lg p-4 ${
                    message.isOutbound
                      ? 'bg-indigo-600/20 border border-indigo-600/30 ml-8'
                      : 'bg-neutral-800 mr-8'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-medium text-white">
                        {message.fromName || message.fromEmail}
                      </p>
                      <p className="text-xs text-neutral-400">
                        to {message.toEmails?.join(', ')}
                      </p>
                    </div>
                    <span className="text-xs text-neutral-500">
                      {formatDistanceToNow(new Date(message.receivedAt), { addSuffix: true })}
                    </span>
                  </div>
                  {message.bodyHtml ? (
                    <div
                      className="prose prose-sm prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: message.bodyHtml }}
                    />
                  ) : (
                    <p className="text-neutral-300 whitespace-pre-wrap">{message.bodyText || message.snippet}</p>
                  )}
                  {message.trackingEvents && message.trackingEvents.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-neutral-700">
                      <p className="text-xs text-neutral-500">
                        Opened {message.trackingEvents.filter((e: any) => e.eventType === 'OPEN').length} times
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Reply Box */}
            <div className="border-t border-neutral-800 p-4">
              <ReplyBox
                threadId={selectedThread.id}
                connectionId={selectedThread.connection?.email ? connections.find(c => c.email === selectedThread.connection?.email)?.id : connections[0]?.id}
                onSent={() => {
                  fetchThreadDetail(selectedThread.id);
                  fetchThreads();
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Compose Modal */}
      {showCompose && (
        <ComposeModal
          connections={connections}
          onClose={() => setShowCompose(false)}
          onSent={() => {
            setShowCompose(false);
            fetchThreads();
          }}
        />
      )}
    </div>
  );
}

function ReplyBox({ threadId, connectionId, onSent }: { threadId: string; connectionId?: string; onSent: () => void }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!message.trim() || !connectionId) return;

    setSending(true);
    try {
      await api.post('/api/email/send', {
        connectionId,
        threadId,
        to: [], // Will be filled from thread
        subject: 'Re: ', // Will be filled from thread
        bodyText: message,
        bodyHtml: `<p>${message.replace(/\n/g, '<br>')}</p>`,
      });
      setMessage('');
      onSent();
    } catch (error) {
      console.error('Failed to send:', error);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Write your reply..."
        rows={3}
        className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
      />
      <div className="flex justify-end">
        <button
          onClick={handleSend}
          disabled={sending || !message.trim()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {sending ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
          Send
        </button>
      </div>
    </div>
  );
}

function ComposeModal({ 
  connections, 
  onClose, 
  onSent 
}: { 
  connections: EmailConnection[]; 
  onClose: () => void; 
  onSent: () => void;
}) {
  const [selectedConnection, setSelectedConnection] = useState(connections.find(c => c.isPrimary)?.id || connections[0]?.id || '');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!to.trim() || !subject.trim() || !message.trim() || !selectedConnection) return;

    setSending(true);
    try {
      await api.post('/api/email/send', {
        connectionId: selectedConnection,
        to: [to.trim()],
        subject,
        bodyText: message,
        bodyHtml: `<p>${message.replace(/\n/g, '<br>')}</p>`,
      });
      onSent();
    } catch (error) {
      console.error('Failed to send:', error);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-neutral-900 rounded-xl w-full max-w-2xl border border-neutral-800 shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <h2 className="text-lg font-semibold text-white">New Email</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1">From</label>
            <select
              value={selectedConnection}
              onChange={(e) => setSelectedConnection(e.target.value)}
              className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {connections.map((conn) => (
                <option key={conn.id} value={conn.id}>
                  {conn.displayName || conn.email} ({conn.email})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1">To</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
              className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              placeholder="Write your message..."
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-neutral-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !to.trim() || !subject.trim() || !message.trim()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {sending ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
            Send Email
          </button>
        </div>
      </div>
    </div>
  );
}
