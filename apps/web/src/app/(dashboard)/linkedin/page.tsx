'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { format } from 'date-fns';
import {
  Linkedin,
  UserPlus,
  MessageSquare,
  Eye,
  Send,
  Check,
  X,
  Clock,
  AlertCircle,
  Plus,
  Settings,
  Play,
  Pause,
  Trash2,
  Users,
  Target,
  Inbox,
  BarChart3,
  Link as LinkIcon,
  Unplug,
  RefreshCw,
  ArrowRight,
  Zap,
  ChevronRight,
  ExternalLink,
  Key,
} from 'lucide-react';

type LinkedInAccount = Awaited<ReturnType<typeof api.getLinkedInAccounts>>[0];
type LinkedInCampaign = Awaited<ReturnType<typeof api.getLinkedInCampaigns>>[0];

const STATUS_COLORS: Record<string, string> = {
  CONNECTED: 'bg-emerald-500',
  DISCONNECTED: 'bg-red-500',
  VERIFYING: 'bg-blue-500',
  NEEDS_ATTENTION: 'bg-amber-500',
  RECONNECTING: 'bg-amber-500',
  RATE_LIMITED: 'bg-orange-500',
  SUSPENDED: 'bg-red-600',
};

const CAMPAIGN_STATUS_COLORS = {
  DRAFT: 'bg-surface-500',
  ACTIVE: 'bg-emerald-500',
  PAUSED: 'bg-amber-500',
  COMPLETED: 'bg-blue-500',
  ARCHIVED: 'bg-surface-600',
};

export default function LinkedInPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'accounts' | 'campaigns' | 'inbox' | 'queue'>('accounts');
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showLeadsModal, setShowLeadsModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<LinkedInAccount | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<LinkedInCampaign | null>(null);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  
  // Connection method state
  const [connectionMethod, setConnectionMethod] = useState<'select' | 'infinite' | 'credentials' | 'cookie' | null>('select');
  const [has2FA, setHas2FA] = useState<boolean | null>(null);
  const [confirmAuthenticator, setConfirmAuthenticator] = useState(false);
  const [confirmSecretKey, setConfirmSecretKey] = useState(false);

  // Form state for connecting account
  const [connectForm, setConnectForm] = useState({
    profileUrl: '',
    name: '',
    email: '',
    headline: '',
    sessionCookie: '',
    csrfToken: '',
    linkedinEmail: '',
    linkedinPassword: '',
    twoFASecret: '',
    country: 'US',
  });

  // Form state for creating campaign
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    description: '',
    accountId: '',
    dailyLimit: 20,
    steps: [
      { stepNumber: 1, actionType: 'CONNECTION_REQUEST', delayDays: 0, connectionNote: '' },
    ],
  });

  // Queries
  const { data: stats } = useQuery({
    queryKey: ['linkedin-dashboard-stats'],
    queryFn: () => api.getLinkedInDashboardStats(),
  });

  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['linkedin-accounts'],
    queryFn: () => api.getLinkedInAccounts(),
    // Poll every 3 seconds when there are accounts being verified
    refetchInterval: (query) => {
      const data = query.state.data;
      const accounts = data?.data ?? data ?? [];
      const hasVerifying = Array.isArray(accounts) && accounts.some((a: LinkedInAccount) => a.status === 'VERIFYING');
      return hasVerifying ? 3000 : false;
    },
  });

  const { data: campaignsData, isLoading: campaignsLoading } = useQuery({
    queryKey: ['linkedin-campaigns'],
    queryFn: () => api.getLinkedInCampaigns(),
  });

  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ['linkedin-messages'],
    queryFn: () => api.getLinkedInMessages(),
    enabled: activeTab === 'inbox',
  });

  const { data: queueData, isLoading: queueLoading } = useQuery({
    queryKey: ['linkedin-queue'],
    queryFn: () => api.getLinkedInQueue(),
    enabled: activeTab === 'queue',
  });

  // Contacts query for lead import
  const { data: contactsData, isLoading: contactsLoading } = useQuery({
    queryKey: ['contacts-for-linkedin'],
    queryFn: () => api.getContacts({}),
    enabled: showLeadsModal,
  });

  // Mutations
  const connectMutation = useMutation({
    mutationFn: (data: typeof connectForm & { method: 'infinite' | 'credentials' | 'cookie' }) => api.connectLinkedInAccount({
      profileUrl: data.profileUrl, // Required - user must provide their actual LinkedIn profile URL
      name: data.name, // Required - user must provide their actual display name
      email: data.linkedinEmail || data.email || undefined,
      headline: data.headline || undefined,
      sessionCookie: data.sessionCookie || undefined,
      csrfToken: data.csrfToken || undefined,
      connectionMethod: data.method === 'infinite' ? 'INFINITE_LOGIN' : data.method === 'cookie' ? 'COOKIE' : 'CREDENTIALS',
      linkedinPassword: data.linkedinPassword || undefined,
      twoFASecret: data.twoFASecret || undefined,
      country: data.country || 'US',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linkedin-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['linkedin-dashboard-stats'] });
      setShowConnectModal(false);
      resetConnectForm();
    },
  });

  const resetConnectForm = () => {
    setConnectionMethod('select');
    setHas2FA(null);
    setConfirmAuthenticator(false);
    setConfirmSecretKey(false);
    setConnectForm({ 
      profileUrl: '', 
      name: '', 
      email: '', 
      headline: '', 
      sessionCookie: '', 
      csrfToken: '',
      linkedinEmail: '',
      linkedinPassword: '',
      twoFASecret: '',
      country: 'US',
    });
  };

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => api.disconnectLinkedInAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linkedin-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['linkedin-dashboard-stats'] });
    },
  });

  const createCampaignMutation = useMutation({
    mutationFn: (data: typeof campaignForm) => api.createLinkedInCampaign({
      name: data.name,
      description: data.description || undefined,
      accountId: data.accountId,
      dailyLimit: data.dailyLimit,
      steps: data.steps.map(s => ({
        stepNumber: s.stepNumber,
        actionType: s.actionType,
        delayDays: s.delayDays,
        connectionNote: s.connectionNote || undefined,
      })),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linkedin-campaigns'] });
      setShowCampaignModal(false);
      setCampaignForm({
        name: '',
        description: '',
        accountId: '',
        dailyLimit: 20,
        steps: [{ stepNumber: 1, actionType: 'CONNECTION_REQUEST', delayDays: 0, connectionNote: '' }],
      });
    },
  });

  const activateCampaignMutation = useMutation({
    mutationFn: (id: string) => api.activateLinkedInCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linkedin-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['linkedin-dashboard-stats'] });
    },
  });

  const pauseCampaignMutation = useMutation({
    mutationFn: (id: string) => api.pauseLinkedInCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linkedin-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['linkedin-dashboard-stats'] });
    },
  });

  const importLeadsMutation = useMutation({
    mutationFn: ({ campaignId, contactIds }: { campaignId: string; contactIds: string[] }) =>
      api.importContactsToCampaign(campaignId, contactIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linkedin-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['linkedin-dashboard-stats'] });
      setShowLeadsModal(false);
      setSelectedContactIds([]);
      setSelectedCampaign(null);
    },
  });

  // API client already extracts the .data property, so use directly
  const accounts = accountsData ?? [];
  const campaigns = campaignsData ?? [];
  const messages = messagesData ?? [];
  const queue = queueData ?? [];
  const contacts = (contactsData as { contacts: Array<{ id: string; firstName: string | null; lastName: string | null; email: string | null; linkedinUrl: string | null; company: { id: string; name: string } | null }>; total: number } | undefined)?.contacts ?? [];

  const completeMutation = useMutation({
    mutationFn: ({ id, success }: { id: string; success: boolean }) =>
      api.completeLinkedInAction(id, { success }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linkedin-queue'] });
      queryClient.invalidateQueries({ queryKey: ['linkedin-dashboard-stats'] });
    },
  });

  const skipMutation = useMutation({
    mutationFn: (id: string) => api.skipLinkedInAction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linkedin-queue'] });
    },
  });

  return (
    <div className="min-h-screen bg-surface-950">
      {/* Header */}
      <div className="border-b border-surface-800 bg-surface-900/50">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
                <Linkedin size={24} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-surface-100">LinkedIn Outreach</h1>
                <p className="text-sm text-surface-400">
                  Connect accounts, create campaigns, and automate your outreach
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {activeTab === 'accounts' && (
                <button
                  onClick={() => setShowConnectModal(true)}
                  className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
                >
                  <Plus size={16} />
                  Connect Account
                </button>
              )}
              {activeTab === 'campaigns' && accounts.length > 0 && (
                <button
                  onClick={() => setShowCampaignModal(true)}
                  className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
                >
                  <Plus size={16} />
                  New Campaign
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-6 gap-4">
            <div className="rounded-lg border border-surface-700 bg-surface-800/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
                  <Users size={20} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-surface-100">{accounts.length}</p>
                  <p className="text-xs text-surface-400">Accounts</p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-surface-700 bg-surface-800/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20">
                  <Target size={20} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-surface-100">{stats?.activeCampaigns ?? 0}</p>
                  <p className="text-xs text-surface-400">Active</p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-surface-700 bg-surface-800/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/20">
                  <UserPlus size={20} className="text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-surface-100">{stats?.totalLeads ?? 0}</p>
                  <p className="text-xs text-surface-400">Leads</p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-surface-700 bg-surface-800/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20">
                  <Clock size={20} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-surface-100">{stats?.pendingActions ?? 0}</p>
                  <p className="text-xs text-surface-400">Pending</p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-surface-700 bg-surface-800/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/20">
                  <Check size={20} className="text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-surface-100">{stats?.completedToday ?? 0}</p>
                  <p className="text-xs text-surface-400">Today</p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-surface-700 bg-surface-800/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/20">
                  <MessageSquare size={20} className="text-orange-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-surface-100">{messages.filter(m => !m.readAt && !m.isOutbound).length}</p>
                  <p className="text-xs text-surface-400">Unread</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-6 flex items-center gap-6">
            {[
              { id: 'accounts', label: 'Accounts', icon: Users },
              { id: 'campaigns', label: 'Campaigns', icon: Target },
              { id: 'inbox', label: 'Inbox', icon: Inbox },
              { id: 'queue', label: 'Action Queue', icon: Zap },
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`flex items-center gap-2 pb-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-surface-400 hover:text-surface-100'
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-8">
        {/* Accounts Tab */}
        {activeTab === 'accounts' && (
          <div>
            {accountsLoading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              </div>
            ) : accounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface-800">
                  <Linkedin size={40} className="text-blue-400" />
                </div>
                <h3 className="mt-6 text-xl font-semibold text-surface-100">Connect Your LinkedIn Account</h3>
                <p className="mt-2 max-w-md text-center text-sm text-surface-400">
                  Connect multiple LinkedIn accounts to increase your daily sending volume and reach more prospects.
                </p>
                <button
                  onClick={() => setShowConnectModal(true)}
                  className="mt-6 flex items-center gap-2 rounded-lg bg-blue-500 px-6 py-3 text-sm font-medium text-white hover:bg-blue-600"
                >
                  <Plus size={18} />
                  Connect Account
                </button>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {accounts.map(account => (
                  <div
                    key={account.id}
                    className="rounded-xl border border-surface-700 bg-surface-900 p-5 hover:border-surface-600 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        {account.avatarUrl ? (
                          <img src={account.avatarUrl} alt="" className="h-14 w-14 rounded-full" />
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 text-lg font-medium">
                            {account.name[0]}
                          </div>
                        )}
                        <div>
                          <h3 className="font-semibold text-surface-100">{account.name}</h3>
                          <p className="text-sm text-surface-400 line-clamp-1">{account.headline || 'No headline'}</p>
                        </div>
                      </div>
                      <div className={`h-3 w-3 rounded-full ${STATUS_COLORS[account.status]}`} />
                    </div>

                    <div className="mt-4 flex items-center gap-4 text-sm text-surface-400">
                      <span>{account._count.campaigns} campaigns</span>
                      <span>•</span>
                      <span>{account._count.actions} actions</span>
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      <a
                        href={account.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-surface-600 py-2 text-sm text-surface-300 hover:bg-surface-800"
                      >
                        <ExternalLink size={14} />
                        View Profile
                      </a>
                      <button
                        onClick={() => disconnectMutation.mutate(account.id)}
                        disabled={disconnectMutation.isPending}
                        className="flex items-center justify-center gap-2 rounded-lg border border-red-500/50 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10"
                      >
                        <Unplug size={14} />
                        Disconnect
                      </button>
                    </div>

                    {account.status !== 'CONNECTED' && (
                      <div className={`mt-3 flex flex-col gap-1 rounded-lg px-3 py-2 text-sm ${
                        account.status === 'VERIFYING' ? 'bg-blue-500/10 text-blue-400' :
                        account.status === 'NEEDS_ATTENTION' ? 'bg-amber-500/10 text-amber-400' :
                        'bg-red-500/10 text-red-400'
                      }`}>
                        <div className="flex items-center gap-2">
                          {account.status === 'VERIFYING' ? <RefreshCw size={14} className="animate-spin" /> : <AlertCircle size={14} />}
                          {account.status === 'DISCONNECTED' && (account.errorMessage || 'Session expired - reconnect to continue')}
                          {account.status === 'VERIFYING' && (
                            <span>
                              {account.errorMessage || 'A browser window will open - complete login there and solve any captcha'}
                            </span>
                          )}
                          {account.status === 'NEEDS_ATTENTION' && (
                            <span>
                              Login timed out or failed. Please try again - 
                              use a browser extension to export your LinkedIn cookies.
                            </span>
                          )}
                          {account.status === 'RECONNECTING' && 'Attempting to reconnect...'}
                          {account.status === 'RATE_LIMITED' && 'Daily limit reached - resuming tomorrow'}
                          {account.status === 'SUSPENDED' && 'Account suspended by LinkedIn'}
                        </div>
                        {account.errorCode && account.status !== 'VERIFYING' && (
                          <div className="text-xs opacity-75">
                            {account.errorCode === 'CHECKPOINT' 
                              ? 'LinkedIn detected automated login. Use Cookie Login as a workaround.'
                              : `Error: ${account.errorCode}`
                            }
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Campaigns Tab */}
        {activeTab === 'campaigns' && (
          <div>
            {accountsLoading || campaignsLoading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              </div>
            ) : accounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <AlertCircle size={48} className="text-surface-500" />
                <h3 className="mt-4 text-lg font-medium text-surface-100">Connect an Account First</h3>
                <p className="mt-2 text-sm text-surface-400">
                  You need to connect a LinkedIn account before creating campaigns.
                </p>
                <button
                  onClick={() => {
                    setActiveTab('accounts');
                    setShowConnectModal(true);
                  }}
                  className="mt-4 flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
                >
                  <Plus size={16} />
                  Connect Account
                </button>
              </div>
            ) : campaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface-800">
                  <Target size={40} className="text-emerald-400" />
                </div>
                <h3 className="mt-6 text-xl font-semibold text-surface-100">Create Your First Campaign</h3>
                <p className="mt-2 max-w-md text-center text-sm text-surface-400">
                  Set up automated sequences to connect and message prospects at scale.
                </p>
                <button
                  onClick={() => setShowCampaignModal(true)}
                  className="mt-6 flex items-center gap-2 rounded-lg bg-emerald-500 px-6 py-3 text-sm font-medium text-white hover:bg-emerald-600"
                >
                  <Plus size={18} />
                  Create Campaign
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {campaigns.map(campaign => (
                  <div
                    key={campaign.id}
                    className="rounded-xl border border-surface-700 bg-surface-900 p-5"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`h-12 w-12 rounded-xl ${CAMPAIGN_STATUS_COLORS[campaign.status]} flex items-center justify-center`}>
                          <Target size={24} className="text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-surface-100">{campaign.name}</h3>
                          <p className="text-sm text-surface-400">
                            {campaign.steps.length} steps • {campaign._count.leads} leads
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedCampaign(campaign);
                            setShowLeadsModal(true);
                          }}
                          className="flex items-center gap-2 rounded-lg border border-surface-600 px-3 py-2 text-sm text-surface-300 hover:border-blue-500 hover:text-blue-400"
                        >
                          <UserPlus size={14} />
                          Add Leads
                        </button>
                        {campaign.status === 'ACTIVE' ? (
                          <button
                            onClick={() => pauseCampaignMutation.mutate(campaign.id)}
                            disabled={pauseCampaignMutation.isPending}
                            className="flex items-center gap-2 rounded-lg border border-amber-500/50 px-3 py-2 text-sm text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
                          >
                            <Pause size={14} />
                            Pause
                          </button>
                        ) : campaign.status === 'PAUSED' || campaign.status === 'DRAFT' ? (
                          <button
                            onClick={() => activateCampaignMutation.mutate(campaign.id)}
                            disabled={activateCampaignMutation.isPending}
                            className="flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm text-white hover:bg-emerald-600 disabled:opacity-50"
                          >
                            <Play size={14} />
                            {campaign.status === 'DRAFT' ? 'Start' : 'Resume'}
                          </button>
                        ) : null}
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                          campaign.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' :
                          campaign.status === 'PAUSED' ? 'bg-amber-500/20 text-amber-400' :
                          campaign.status === 'DRAFT' ? 'bg-surface-700 text-surface-300' :
                          'bg-surface-700 text-surface-400'
                        }`}>
                          {campaign.status}
                        </span>
                      </div>
                    </div>

                    {/* Campaign Stats */}
                    <div className="mt-4 grid grid-cols-4 gap-4">
                      <div className="rounded-lg bg-surface-800/50 p-3">
                        <p className="text-lg font-semibold text-surface-100">{campaign.totalLeads}</p>
                        <p className="text-xs text-surface-400">Total Leads</p>
                      </div>
                      <div className="rounded-lg bg-surface-800/50 p-3">
                        <p className="text-lg font-semibold text-surface-100">{campaign.sentCount}</p>
                        <p className="text-xs text-surface-400">Invites Sent</p>
                      </div>
                      <div className="rounded-lg bg-surface-800/50 p-3">
                        <p className="text-lg font-semibold text-emerald-400">{campaign.acceptedCount}</p>
                        <p className="text-xs text-surface-400">Accepted</p>
                      </div>
                      <div className="rounded-lg bg-surface-800/50 p-3">
                        <p className="text-lg font-semibold text-blue-400">{campaign.repliedCount}</p>
                        <p className="text-xs text-surface-400">Replied</p>
                      </div>
                    </div>

                    {/* Steps Preview */}
                    <div className="mt-4 flex items-center gap-2 text-sm">
                      {campaign.steps.slice(0, 3).map((step, i) => (
                        <div key={step.id} className="flex items-center gap-2">
                          <span className="rounded-full bg-surface-700 px-3 py-1 text-surface-300">
                            {step.actionType === 'CONNECTION_REQUEST' && 'Connect'}
                            {step.actionType === 'MESSAGE' && 'Message'}
                            {step.actionType === 'PROFILE_VIEW' && 'View'}
                            {step.actionType === 'FOLLOW' && 'Follow'}
                            {step.actionType === 'INMAIL' && 'InMail'}
                          </span>
                          {i < Math.min(campaign.steps.length, 3) - 1 && (
                            <ArrowRight size={14} className="text-surface-500" />
                          )}
                        </div>
                      ))}
                      {campaign.steps.length > 3 && (
                        <span className="text-surface-500">+{campaign.steps.length - 3} more</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Inbox Tab */}
        {activeTab === 'inbox' && (
          <div>
            {messagesLoading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface-800">
                  <Inbox size={40} className="text-surface-500" />
                </div>
                <h3 className="mt-6 text-xl font-semibold text-surface-100">No Messages Yet</h3>
                <p className="mt-2 text-sm text-surface-400">
                  Messages from your LinkedIn conversations will appear here.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-surface-700 bg-surface-900 overflow-hidden">
                <div className="divide-y divide-surface-800">
                  {messages.map(message => (
                    <div
                      key={message.id}
                      className={`flex items-start gap-4 p-4 hover:bg-surface-800/50 cursor-pointer ${
                        !message.readAt && !message.isOutbound ? 'bg-blue-500/5' : ''
                      }`}
                    >
                      {message.contact?.avatarUrl ? (
                        <img src={message.contact.avatarUrl} alt="" className="h-10 w-10 rounded-full" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-700 text-surface-300 text-sm font-medium">
                          {(message.senderName || 'U')[0]}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-surface-100">
                            {message.isOutbound ? message.receiverName : message.senderName}
                          </span>
                          {message.isOutbound && (
                            <span className="rounded-full bg-surface-700 px-2 py-0.5 text-xs text-surface-400">You</span>
                          )}
                          {!message.readAt && !message.isOutbound && (
                            <span className="h-2 w-2 rounded-full bg-blue-500" />
                          )}
                        </div>
                        <p className="mt-1 text-sm text-surface-300 line-clamp-2">{message.body}</p>
                        <p className="mt-1 text-xs text-surface-500">
                          {format(new Date(message.sentAt), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Queue Tab */}
        {activeTab === 'queue' && (
          <div>
            {queueLoading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              </div>
            ) : queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-800">
                  <Check size={32} className="text-emerald-400" />
                </div>
                <h3 className="mt-4 text-lg font-medium text-surface-100">All caught up!</h3>
                <p className="mt-1 text-sm text-surface-400">
                  No pending LinkedIn actions in your queue.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-surface-100">
                    {queue.length} action{queue.length !== 1 ? 's' : ''} to complete
                  </h2>
                  <p className="text-sm text-surface-400">
                    Click the action buttons after completing on LinkedIn
                  </p>
                </div>
                {queue.map((action) => (
                  <div
                    key={action.id}
                    className="flex items-center gap-4 rounded-xl border border-surface-700 bg-surface-900 p-5"
                  >
                    <div className="flex-shrink-0">
                      {action.contact.avatarUrl ? (
                        <img src={action.contact.avatarUrl} alt="" className="h-12 w-12 rounded-full" />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-700 text-surface-300 text-sm font-medium">
                          {action.contact.firstName?.[0] ?? action.contact.email?.[0]?.toUpperCase() ?? '?'}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-surface-100">
                          {action.contact.firstName
                            ? `${action.contact.firstName} ${action.contact.lastName ?? ''}`
                            : action.contact.email ?? 'Unknown'}
                        </h3>
                        <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-400">
                          {action.actionType === 'PROFILE_VIEW' && 'View Profile'}
                          {action.actionType === 'CONNECTION_REQUEST' && 'Connect'}
                          {action.actionType === 'MESSAGE' && 'Message'}
                          {action.actionType === 'INMAIL' && 'InMail'}
                          {action.actionType === 'FOLLOW' && 'Follow'}
                        </span>
                      </div>
                      {action.connectionNote && (
                        <p className="mt-1 text-sm text-surface-400 truncate">Note: {action.connectionNote}</p>
                      )}
                      {action.messageBody && (
                        <p className="mt-1 text-sm text-surface-400 truncate">{action.messageBody}</p>
                      )}
                    </div>
                    {action.linkedinUrl && (
                      <a
                        href={action.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg border border-surface-600 px-3 py-2 text-sm text-surface-300 hover:border-blue-500 hover:text-blue-400"
                      >
                        <Linkedin size={16} />
                        Open
                      </a>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => completeMutation.mutate({ id: action.id, success: true })}
                        disabled={completeMutation.isPending}
                        className="flex items-center gap-2 rounded-lg bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/30"
                      >
                        <Check size={16} />
                        Done
                      </button>
                      <button
                        onClick={() => skipMutation.mutate(action.id)}
                        disabled={skipMutation.isPending}
                        className="flex items-center gap-2 rounded-lg bg-surface-700 px-3 py-2 text-sm text-surface-300 hover:bg-surface-600"
                      >
                        Skip
                      </button>
                      <button
                        onClick={() => completeMutation.mutate({ id: action.id, success: false })}
                        disabled={completeMutation.isPending}
                        className="rounded-lg bg-red-500/20 p-2 text-red-400 hover:bg-red-500/30"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Connect Account Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-surface-700 bg-surface-900 shadow-xl">
            <div className="flex items-center justify-between border-b border-surface-800 p-4">
              <div>
                <h2 className="text-lg font-semibold text-surface-100">Connect LinkedIn Account</h2>
                <p className="text-sm text-surface-400">
                  Connect your LinkedIn account to start automating outreach
                </p>
              </div>
              <button
                onClick={() => {
                  setShowConnectModal(false);
                  resetConnectForm();
                }}
                className="rounded-lg p-2 text-surface-400 hover:bg-surface-800 hover:text-surface-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4">
              {/* Step 1: Choose Connection Method */}
              {connectionMethod === 'select' && (
                <div className="space-y-4">
                  <h3 className="text-base font-medium text-surface-100">
                    How do you want to connect your LinkedIn account?
                  </h3>
                  
                  {/* Infinite Login Option */}
                  <button
                    onClick={() => setConnectionMethod('infinite')}
                    className="w-full rounded-xl border border-surface-700 bg-surface-800/50 p-4 text-left hover:border-blue-500/50 hover:bg-surface-800 transition-all group"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600">
                        <Zap size={24} className="text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-surface-100">Infinite Login</h4>
                          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
                            Recommended
                          </span>
                        </div>
                        <p className="text-sm text-surface-400">LinkedIn Credentials + 2FA</p>
                        <p className="mt-2 text-sm text-surface-500">
                          Keep your LinkedIn account always connected. No more disconnection issues.
                        </p>
                      </div>
                      <ChevronRight size={20} className="text-surface-500 group-hover:text-blue-400" />
                    </div>
                  </button>

                  {/* Credentials Login Option */}
                  <button
                    onClick={() => setConnectionMethod('credentials')}
                    className="w-full rounded-xl border border-surface-700 bg-surface-800/50 p-4 text-left hover:border-blue-500/50 hover:bg-surface-800 transition-all group"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
                        <Linkedin size={24} className="text-white" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-surface-100">Credentials Login</h4>
                        <p className="mt-1 text-sm text-surface-500">
                          Login securely using your LinkedIn account credentials.
                        </p>
                      </div>
                      <ChevronRight size={20} className="text-surface-500 group-hover:text-blue-400" />
                    </div>
                  </button>

                  {/* Cookie Login Option */}
                  <button
                    onClick={() => setConnectionMethod('cookie')}
                    className="w-full rounded-xl border border-surface-700 bg-surface-800/50 p-4 text-left hover:border-blue-500/50 hover:bg-surface-800 transition-all group"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-purple-600">
                        <Key size={24} className="text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-surface-100">Cookie Login</h4>
                          <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-400">
                            Most Reliable
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-surface-500">
                          Use your browser's LinkedIn session cookie for instant connection.
                        </p>
                      </div>
                      <ChevronRight size={20} className="text-surface-500 group-hover:text-blue-400" />
                    </div>
                  </button>
                </div>
              )}

              {/* Step 2: Infinite Login - 2FA Check */}
              {connectionMethod === 'infinite' && has2FA === null && (
                <div className="space-y-4">
                  <button
                    onClick={() => setConnectionMethod('select')}
                    className="flex items-center gap-2 text-sm text-surface-400 hover:text-surface-100"
                  >
                    <ChevronRight size={16} className="rotate-180" />
                    Back
                  </button>
                  
                  <div className="space-y-3">
                    <h3 className="text-base font-medium text-surface-100">
                      Activate Infinite Login in 2 minutes
                    </h3>
                    <p className="text-sm text-surface-400">
                      Using <span className="text-blue-400">Infinite Login</span> protects your LinkedIn account 
                      from getting disconnected and pausing your campaigns. To use it, you'll need to enable 
                      LinkedIn <span className="text-blue-400">Two-Factor Authentication (2FA)</span>.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => setConnectionMethod('credentials')}
                      className="flex-1 rounded-lg border border-surface-600 px-4 py-3 text-sm font-medium text-surface-300 hover:bg-surface-800"
                    >
                      No, I don't have 2FA
                    </button>
                    <button
                      onClick={() => setHas2FA(true)}
                      className="flex-1 rounded-lg bg-blue-500 px-4 py-3 text-sm font-medium text-white hover:bg-blue-600"
                    >
                      Yes, I have 2FA
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Infinite Login - Confirm 2FA Setup */}
              {connectionMethod === 'infinite' && has2FA === true && (!confirmAuthenticator || !confirmSecretKey) && (
                <div className="space-y-4">
                  <button
                    onClick={() => setHas2FA(null)}
                    className="flex items-center gap-2 text-sm text-surface-400 hover:text-surface-100"
                  >
                    <ChevronRight size={16} className="rotate-180" />
                    Back
                  </button>

                  <div className="space-y-4">
                    {/* Authenticator App Check */}
                    <div className="rounded-lg border border-surface-700 bg-surface-800/50 p-4">
                      <h4 className="font-medium text-surface-100">
                        Did you use Authenticator app to enable 2FA?
                      </h4>
                      <p className="mt-2 text-sm text-surface-400">
                        To be able to use Infinite login, you'll have to use app-based authentication 
                        code, and not via phone (SMS).
                      </p>
                      <p className="mt-2 text-sm text-surface-500">
                        <strong className="text-surface-400">Didn't use Authenticator app?</strong> You'll need to 
                        disable 2FA and turn it back on to get a new key.
                      </p>
                      <label className="mt-3 flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={confirmAuthenticator}
                          onChange={(e) => setConfirmAuthenticator(e.target.checked)}
                          className="h-4 w-4 rounded border-surface-600 bg-surface-800 text-blue-500 focus:ring-blue-500"
                        />
                        <span className="text-sm text-surface-300">
                          Yes, I confirm I used the Authenticator app
                        </span>
                      </label>
                    </div>

                    {/* Secret Key Check */}
                    <div className="rounded-lg border border-surface-700 bg-surface-800/50 p-4">
                      <h4 className="font-medium text-surface-100">
                        Do you have your 2FA secret key?
                      </h4>
                      <p className="mt-2 text-sm text-surface-400">
                        2FA secret key is a unique code you get from LinkedIn once you enable your 2FA. 
                        Keep in mind that you can't access it again.
                      </p>
                      <p className="mt-2 text-sm text-surface-500">
                        <strong className="text-surface-400">Lost your 2FA secret key?</strong> You'll need to 
                        disable 2FA and turn it back on to get a new key.
                      </p>
                      <label className="mt-3 flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={confirmSecretKey}
                          onChange={(e) => setConfirmSecretKey(e.target.checked)}
                          className="h-4 w-4 rounded border-surface-600 bg-surface-800 text-blue-500 focus:ring-blue-500"
                        />
                        <span className="text-sm text-surface-300">
                          Yes, I have my 2FA secret key
                        </span>
                      </label>
                    </div>
                  </div>

                  <button
                    disabled={!confirmAuthenticator || !confirmSecretKey}
                    onClick={() => {/* Just proceed - form will show */}}
                    className="w-full rounded-lg bg-blue-500 px-4 py-3 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}

              {/* Step 4: Infinite Login Form */}
              {connectionMethod === 'infinite' && has2FA === true && confirmAuthenticator && confirmSecretKey && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    connectMutation.mutate({ ...connectForm, method: 'infinite' });
                  }}
                  className="space-y-4"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmAuthenticator(false);
                      setConfirmSecretKey(false);
                    }}
                    className="flex items-center gap-2 text-sm text-surface-400 hover:text-surface-100"
                  >
                    <ChevronRight size={16} className="rotate-180" />
                    Back
                  </button>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-surface-300">
                      Your LinkedIn Profile URL *
                    </label>
                    <p className="mb-2 text-xs text-surface-500">
                      Find this by going to your LinkedIn profile and copying the URL from the browser address bar
                    </p>
                    <input
                      type="url"
                      required
                      value={connectForm.profileUrl}
                      onChange={(e) => setConnectForm(prev => ({ ...prev, profileUrl: e.target.value }))}
                      placeholder="https://linkedin.com/in/your-profile-name"
                      className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-surface-100 placeholder-surface-500 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-surface-300">
                      Your Display Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={connectForm.name}
                      onChange={(e) => setConnectForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="John Smith"
                      className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-surface-100 placeholder-surface-500 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-surface-300">
                      Your LinkedIn Email address *
                    </label>
                    <input
                      type="email"
                      required
                      value={connectForm.linkedinEmail}
                      onChange={(e) => setConnectForm(prev => ({ ...prev, linkedinEmail: e.target.value }))}
                      placeholder="your@email.com"
                      className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-surface-100 placeholder-surface-500 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-surface-300">
                      Your LinkedIn password *
                    </label>
                    <input
                      type="password"
                      required
                      value={connectForm.linkedinPassword}
                      onChange={(e) => setConnectForm(prev => ({ ...prev, linkedinPassword: e.target.value }))}
                      placeholder="LinkedIn password"
                      className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-surface-100 placeholder-surface-500 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-surface-300">
                      Enter your 2FA secret key *
                    </label>
                    <p className="mb-2 text-xs text-surface-500">
                      Your 2FA secret key is not the code from the Authenticator app.
                    </p>
                    <input
                      type="text"
                      required
                      value={connectForm.twoFASecret}
                      onChange={(e) => setConnectForm(prev => ({ ...prev, twoFASecret: e.target.value }))}
                      placeholder="2FA secret key"
                      className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-surface-100 placeholder-surface-500 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-surface-300">
                      Select your country
                    </label>
                    <select
                      value={connectForm.country}
                      onChange={(e) => setConnectForm(prev => ({ ...prev, country: e.target.value }))}
                      className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-surface-100 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="US">🇺🇸 United States</option>
                      <option value="GB">🇬🇧 United Kingdom</option>
                      <option value="NL">🇳🇱 Netherlands</option>
                      <option value="DE">🇩🇪 Germany</option>
                      <option value="FR">🇫🇷 France</option>
                      <option value="ES">🇪🇸 Spain</option>
                      <option value="IT">🇮🇹 Italy</option>
                      <option value="CA">🇨🇦 Canada</option>
                      <option value="AU">🇦🇺 Australia</option>
                      <option value="IN">🇮🇳 India</option>
                      <option value="BR">🇧🇷 Brazil</option>
                      <option value="SG">🇸🇬 Singapore</option>
                      <option value="AE">🇦🇪 UAE</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={connectMutation.isPending}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-6 py-3 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                  >
                    {connectMutation.isPending ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <LinkIcon size={16} />
                        Connect Account
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Credentials Login Form */}
              {connectionMethod === 'credentials' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    connectMutation.mutate({ ...connectForm, method: 'credentials' });
                  }}
                  className="space-y-4"
                >
                  <button
                    type="button"
                    onClick={() => setConnectionMethod('select')}
                    className="flex items-center gap-2 text-sm text-surface-400 hover:text-surface-100"
                  >
                    <ChevronRight size={16} className="rotate-180" />
                    Back
                  </button>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-surface-300">
                      Your LinkedIn Profile URL *
                    </label>
                    <p className="mb-2 text-xs text-surface-500">
                      Find this by going to your LinkedIn profile and copying the URL
                    </p>
                    <input
                      type="url"
                      required
                      value={connectForm.profileUrl}
                      onChange={(e) => setConnectForm(prev => ({ ...prev, profileUrl: e.target.value }))}
                      placeholder="https://linkedin.com/in/your-profile-name"
                      className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-surface-100 placeholder-surface-500 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-surface-300">
                      Your Display Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={connectForm.name}
                      onChange={(e) => setConnectForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="John Smith"
                      className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-surface-100 placeholder-surface-500 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-surface-300">
                      Your LinkedIn Email address *
                    </label>
                    <input
                      type="email"
                      required
                      value={connectForm.linkedinEmail}
                      onChange={(e) => setConnectForm(prev => ({ ...prev, linkedinEmail: e.target.value }))}
                      placeholder="your@email.com"
                      className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-surface-100 placeholder-surface-500 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-surface-300">
                      Your LinkedIn password *
                    </label>
                    <input
                      type="password"
                      required
                      value={connectForm.linkedinPassword}
                      onChange={(e) => setConnectForm(prev => ({ ...prev, linkedinPassword: e.target.value }))}
                      placeholder="LinkedIn password"
                      className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-surface-100 placeholder-surface-500 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-surface-300">
                      Select your country
                    </label>
                    <select
                      value={connectForm.country}
                      onChange={(e) => setConnectForm(prev => ({ ...prev, country: e.target.value }))}
                      className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-surface-100 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="US">🇺🇸 United States</option>
                      <option value="GB">🇬🇧 United Kingdom</option>
                      <option value="NL">🇳🇱 Netherlands</option>
                      <option value="DE">🇩🇪 Germany</option>
                      <option value="FR">🇫🇷 France</option>
                      <option value="ES">🇪🇸 Spain</option>
                      <option value="IT">🇮🇹 Italy</option>
                      <option value="CA">🇨🇦 Canada</option>
                      <option value="AU">🇦🇺 Australia</option>
                      <option value="IN">🇮🇳 India</option>
                      <option value="BR">🇧🇷 Brazil</option>
                      <option value="SG">🇸🇬 Singapore</option>
                      <option value="AE">🇦🇪 UAE</option>
                    </select>
                  </div>

                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                    <p className="text-sm text-amber-400">
                      <strong>Note:</strong> Using credentials login may require periodic re-authentication 
                      if LinkedIn detects unusual activity. For always-on automation, consider using 
                      Infinite Login with 2FA.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={connectMutation.isPending}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-6 py-3 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                  >
                    {connectMutation.isPending ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <LinkIcon size={16} />
                        Connect Account
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Cookie Login Form */}
              {connectionMethod === 'cookie' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    connectMutation.mutate({ ...connectForm, method: 'cookie' });
                  }}
                  className="space-y-4"
                >
                  <button
                    type="button"
                    onClick={() => setConnectionMethod('select')}
                    className="flex items-center gap-2 text-sm text-surface-400 hover:text-surface-100"
                  >
                    <ChevronRight size={16} className="rotate-180" />
                    Back
                  </button>

                  <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-4">
                    <h4 className="font-medium text-purple-300 mb-2">How to get your LinkedIn session cookie:</h4>
                    <ol className="text-sm text-purple-300/80 space-y-1 list-decimal list-inside">
                      <li>Log into LinkedIn in your browser</li>
                      <li>Open DevTools (F12 or right-click → Inspect)</li>
                      <li>Go to Application tab → Cookies → linkedin.com</li>
                      <li>Copy the value of the <code className="bg-purple-500/20 px-1 rounded">li_at</code> cookie</li>
                    </ol>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-surface-300">
                      Your LinkedIn Profile URL *
                    </label>
                    <input
                      type="url"
                      required
                      value={connectForm.profileUrl}
                      onChange={(e) => setConnectForm(prev => ({ ...prev, profileUrl: e.target.value }))}
                      placeholder="https://linkedin.com/in/your-profile-name"
                      className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-surface-100 placeholder-surface-500 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-surface-300">
                      Your Display Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={connectForm.name}
                      onChange={(e) => setConnectForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="John Smith"
                      className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-surface-100 placeholder-surface-500 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-surface-300">
                      li_at Session Cookie *
                    </label>
                    <textarea
                      required
                      value={connectForm.sessionCookie}
                      onChange={(e) => setConnectForm(prev => ({ ...prev, sessionCookie: e.target.value }))}
                      placeholder="Paste your li_at cookie value here..."
                      rows={3}
                      className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-surface-100 placeholder-surface-500 focus:border-blue-500 focus:outline-none font-mono text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={connectMutation.isPending || !connectForm.sessionCookie || !connectForm.profileUrl || !connectForm.name}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-purple-500 px-6 py-3 text-sm font-medium text-white hover:bg-purple-600 disabled:opacity-50"
                  >
                    {connectMutation.isPending ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Verifying Cookie...
                      </>
                    ) : (
                      <>
                        <Key size={16} />
                        Connect with Cookie
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Campaign Modal */}
      {showCampaignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-surface-700 bg-surface-900 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="border-b border-surface-800 p-4">
              <h2 className="text-lg font-semibold text-surface-100">Create Campaign</h2>
              <p className="text-sm text-surface-400">
                Set up an automated outreach sequence
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createCampaignMutation.mutate(campaignForm);
              }}
              className="p-4 space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-surface-300">
                    Campaign Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={campaignForm.name}
                    onChange={(e) => setCampaignForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Q1 Outreach Campaign"
                    className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-surface-100 placeholder-surface-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-surface-300">
                    LinkedIn Account *
                  </label>
                  <select
                    required
                    value={campaignForm.accountId}
                    onChange={(e) => setCampaignForm(prev => ({ ...prev, accountId: e.target.value }))}
                    className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-surface-100 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Select account</option>
                    {accounts.map(account => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-surface-300">
                  Description (optional)
                </label>
                <textarea
                  value={campaignForm.description}
                  onChange={(e) => setCampaignForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Campaign description..."
                  rows={2}
                  className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-surface-100 placeholder-surface-500 focus:border-blue-500 focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-surface-300">
                  Daily Limit
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={campaignForm.dailyLimit}
                  onChange={(e) => setCampaignForm(prev => ({ ...prev, dailyLimit: parseInt(e.target.value) || 20 }))}
                  className="w-32 rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-surface-100 focus:border-blue-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-surface-500">Maximum actions per day</p>
              </div>

              {/* Steps */}
              <div>
                <label className="mb-2 block text-sm font-medium text-surface-300">
                  Sequence Steps
                </label>
                <div className="space-y-3">
                  {campaignForm.steps.map((step, index) => (
                    <div key={index} className="rounded-lg border border-surface-700 bg-surface-800/50 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-surface-300">Step {step.stepNumber}</span>
                        {campaignForm.steps.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setCampaignForm(prev => ({
                              ...prev,
                              steps: prev.steps.filter((_, i) => i !== index),
                            }))}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <select
                          value={step.actionType}
                          onChange={(e) => setCampaignForm(prev => ({
                            ...prev,
                            steps: prev.steps.map((s, i) => i === index ? { ...s, actionType: e.target.value } : s),
                          }))}
                          className="rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 focus:border-blue-500 focus:outline-none"
                        >
                          <option value="PROFILE_VIEW">View Profile</option>
                          <option value="CONNECTION_REQUEST">Send Connection</option>
                          <option value="MESSAGE">Send Message</option>
                          <option value="FOLLOW">Follow</option>
                          <option value="INMAIL">Send InMail</option>
                        </select>
                        <input
                          type="number"
                          min={0}
                          value={step.delayDays}
                          onChange={(e) => setCampaignForm(prev => ({
                            ...prev,
                            steps: prev.steps.map((s, i) => i === index ? { ...s, delayDays: parseInt(e.target.value) || 0 } : s),
                          }))}
                          className="rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 focus:border-blue-500 focus:outline-none"
                          placeholder="Delay (days)"
                        />
                      </div>
                      {step.actionType === 'CONNECTION_REQUEST' && (
                        <textarea
                          value={step.connectionNote}
                          onChange={(e) => setCampaignForm(prev => ({
                            ...prev,
                            steps: prev.steps.map((s, i) => i === index ? { ...s, connectionNote: e.target.value } : s),
                          }))}
                          placeholder="Connection note (optional, 300 chars max)..."
                          maxLength={300}
                          rows={2}
                          className="mt-3 w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 placeholder-surface-500 focus:border-blue-500 focus:outline-none resize-none"
                        />
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setCampaignForm(prev => ({
                    ...prev,
                    steps: [...prev.steps, {
                      stepNumber: prev.steps.length + 1,
                      actionType: 'MESSAGE',
                      delayDays: 1,
                      connectionNote: '',
                    }],
                  }))}
                  className="mt-3 flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
                >
                  <Plus size={14} />
                  Add Step
                </button>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-800">
                <button
                  type="button"
                  onClick={() => setShowCampaignModal(false)}
                  className="rounded-lg px-4 py-2 text-sm text-surface-400 hover:text-surface-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createCampaignMutation.isPending || !campaignForm.accountId}
                  className="flex items-center gap-2 rounded-lg bg-emerald-500 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  {createCampaignMutation.isPending ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Target size={16} />
                      Create Campaign
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Leads Modal */}
      {showLeadsModal && selectedCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-surface-700 bg-surface-900 shadow-xl max-h-[90vh] flex flex-col">
            <div className="border-b border-surface-800 p-4">
              <h2 className="text-lg font-semibold text-surface-100">
                Add Leads to {selectedCampaign.name}
              </h2>
              <p className="text-sm text-surface-400">
                Select contacts to import into this campaign
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {contactsLoading ? (
                <div className="flex h-40 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                </div>
              ) : contacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <Users size={40} className="text-surface-500" />
                  <p className="mt-4 text-surface-400">No contacts found</p>
                  <p className="text-sm text-surface-500">Add contacts to your CRM first</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-sm text-surface-400">
                      {selectedContactIds.length} of {contacts.length} selected
                    </p>
                    <button
                      onClick={() => {
                        if (selectedContactIds.length === contacts.length) {
                          setSelectedContactIds([]);
                        } else {
                          setSelectedContactIds(contacts.map((c) => c.id));
                        }
                      }}
                      className="text-sm text-blue-400 hover:underline"
                    >
                      {selectedContactIds.length === contacts.length ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  {contacts.map((contact) => (
                    <label
                      key={contact.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                        selectedContactIds.includes(contact.id)
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-surface-700 hover:border-surface-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedContactIds.includes(contact.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedContactIds((prev) => [...prev, contact.id]);
                          } else {
                            setSelectedContactIds((prev) => prev.filter((id) => id !== contact.id));
                          }
                        }}
                        className="h-4 w-4 rounded border-surface-600 bg-surface-800 text-blue-500 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-surface-100">
                          {contact.firstName || contact.lastName
                            ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
                            : contact.email || 'Unknown'}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-surface-400">
                          {contact.company?.name && <span>{contact.company.name}</span>}
                          {contact.linkedinUrl && (
                            <span className="flex items-center gap-1 text-blue-400">
                              <Linkedin size={12} />
                              Has LinkedIn
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-surface-800 p-4">
              <p className="text-sm text-surface-500">
                Only contacts with LinkedIn URLs will be imported
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowLeadsModal(false);
                    setSelectedContactIds([]);
                    setSelectedCampaign(null);
                  }}
                  className="rounded-lg px-4 py-2 text-sm text-surface-400 hover:text-surface-100"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (selectedCampaign && selectedContactIds.length > 0) {
                      importLeadsMutation.mutate({
                        campaignId: selectedCampaign.id,
                        contactIds: selectedContactIds,
                      });
                    }
                  }}
                  disabled={importLeadsMutation.isPending || selectedContactIds.length === 0}
                  className="flex items-center gap-2 rounded-lg bg-blue-500 px-6 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                >
                  {importLeadsMutation.isPending ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <UserPlus size={16} />
                      Import {selectedContactIds.length} Lead{selectedContactIds.length !== 1 ? 's' : ''}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
