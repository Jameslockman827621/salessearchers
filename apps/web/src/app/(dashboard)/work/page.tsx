'use client';

// ===========================================
// Work OS - Unified Sales Workflow
// ===========================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import {
  Phone,
  Mail,
  Clock,
  Check,
  ArrowRight,
  Zap,
  Flame,
  MessageCircle,
  Play,
  X,
  ChevronRight,
  Search,
  Filter,
  MoreHorizontal,
  Building2,
  User,
  Calendar,
  Link,
  FileText,
  Sparkles,
  RefreshCw,
  Inbox,
  PhoneCall,
} from 'lucide-react';

// ===========================================
// Types
// ===========================================

interface WorkItem {
  id: string;
  type: 'EMAIL_REPLY_NEEDED' | 'LINKEDIN_REPLY_NEEDED' | 'CALL_NOW' | 'FOLLOW_UP_DUE' | 'SEQUENCE_STEP' | 'LINKEDIN_ACTION' | 'HOT_SIGNAL' | 'TASK';
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  subtitle: string | null;
  reason: string;
  createdAt: string;
  dueAt: string | null;
  contactId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactTitle: string | null;
  contactAvatarUrl: string | null;
  companyId: string | null;
  companyName: string | null;
  resourceType: string;
  resourceId: string;
  recommendedAction: string;
  actionUrl: string;
  canCall: boolean;
  canEmail: boolean;
  canLinkedIn: boolean;
  metadata: Record<string, unknown>;
}

interface ContactContext {
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    title: string | null;
    linkedinUrl: string | null;
    avatarUrl: string | null;
    timezone: string | null;
    status: string;
    lastContactedAt: string | null;
    lastRepliedAt: string | null;
  };
  company: { id: string; name: string; domain: string | null; industry: string | null } | null;
  leadScore: { totalScore: number; grade: string } | null;
  nextBestAction: { type: string; label: string; reason: string };
  tasks: Array<{ id: string; title: string; dueAt: string | null; type: string }>;
  sequences: Array<{ id: string; sequenceId: string; sequenceName: string; status: string; currentStep: number }>;
  linkedInCampaigns: Array<{ id: string; campaignId: string; campaignName: string; status: string; currentStep: number }>;
  recentActivity: Array<{ id: string; type: string; title: string; createdAt: string }>;
  emailThreads: Array<{ id: string; subject: string | null; snippet: string | null; unreadCount: number; lastMessageAt: string | null }>;
  linkedInMessages: Array<{ id: string; body: string | null; sentAt: string; isOutbound: boolean }>;
  dataRooms: Array<{ id: string; name: string; slug: string; status: string; lastViewedAt: string | null }>;
}

// ===========================================
// Priority Badge Component
// ===========================================

const PriorityBadge: React.FC<{ priority: WorkItem['priority'] }> = ({ priority }) => {
  const styles = {
    URGENT: 'bg-red-500/20 text-red-300 border-red-500/30',
    HIGH: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    MEDIUM: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    LOW: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  };

  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${styles[priority]}`}>
      {priority}
    </span>
  );
};

// ===========================================
// Work Item Type Icon
// ===========================================

const WorkTypeIcon: React.FC<{ type: WorkItem['type']; className?: string }> = ({ type, className = 'w-5 h-5' }) => {
  const icons: Record<WorkItem['type'], React.ReactNode> = {
    EMAIL_REPLY_NEEDED: <Mail className={`${className} text-blue-400`} />,
    LINKEDIN_REPLY_NEEDED: <MessageCircle className={`${className} text-sky-400`} />,
    CALL_NOW: <Phone className={`${className} text-green-400`} />,
    FOLLOW_UP_DUE: <ArrowRight className={`${className} text-violet-400`} />,
    SEQUENCE_STEP: <RefreshCw className={`${className} text-indigo-400`} />,
    LINKEDIN_ACTION: <Link className={`${className} text-sky-400`} />,
    HOT_SIGNAL: <Flame className={`${className} text-orange-400`} />,
    TASK: <Check className={`${className} text-emerald-400`} />,
  };

  return <>{icons[type]}</>;
};

// ===========================================
// Time Ago Helper
// ===========================================

function timeAgo(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return then.toLocaleDateString();
}

// ===========================================
// Contact Context Drawer Component
// ===========================================

const ContactDrawer: React.FC<{
  contactId: string;
  onClose: () => void;
  onCall: () => void;
  onEmail: () => void;
  onLinkedIn: () => void;
}> = ({ contactId, onClose, onCall, onEmail, onLinkedIn }) => {
  const { data: context, isLoading } = useQuery<ContactContext>({
    queryKey: ['contact-context', contactId],
    queryFn: () => api.get(`/api/work/contact/${contactId}/context`),
    enabled: !!contactId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!context) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        Contact not found
      </div>
    );
  }

  const { contact, company, leadScore, nextBestAction, tasks, sequences, linkedInCampaigns, recentActivity, emailThreads, linkedInMessages, dataRooms } = context;

  const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 p-6 border-b border-zinc-800">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            {contact.avatarUrl ? (
              <img src={contact.avatarUrl} alt={contactName} className="w-14 h-14 rounded-full object-cover border-2 border-zinc-700" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center border-2 border-emerald-500/30">
                <span className="text-xl font-semibold text-emerald-400">
                  {contactName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <h3 className="text-xl font-bold text-white">{contactName}</h3>
              <p className="text-sm text-zinc-400">{contact.title}</p>
              {company && (
                <p className="text-sm text-emerald-400 flex items-center gap-1 mt-1">
                  <Building2 className="w-4 h-4" />
                  {company.name}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lead Score */}
        {leadScore && (
          <div className="flex items-center gap-3 mb-4">
            <div className={`px-3 py-1.5 rounded-lg font-bold ${
              leadScore.grade === 'A' ? 'bg-emerald-500/20 text-emerald-400' :
              leadScore.grade === 'B' ? 'bg-blue-500/20 text-blue-400' :
              leadScore.grade === 'C' ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-zinc-500/20 text-zinc-400'
            }`}>
              Grade {leadScore.grade}
            </div>
            <span className="text-sm text-zinc-500">Score: {leadScore.totalScore}</span>
          </div>
        )}

        {/* Next Best Action */}
        <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-xl p-4 border border-emerald-500/20">
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium mb-2">
            <Sparkles className="w-4 h-4" />
            NEXT BEST ACTION
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-semibold">{nextBestAction.label}</p>
              <p className="text-sm text-zinc-400">{nextBestAction.reason}</p>
            </div>
            {nextBestAction.type === 'CALL' && contact.phone && (
              <button
                onClick={onCall}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <PhoneCall className="w-4 h-4" />
                Call
              </button>
            )}
            {nextBestAction.type === 'EMAIL' && contact.email && (
              <button
                onClick={onEmail}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <Mail className="w-4 h-4" />
                Reply
              </button>
            )}
            {nextBestAction.type === 'LINKEDIN' && (
              <button
                onClick={onLinkedIn}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                Reply
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions Bar */}
      <div className="flex-shrink-0 p-4 border-b border-zinc-800 flex gap-2">
        <button
          onClick={onCall}
          disabled={!contact.phone}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-colors ${
            contact.phone
              ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30'
              : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
          }`}
        >
          <Phone className="w-4 h-4" />
          Call
        </button>
        <button
          onClick={onEmail}
          disabled={!contact.email}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-colors ${
            contact.email
              ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
              : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
          }`}
        >
          <Mail className="w-4 h-4" />
          Email
        </button>
        <button
          onClick={onLinkedIn}
          disabled={!contact.linkedinUrl}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-colors ${
            contact.linkedinUrl
              ? 'bg-sky-600/20 text-sky-400 hover:bg-sky-600/30'
              : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
          }`}
        >
          <Link className="w-4 h-4" />
          LinkedIn
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Contact Details */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Contact Details</h4>
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-3 text-sm text-zinc-300 hover:text-emerald-400 transition-colors">
              <Mail className="w-4 h-4 text-zinc-500" />
              {contact.email}
            </a>
          )}
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="flex items-center gap-3 text-sm text-zinc-300 hover:text-emerald-400 transition-colors">
              <Phone className="w-4 h-4 text-zinc-500" />
              {contact.phone}
            </a>
          )}
          {contact.linkedinUrl && (
            <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-zinc-300 hover:text-emerald-400 transition-colors">
              <Link className="w-4 h-4 text-zinc-500" />
              LinkedIn Profile
            </a>
          )}
          {contact.timezone && (
            <div className="flex items-center gap-3 text-sm text-zinc-300">
              <Clock className="w-4 h-4 text-zinc-500" />
              {contact.timezone}
            </div>
          )}
        </div>

        {/* Tasks */}
        {tasks.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
              <Check className="w-4 h-4" />
              Open Tasks ({tasks.length})
            </h4>
            <div className="space-y-2">
              {tasks.map((task) => (
                <div key={task.id} className="bg-zinc-800/50 rounded-lg p-3 flex items-center justify-between">
                  <span className="text-sm text-zinc-300">{task.title}</span>
                  {task.dueAt && (
                    <span className={`text-xs ${new Date(task.dueAt) < new Date() ? 'text-red-400' : 'text-zinc-500'}`}>
                      {new Date(task.dueAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Sequences */}
        {sequences.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Email Sequences
            </h4>
            <div className="space-y-2">
              {sequences.map((seq) => (
                <div key={seq.id} className="bg-indigo-500/10 rounded-lg p-3 border border-indigo-500/20">
                  <span className="text-sm text-indigo-300">{seq.sequenceName}</span>
                  <span className="text-xs text-zinc-500 ml-2">Step {seq.currentStep}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LinkedIn Campaigns */}
        {linkedInCampaigns.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
              <Link className="w-4 h-4" />
              LinkedIn Campaigns
            </h4>
            <div className="space-y-2">
              {linkedInCampaigns.map((camp) => (
                <div key={camp.id} className="bg-sky-500/10 rounded-lg p-3 border border-sky-500/20">
                  <span className="text-sm text-sky-300">{camp.campaignName}</span>
                  <span className="text-xs text-zinc-500 ml-2">Step {camp.currentStep}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Emails */}
        {emailThreads.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Recent Emails
            </h4>
            <div className="space-y-2">
              {emailThreads.map((thread) => (
                <div key={thread.id} className="bg-zinc-800/50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-300 truncate flex-1">{thread.subject || 'No subject'}</span>
                    {thread.unreadCount > 0 && (
                      <span className="ml-2 px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">
                        {thread.unreadCount}
                      </span>
                    )}
                  </div>
                  {thread.snippet && (
                    <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{thread.snippet}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Data Rooms */}
        {dataRooms.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Data Rooms
            </h4>
            <div className="space-y-2">
              {dataRooms.map((room) => (
                <div key={room.id} className="bg-zinc-800/50 rounded-lg p-3 flex items-center justify-between">
                  <span className="text-sm text-zinc-300">{room.name}</span>
                  {room.lastViewedAt && (
                    <span className="text-xs text-emerald-400">Viewed {timeAgo(room.lastViewedAt)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activity */}
        {recentActivity.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Activity Timeline
            </h4>
            <div className="space-y-2">
              {recentActivity.slice(0, 5).map((activity) => (
                <div key={activity.id} className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-zinc-600" />
                  <span className="text-zinc-400 flex-1">{activity.title}</span>
                  <span className="text-xs text-zinc-600">{timeAgo(activity.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ===========================================
// Work Item Card Component
// ===========================================

const WorkItemCard: React.FC<{
  item: WorkItem;
  isSelected: boolean;
  onSelect: () => void;
  onAction: (action: 'COMPLETE' | 'CALL' | 'EMAIL' | 'LINKEDIN') => void;
}> = ({ item, isSelected, onSelect, onAction }) => {
  return (
    <div
      onClick={onSelect}
      className={`group relative p-4 rounded-xl cursor-pointer transition-all ${
        isSelected
          ? 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 shadow-lg shadow-emerald-500/10'
          : 'bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'
      }`}
    >
      {/* Priority indicator */}
      {item.priority === 'URGENT' && (
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-red-500 to-red-600 rounded-l-xl" />
      )}
      {item.priority === 'HIGH' && (
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-orange-500 to-orange-600 rounded-l-xl" />
      )}

      <div className="flex items-start gap-4">
        {/* Type Icon */}
        <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
          item.type === 'EMAIL_REPLY_NEEDED' ? 'bg-blue-500/20' :
          item.type === 'LINKEDIN_REPLY_NEEDED' ? 'bg-sky-500/20' :
          item.type === 'CALL_NOW' ? 'bg-emerald-500/20' :
          item.type === 'HOT_SIGNAL' ? 'bg-orange-500/20' :
          item.type === 'TASK' ? 'bg-violet-500/20' :
          'bg-zinc-800'
        }`}>
          <WorkTypeIcon type={item.type} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <PriorityBadge priority={item.priority} />
            <span className="text-xs text-zinc-500">{timeAgo(item.createdAt)}</span>
          </div>

          <h3 className="text-white font-medium truncate">{item.title}</h3>

          {item.contactName && (
            <p className="text-sm text-emerald-400 flex items-center gap-1 mt-0.5">
              <User className="w-3 h-3" />
              {item.contactName}
              {item.companyName && (
                <span className="text-zinc-500">@ {item.companyName}</span>
              )}
            </p>
          )}

          {item.subtitle && (
            <p className="text-sm text-zinc-500 mt-1 line-clamp-2">{item.subtitle}</p>
          )}

          <p className="text-xs text-zinc-600 mt-2">{item.reason}</p>
        </div>

        {/* Quick Actions */}
        <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {item.canCall && (
            <button
              onClick={(e) => { e.stopPropagation(); onAction('CALL'); }}
              className="p-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 transition-colors"
              title="Call"
            >
              <Phone className="w-4 h-4" />
            </button>
          )}
          {item.canEmail && (
            <button
              onClick={(e) => { e.stopPropagation(); onAction('EMAIL'); }}
              className="p-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 transition-colors"
              title="Email"
            >
              <Mail className="w-4 h-4" />
            </button>
          )}
          {item.type === 'TASK' && (
            <button
              onClick={(e) => { e.stopPropagation(); onAction('COMPLETE'); }}
              className="p-2 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 transition-colors"
              title="Complete"
            >
              <Check className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ===========================================
// Filter Tabs Component
// ===========================================

const FilterTabs: React.FC<{
  activeFilter: string | null;
  onFilterChange: (filter: string | null) => void;
  stats: { byType: Record<string, number>; urgent: number };
}> = ({ activeFilter, onFilterChange, stats }) => {
  const filters = [
    { key: null, label: 'All', count: null },
    { key: 'EMAIL_REPLY_NEEDED,LINKEDIN_REPLY_NEEDED', label: 'Replies', count: (stats.byType.emailReplyNeeded || 0) + (stats.byType.linkedInReplyNeeded || 0), color: 'text-blue-400' },
    { key: 'CALL_NOW', label: 'Calls', count: stats.byType.callNow || 0, color: 'text-emerald-400' },
    { key: 'HOT_SIGNAL', label: 'Hot Signals', count: stats.byType.hotSignals || 0, color: 'text-orange-400' },
    { key: 'TASK', label: 'Tasks', count: stats.byType.tasks || 0, color: 'text-violet-400' },
    { key: 'LINKEDIN_ACTION', label: 'LinkedIn', count: stats.byType.linkedInActions || 0, color: 'text-sky-400' },
  ];

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2">
      {filters.map((filter) => (
        <button
          key={filter.key ?? 'all'}
          onClick={() => onFilterChange(filter.key)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
            activeFilter === filter.key
              ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-zinc-900/50 text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700'
          }`}
        >
          {filter.label}
          {filter.count !== null && filter.count > 0 && (
            <span className={`px-1.5 py-0.5 rounded text-xs ${
              activeFilter === filter.key
                ? 'bg-emerald-500/30 text-emerald-300'
                : `bg-zinc-800 ${filter.color || 'text-zinc-500'}`
            }`}>
              {filter.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
};

// ===========================================
// Main Work OS Page
// ===========================================

export default function WorkOSPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [showContactDrawer, setShowContactDrawer] = useState(false);

  // Fetch work queue
  const { data: queueData, isLoading, refetch } = useQuery<{ items: WorkItem[]; stats: { total: number; urgent: number; high: number; byType: Record<string, number> } }>({
    queryKey: ['work-queue', activeFilter],
    queryFn: () => api.get(`/api/work/queue${activeFilter ? `?types=${activeFilter}` : ''}`),
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  const items = queueData?.items ?? [];
  const stats = queueData?.stats ?? { total: 0, urgent: 0, high: 0, byType: {} };

  // Quick action mutation
  const quickActionMutation = useMutation({
    mutationFn: (data: { workItemId: string; action: string; notes?: string }) =>
      api.post('/api/work/quick-action', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-queue'] });
    },
  });

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!items.length) return;

    const currentIndex = selectedItem ? items.findIndex(i => i.id === selectedItem.id) : -1;

    switch (e.key) {
      case 'ArrowDown':
      case 'j':
        e.preventDefault();
        const nextIndex = Math.min(currentIndex + 1, items.length - 1);
        setSelectedItem(items[nextIndex]);
        break;
      case 'ArrowUp':
      case 'k':
        e.preventDefault();
        const prevIndex = Math.max(currentIndex - 1, 0);
        setSelectedItem(items[prevIndex]);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedItem) {
          router.push(selectedItem.actionUrl);
        }
        break;
      case 'c':
        e.preventDefault();
        if (selectedItem?.canCall) {
          handleCallAction(selectedItem);
        }
        break;
      case 'e':
        e.preventDefault();
        if (selectedItem?.canEmail) {
          handleEmailAction(selectedItem);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowContactDrawer(false);
        break;
    }
  }, [items, selectedItem, router]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Auto-select first item
  useEffect(() => {
    if (items.length > 0 && !selectedItem) {
      setSelectedItem(items[0]);
    }
  }, [items, selectedItem]);

  // Action handlers
  const handleCallAction = (item: WorkItem) => {
    if (item.contactId) {
      router.push(`/call-queue?contactId=${item.contactId}`);
    }
  };

  const handleEmailAction = (item: WorkItem) => {
    if (item.type === 'EMAIL_REPLY_NEEDED') {
      router.push(`/inbox?thread=${item.resourceId}`);
    } else if (item.contactEmail) {
      window.location.href = `mailto:${item.contactEmail}`;
    }
  };

  const handleLinkedInAction = (item: WorkItem) => {
    router.push(`/linkedin?tab=inbox`);
  };

  const handleCompleteAction = (item: WorkItem) => {
    quickActionMutation.mutate({
      workItemId: item.id,
      action: 'COMPLETE',
    });
  };

  const handleQuickAction = (item: WorkItem, action: 'COMPLETE' | 'CALL' | 'EMAIL' | 'LINKEDIN') => {
    switch (action) {
      case 'CALL':
        handleCallAction(item);
        break;
      case 'EMAIL':
        handleEmailAction(item);
        break;
      case 'LINKEDIN':
        handleLinkedInAction(item);
        break;
      case 'COMPLETE':
        handleCompleteAction(item);
        break;
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Main Queue Panel */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all ${showContactDrawer ? 'pr-0' : ''}`}>
        {/* Header */}
        <div className="flex-shrink-0 p-6 border-b border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center border border-emerald-500/30">
                  <Zap className="w-5 h-5 text-emerald-400" />
                </div>
                Work Queue
              </h1>
              <p className="text-zinc-500 mt-1">Your prioritized action items</p>
            </div>

            <div className="flex items-center gap-4">
              {/* Stats */}
              {stats.urgent > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 rounded-xl border border-red-500/20">
                  <Flame className="w-5 h-5 text-red-400" />
                  <span className="text-sm font-medium text-red-400">{stats.urgent} urgent</span>
                </div>
              )}

              <button
                onClick={() => refetch()}
                className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <FilterTabs
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            stats={stats}
          />
        </div>

        {/* Work Items List */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                <p className="text-zinc-500">Loading your work queue...</p>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center mb-4 border border-emerald-500/30">
                <Check className="w-8 h-8 text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">All caught up!</h3>
              <p className="text-zinc-500 max-w-md">
                No urgent items in your queue. Great job staying on top of things!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <WorkItemCard
                  key={item.id}
                  item={item}
                  isSelected={selectedItem?.id === item.id}
                  onSelect={() => {
                    setSelectedItem(item);
                    if (item.contactId) {
                      setShowContactDrawer(true);
                    }
                  }}
                  onAction={(action) => handleQuickAction(item, action)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Keyboard Shortcuts Footer */}
        <div className="flex-shrink-0 px-6 py-3 border-t border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center justify-center gap-6 text-xs text-zinc-500">
            <span><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">↑↓</kbd> navigate</span>
            <span><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">Enter</kbd> open</span>
            <span><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">c</kbd> call</span>
            <span><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">e</kbd> email</span>
            <span><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">Esc</kbd> close panel</span>
          </div>
        </div>
      </div>

      {/* Contact Context Drawer */}
      {showContactDrawer && selectedItem?.contactId && (
        <div className="w-96 flex-shrink-0 border-l border-zinc-800 bg-zinc-950">
          <ContactDrawer
            contactId={selectedItem.contactId}
            onClose={() => setShowContactDrawer(false)}
            onCall={() => handleCallAction(selectedItem)}
            onEmail={() => handleEmailAction(selectedItem)}
            onLinkedIn={() => handleLinkedInAction(selectedItem)}
          />
        </div>
      )}
    </div>
  );
}

