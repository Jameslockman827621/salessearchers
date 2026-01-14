'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Users,
  Search,
  Phone,
  Mail,
  Linkedin,
  Building2,
  Clock,
  Flame,
  Globe,
  Sparkles,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  PhoneCall,
  Send,
  Play,
  Loader2,
  X,
  AlertCircle,
  Zap,
  Target,
  Calendar,
  ArrowRight,
  RefreshCw,
  Filter,
} from 'lucide-react';
import { clsx } from 'clsx';

// ===========================================
// Types
// ===========================================

interface QueueDefinition {
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  priority: number;
  count: number;
}

interface ContactWithPriority {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  timezone: string | null;
  linkedinUrl: string | null;
  avatarUrl: string | null;
  lastContactedAt: string | null;
  lastRepliedAt: string | null;
  status: string;
  company: { id: string; name: string; domain: string | null } | null;
  leadScore: { totalScore: number; grade: string | null } | null;
  localTime: string | null;
  isCallableNow: boolean;
  nextBestAction: {
    type: string;
    label: string;
    reason: string;
    urgent: boolean;
  };
  priorityScore: number;
  overdueTaskCount: number;
  dueTodayTaskCount: number;
}

// ===========================================
// Icon Mapping
// ===========================================

const QUEUE_ICONS: Record<string, typeof Phone> = {
  phone: Phone,
  clock: Clock,
  flame: Flame,
  globe: Globe,
  search: Sparkles,
  mail: Mail,
  linkedin: Linkedin,
  check: CheckCircle2,
};

// ===========================================
// Components
// ===========================================

function QueueIcon({ icon, color, size = 18 }: { icon: string; color: string; size?: number }) {
  const Icon = QUEUE_ICONS[icon] || Users;
  return (
    <div 
      className="flex items-center justify-center rounded-lg p-2"
      style={{ backgroundColor: `${color}20` }}
    >
      <Icon size={size} style={{ color }} />
    </div>
  );
}

function GradeBadge({ grade }: { grade: string | null }) {
  const colors: Record<string, string> = {
    A: 'bg-green-500/20 text-green-400 border-green-500/30',
    B: 'bg-lime-500/20 text-lime-400 border-lime-500/30',
    C: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    D: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    F: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  
  if (!grade) return null;
  
  return (
    <span className={clsx(
      'px-1.5 py-0.5 rounded text-xs font-bold border',
      colors[grade] || 'bg-surface-700 text-surface-400'
    )}>
      {grade}
    </span>
  );
}

function ActionButton({ 
  action, 
  contactId,
  onAction,
  isLoading,
}: { 
  action: ContactWithPriority['nextBestAction'];
  contactId: string;
  onAction: (type: string, contactId: string) => void;
  isLoading?: boolean;
}) {
  const buttonStyles: Record<string, string> = {
    CALL: 'bg-green-500 hover:bg-green-600 text-white',
    EMAIL: 'bg-blue-500 hover:bg-blue-600 text-white',
    LINKEDIN: 'bg-[#0077b5] hover:bg-[#006399] text-white',
    ENRICH_PHONE: 'bg-purple-500 hover:bg-purple-600 text-white',
    ENRICH_EMAIL: 'bg-cyan-500 hover:bg-cyan-600 text-white',
    FOLLOW_UP: 'bg-amber-500 hover:bg-amber-600 text-white',
    WAIT: 'bg-surface-700 text-surface-400 cursor-not-allowed',
  };

  const icons: Record<string, React.ReactNode> = {
    CALL: <PhoneCall size={14} />,
    EMAIL: <Send size={14} />,
    LINKEDIN: <Linkedin size={14} />,
    ENRICH_PHONE: <Sparkles size={14} />,
    ENRICH_EMAIL: <Sparkles size={14} />,
    FOLLOW_UP: <Clock size={14} />,
    WAIT: <Clock size={14} />,
  };

  return (
    <button
      onClick={() => onAction(action.type, contactId)}
      disabled={action.type === 'WAIT' || isLoading}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
        buttonStyles[action.type] || buttonStyles.WAIT,
        action.urgent && 'ring-2 ring-offset-2 ring-offset-surface-900 ring-amber-500/50'
      )}
      title={action.reason}
    >
      {isLoading ? <Loader2 size={14} className="animate-spin" /> : icons[action.type]}
      {action.label}
    </button>
  );
}

function ContactRow({ 
  contact, 
  onAction,
  isActionLoading,
}: { 
  contact: ContactWithPriority;
  onAction: (type: string, contactId: string) => void;
  isActionLoading?: boolean;
}) {
  const router = useRouter();
  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown';
  
  return (
    <div className="group flex items-center gap-4 px-4 py-3 hover:bg-surface-800/50 transition-colors border-b border-surface-800/50">
      {/* Avatar + Name + Company */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-700 text-sm font-medium text-surface-300">
          {contact.avatarUrl ? (
            <img src={contact.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            fullName[0]?.toUpperCase() || '?'
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-surface-100 truncate">{fullName}</span>
            <GradeBadge grade={contact.leadScore?.grade ?? null} />
            {contact.overdueTaskCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-red-400">
                <AlertCircle size={12} />
                {contact.overdueTaskCount} overdue
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-surface-500">
            {contact.company && (
              <span className="flex items-center gap-1">
                <Building2 size={12} />
                {contact.company.name}
              </span>
            )}
            {contact.title && (
              <span className="truncate">{contact.title}</span>
            )}
          </div>
        </div>
      </div>

      {/* Contact Info */}
      <div className="hidden lg:flex items-center gap-4 text-sm">
        {contact.phone ? (
          <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-surface-300 hover:text-green-400">
            <Phone size={14} className="text-green-500" />
            <span className="max-w-[140px] truncate">{contact.phone}</span>
          </a>
        ) : (
          <span className="flex items-center gap-1.5 text-surface-500">
            <Phone size={14} />
            <span>—</span>
          </span>
        )}
        
        {contact.email ? (
          <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-surface-300 hover:text-blue-400">
            <Mail size={14} className="text-blue-500" />
            <span className="max-w-[180px] truncate">{contact.email}</span>
          </a>
        ) : (
          <span className="flex items-center gap-1.5 text-surface-500">
            <Mail size={14} />
            <span>—</span>
          </span>
        )}
      </div>

      {/* Local Time */}
      <div className="hidden md:flex items-center gap-2 w-24 justify-end">
        {contact.localTime ? (
          <span className={clsx(
            'flex items-center gap-1 text-xs',
            contact.isCallableNow ? 'text-green-400' : 'text-surface-500'
          )}>
            <Globe size={12} />
            {contact.localTime}
          </span>
        ) : (
          <span className="text-xs text-surface-500">Unknown TZ</span>
        )}
      </div>

      {/* Priority Score */}
      <div className="hidden xl:flex items-center gap-1 w-16 justify-end">
        <Target size={12} className="text-surface-500" />
        <span className="text-xs text-surface-400">{contact.priorityScore}</span>
      </div>

      {/* Action Button */}
      <div className="shrink-0">
        <ActionButton 
          action={contact.nextBestAction} 
          contactId={contact.id}
          onAction={onAction}
          isLoading={isActionLoading}
        />
      </div>
    </div>
  );
}

function QueueAccordion({
  queue,
  isExpanded,
  onToggle,
  onAction,
  actionLoadingId,
}: {
  queue: QueueDefinition;
  isExpanded: boolean;
  onToggle: () => void;
  onAction: (type: string, contactId: string) => void;
  actionLoadingId: string | null;
}) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['contact-queue', queue.key],
    queryFn: ({ pageParam }) => api.getContactQueueContacts(queue.key, { 
      cursor: pageParam as string | undefined, 
      limit: 25 
    }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    enabled: isExpanded,
  });

  const contacts = data?.pages.flatMap(p => p.contacts) ?? [];

  return (
    <div className="border border-surface-800 rounded-xl overflow-hidden bg-surface-900/50">
      {/* Queue Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-800/50 transition-colors"
      >
        <QueueIcon icon={queue.icon} color={queue.color} />
        
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="font-medium text-surface-100">{queue.name}</span>
            <span 
              className="px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: `${queue.color}20`, color: queue.color }}
            >
              {queue.count}
            </span>
          </div>
          <p className="text-xs text-surface-500">{queue.description}</p>
        </div>

        {isExpanded ? (
          <ChevronDown size={18} className="text-surface-400" />
        ) : (
          <ChevronRight size={18} className="text-surface-400" />
        )}
      </button>

      {/* Queue Content */}
      {isExpanded && (
        <div className="border-t border-surface-800">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-surface-500">
              <CheckCircle2 size={32} className="mb-2 opacity-50" />
              <p className="text-sm">No contacts in this queue</p>
            </div>
          ) : (
            <>
              <div className="max-h-[400px] overflow-y-auto">
                {contacts.map((contact) => (
                  <ContactRow 
                    key={contact.id} 
                    contact={contact}
                    onAction={onAction}
                    isActionLoading={actionLoadingId === contact.id}
                  />
                ))}
              </div>
              
              {hasNextPage && (
                <div className="p-3 border-t border-surface-800">
                  <button
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="w-full flex items-center justify-center gap-2 py-2 text-sm text-primary-400 hover:text-primary-300 transition-colors"
                  >
                    {isFetchingNextPage ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>
                        Load more
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ===========================================
// Main Page Component
// ===========================================

export default function SmartContactsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const [expandedQueues, setExpandedQueues] = useState<Set<string>>(new Set(['call_now', 'follow_ups_due']));
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Fetch queues with counts
  const { data: queuesData, isLoading: queuesLoading, refetch: refetchQueues } = useQuery({
    queryKey: ['contact-queues'],
    queryFn: () => api.getContactQueues(),
    refetchInterval: 60000, // Refresh counts every minute
  });

  // Search query
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['contact-search', searchQuery],
    queryFn: () => api.searchContactsQuick(searchQuery),
    enabled: searchQuery.length > 0,
  });

  // Mark contacted mutation
  const markContactedMutation = useMutation({
    mutationFn: ({ id, channel }: { id: string; channel: string }) => 
      api.markContactContacted(id, { channel }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-queues'] });
      queryClient.invalidateQueries({ queryKey: ['contact-queue'] });
    },
  });

  // Enrich mutation
  const enrichMutation = useMutation({
    mutationFn: ({ id, options }: { id: string; options: { enrichEmail?: boolean; enrichPhone?: boolean } }) =>
      api.enrichContact(id, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-queues'] });
      queryClient.invalidateQueries({ queryKey: ['contact-queue'] });
    },
  });

  // Start call block mutation
  const startCallBlockMutation = useMutation({
    mutationFn: (params?: { queueKey?: string }) => api.startCallBlock(params),
    onSuccess: (data) => {
      if (data.contactIds.length > 0) {
        // Navigate to call queue with these contacts
        router.push(`/call-queue?contactIds=${data.contactIds.join(',')}`);
      }
    },
  });

  const toggleQueue = useCallback((queueKey: string) => {
    setExpandedQueues(prev => {
      const next = new Set(prev);
      if (next.has(queueKey)) {
        next.delete(queueKey);
      } else {
        next.add(queueKey);
      }
      return next;
    });
  }, []);

  const handleSearch = useCallback(() => {
    setSearchQuery(searchInput);
    setIsSearching(searchInput.length > 0);
  }, [searchInput]);

  const clearSearch = useCallback(() => {
    setSearchInput('');
    setSearchQuery('');
    setIsSearching(false);
  }, []);

  const handleAction = useCallback(async (type: string, contactId: string) => {
    setActionLoadingId(contactId);
    
    try {
      switch (type) {
        case 'CALL':
          // Navigate to call queue with this contact
          router.push(`/call-queue?contactId=${contactId}`);
          break;
        case 'EMAIL':
          // Mark as contacted and navigate to sequences or email
          await markContactedMutation.mutateAsync({ id: contactId, channel: 'EMAIL' });
          router.push(`/sequences?contactId=${contactId}`);
          break;
        case 'LINKEDIN':
          await markContactedMutation.mutateAsync({ id: contactId, channel: 'LINKEDIN' });
          router.push(`/linkedin?contactId=${contactId}`);
          break;
        case 'ENRICH_PHONE':
          await enrichMutation.mutateAsync({ id: contactId, options: { enrichPhone: true } });
          break;
        case 'ENRICH_EMAIL':
          await enrichMutation.mutateAsync({ id: contactId, options: { enrichEmail: true } });
          break;
        case 'FOLLOW_UP':
          router.push(`/tasks?contactId=${contactId}`);
          break;
      }
    } catch (error) {
      console.error('Action failed:', error);
    } finally {
      setActionLoadingId(null);
    }
  }, [router, markContactedMutation, enrichMutation]);

  const handleStartCallBlock = useCallback((queueKey?: string) => {
    startCallBlockMutation.mutate(queueKey ? { queueKey } : undefined);
  }, [startCallBlockMutation]);

  const queues = queuesData?.queues ?? [];
  const totalContacts = queuesData?.totalContacts ?? 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="shrink-0 border-b border-surface-800 bg-surface-900/80 backdrop-blur-sm px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-600">
                <Zap size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-surface-100">Smart Contacts</h1>
                <p className="text-sm text-surface-500">
                  {totalContacts.toLocaleString()} contacts • AI-prioritized for action
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => refetchQueues()}
              className="flex items-center gap-2 rounded-lg border border-surface-700 px-3 py-2 text-sm text-surface-300 hover:bg-surface-800 transition-colors"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            
            <button
              onClick={() => handleStartCallBlock('call_now')}
              disabled={startCallBlockMutation.isPending}
              className="flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 transition-colors disabled:opacity-50"
            >
              {startCallBlockMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Play size={16} />
              )}
              Start Call Block
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mt-4">
          <div className="relative max-w-xl">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
            <input
              type="text"
              placeholder="Search contacts by name, email, company..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full rounded-lg border border-surface-700 bg-surface-800 py-2.5 pl-10 pr-24 text-sm text-surface-100 placeholder-surface-500 focus:border-primary-500 focus:outline-none"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {isSearching && (
                <button
                  onClick={clearSearch}
                  className="p-1.5 rounded-md text-surface-400 hover:text-surface-200 hover:bg-surface-700"
                >
                  <X size={16} />
                </button>
              )}
              <button
                onClick={handleSearch}
                className="px-3 py-1 rounded-md bg-surface-700 text-sm text-surface-300 hover:bg-surface-600 transition-colors"
              >
                Search
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-6">
        {isSearching ? (
          // Search Results
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-surface-100">
                Search Results for "{searchQuery}"
              </h2>
              <button
                onClick={clearSearch}
                className="text-sm text-primary-400 hover:text-primary-300"
              >
                ← Back to queues
              </button>
            </div>

            {searchLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
              </div>
            ) : searchResults && searchResults.length > 0 ? (
              <div className="border border-surface-800 rounded-xl overflow-hidden bg-surface-900/50">
                {searchResults.map((contact) => (
                  <div key={contact.id} className="flex items-center gap-4 px-4 py-3 hover:bg-surface-800/50 transition-colors border-b border-surface-800/50 last:border-b-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-700 text-sm font-medium text-surface-300">
                      {contact.firstName?.[0]?.toUpperCase() || contact.email?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-surface-100">
                          {[contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown'}
                        </span>
                        <GradeBadge grade={contact.leadScore?.grade ?? null} />
                        {contact.isCallableNow && (
                          <span className="text-xs text-green-400">● Callable now</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-surface-500">
                        {contact.company && <span>{contact.company.name}</span>}
                        {contact.email && <span>{contact.email}</span>}
                        {contact.phone && <span>{contact.phone}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {contact.phone && (
                        <button
                          onClick={() => router.push(`/call-queue?contactId=${contact.id}`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500 text-white text-xs font-medium hover:bg-green-600 transition-colors"
                        >
                          <PhoneCall size={14} />
                          Call
                        </button>
                      )}
                      <button
                        onClick={() => router.push(`/contacts/${contact.id}`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-700 text-surface-300 text-xs font-medium hover:bg-surface-800 transition-colors"
                      >
                        View
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-surface-500">
                <Search size={48} className="mb-4 opacity-50" />
                <p>No contacts found</p>
              </div>
            )}
          </div>
        ) : queuesLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
          </div>
        ) : (
          // Queue Accordions
          <div className="space-y-3">
            {queues
              .sort((a, b) => a.priority - b.priority)
              .map((queue) => (
                <QueueAccordion
                  key={queue.key}
                  queue={queue}
                  isExpanded={expandedQueues.has(queue.key)}
                  onToggle={() => toggleQueue(queue.key)}
                  onAction={handleAction}
                  actionLoadingId={actionLoadingId}
                />
              ))}

            {queues.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-surface-500">
                <Users size={48} className="mb-4 opacity-50" />
                <p className="text-lg">No contacts yet</p>
                <p className="text-sm mt-1">Import contacts to get started</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Quick Stats Footer */}
      <footer className="shrink-0 border-t border-surface-800 bg-surface-900/80 backdrop-blur-sm px-6 py-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-6">
            {queues.slice(0, 4).map((q) => (
              <div key={q.key} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: q.color }} />
                <span className="text-surface-400">{q.name}:</span>
                <span className="font-medium text-surface-200">{q.count}</span>
              </div>
            ))}
          </div>
          <div className="text-surface-500">
            Press <kbd className="px-1.5 py-0.5 rounded bg-surface-800 text-surface-300 text-xs">⌘K</kbd> to quick search
          </div>
        </div>
      </footer>
    </div>
  );
}
