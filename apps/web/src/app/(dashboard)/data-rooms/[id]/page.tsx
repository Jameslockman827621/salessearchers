'use client';

import { useState, use } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { format } from 'date-fns';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  ExternalLink,
  Copy,
  Settings,
  Eye,
  Clock,
  Users,
  FileText,
  Link as LinkIcon,
  Video,
  Image as ImageIcon,
  Trash2,
  GripVertical,
  Check,
  ChevronDown,
  ChevronRight,
  Calendar,
  BarChart3,
} from 'lucide-react';

type ContentType = 'FILE' | 'LINK' | 'VIDEO' | 'EMBED' | 'TEXT' | 'IMAGE' | 'PDF';

export default function DataRoomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'content' | 'analytics' | 'settings'>('content');
  const [showAddContentModal, setShowAddContentModal] = useState(false);
  const [showAddSectionModal, setShowAddSectionModal] = useState(false);
  const [showAddActionItemModal, setShowAddActionItemModal] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const { data: dataRoom, isLoading } = useQuery({
    queryKey: ['data-room', id],
    queryFn: () => api.getDataRoom(id),
  });

  const { data: analytics } = useQuery({
    queryKey: ['data-room-analytics', id],
    queryFn: () => api.getDataRoomAnalytics(id),
    enabled: activeTab === 'analytics',
  });

  const toggleActionItemMutation = useMutation({
    mutationFn: (itemId: string) => api.toggleDataRoomActionItem(id, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-room', id] });
    },
  });

  const deleteContentMutation = useMutation({
    mutationFn: (contentId: string) => api.deleteDataRoomContent(id, contentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-room', id] });
    },
  });

  const deleteActionItemMutation = useMutation({
    mutationFn: (itemId: string) => api.deleteDataRoomActionItem(id, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-room', id] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => api.updateDataRoom(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-room', id] });
      queryClient.invalidateQueries({ queryKey: ['data-rooms'] });
    },
  });

  const copyShareLink = () => {
    if (!dataRoom) return;
    const url = `${window.location.origin}/room/${dataRoom.slug}`;
    navigator.clipboard.writeText(url);
  };

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const getContentIcon = (type: string) => {
    switch (type) {
      case 'FILE':
      case 'PDF':
        return <FileText size={16} />;
      case 'LINK':
        return <LinkIcon size={16} />;
      case 'VIDEO':
        return <Video size={16} />;
      case 'IMAGE':
        return <ImageIcon size={16} />;
      default:
        return <FileText size={16} />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!dataRoom) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-surface-100">Data room not found</h2>
          <Link href="/data-rooms" className="mt-4 text-primary-400 hover:text-primary-300">
            Back to Data Rooms
          </Link>
        </div>
      </div>
    );
  }

  const allContents = [
    ...dataRoom.contents,
    ...dataRoom.sections.flatMap((s) => s.contents),
  ];

  return (
    <div className="min-h-screen bg-surface-950">
      {/* Header */}
      <div className="border-b border-surface-800 bg-surface-900/50">
        <div className="px-8 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Link
              href="/data-rooms"
              className="flex items-center gap-2 text-sm text-surface-400 hover:text-surface-100"
            >
              <ArrowLeft size={16} />
              Back to Data Rooms
            </Link>
          </div>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-surface-100">{dataRoom.name}</h1>
                <select
                  value={dataRoom.status}
                  onChange={(e) => updateStatusMutation.mutate(e.target.value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border-0 focus:ring-0 cursor-pointer ${
                    dataRoom.status === 'ACTIVE'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : dataRoom.status === 'DRAFT'
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-surface-500/20 text-surface-400'
                  }`}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
              {dataRoom.description && (
                <p className="mt-1 text-sm text-surface-400">{dataRoom.description}</p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={copyShareLink}
                className="flex items-center gap-2 rounded-lg border border-surface-700 px-4 py-2 text-sm font-medium text-surface-300 hover:border-surface-600 hover:text-surface-100"
              >
                <Copy size={16} />
                Copy Link
              </button>
              <a
                href={`/room/${dataRoom.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
              >
                <ExternalLink size={16} />
                View Public Page
              </a>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm text-surface-400">
              <Eye size={16} />
              <span>{dataRoom.totalViews} total views</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-surface-400">
              <Users size={16} />
              <span>{dataRoom.uniqueVisitors} unique visitors</span>
            </div>
            {dataRoom.lastViewedAt && (
              <div className="flex items-center gap-2 text-sm text-surface-400">
                <Clock size={16} />
                <span>Last viewed {format(new Date(dataRoom.lastViewedAt), 'MMM d, h:mm a')}</span>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="mt-6 flex items-center gap-6 border-t border-surface-800 pt-4">
            <button
              onClick={() => setActiveTab('content')}
              className={`flex items-center gap-2 pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'content'
                  ? 'border-primary-500 text-primary-400'
                  : 'border-transparent text-surface-400 hover:text-surface-100'
              }`}
            >
              <FileText size={16} />
              Content
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-2 pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'analytics'
                  ? 'border-primary-500 text-primary-400'
                  : 'border-transparent text-surface-400 hover:text-surface-100'
              }`}
            >
              <BarChart3 size={16} />
              Analytics
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'settings'
                  ? 'border-primary-500 text-primary-400'
                  : 'border-transparent text-surface-400 hover:text-surface-100'
              }`}
            >
              <Settings size={16} />
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* Content Tab */}
      {activeTab === 'content' && (
        <div className="p-8">
          <div className="grid gap-8 lg:grid-cols-3">
            {/* Content & Sections */}
            <div className="lg:col-span-2 space-y-6">
              {/* Quick Actions */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowAddContentModal(true)}
                  className="flex items-center gap-2 rounded-lg border border-surface-700 px-4 py-2 text-sm font-medium text-surface-300 hover:border-primary-500 hover:text-primary-400"
                >
                  <Plus size={16} />
                  Add Content
                </button>
                <button
                  onClick={() => setShowAddSectionModal(true)}
                  className="flex items-center gap-2 rounded-lg border border-surface-700 px-4 py-2 text-sm font-medium text-surface-300 hover:border-primary-500 hover:text-primary-400"
                >
                  <Plus size={16} />
                  Add Section
                </button>
              </div>

              {/* Unsectioned Content */}
              {dataRoom.contents.length > 0 && (
                <div className="rounded-xl border border-surface-800 bg-surface-900 p-5">
                  <h3 className="text-sm font-medium text-surface-300 mb-4">General Content</h3>
                  <div className="space-y-3">
                    {dataRoom.contents.map((content) => (
                      <div
                        key={content.id}
                        className="flex items-center gap-4 rounded-lg border border-surface-700 bg-surface-800/50 p-4 hover:border-surface-600"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-700 text-surface-400">
                          {getContentIcon(content.type)}
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-surface-100">{content.name}</h4>
                          {content.description && (
                            <p className="text-xs text-surface-400 mt-0.5">{content.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-surface-500">
                          <Eye size={12} />
                          {content.viewCount}
                        </div>
                        <button
                          onClick={() => {
                            if (confirm('Delete this content?')) {
                              deleteContentMutation.mutate(content.id);
                            }
                          }}
                          className="p-2 text-surface-400 hover:text-red-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sections */}
              {dataRoom.sections.map((section) => (
                <div
                  key={section.id}
                  className="rounded-xl border border-surface-800 bg-surface-900 overflow-hidden"
                >
                  <button
                    onClick={() => toggleSection(section.id)}
                    className="flex w-full items-center gap-3 p-5 text-left hover:bg-surface-800/50"
                  >
                    {expandedSections.has(section.id) ? (
                      <ChevronDown size={16} className="text-surface-400" />
                    ) : (
                      <ChevronRight size={16} className="text-surface-400" />
                    )}
                    <div className="flex-1">
                      <h3 className="font-medium text-surface-100">{section.name}</h3>
                      {section.description && (
                        <p className="text-xs text-surface-400 mt-0.5">{section.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-surface-500">{section.contents.length} items</span>
                  </button>

                  {expandedSections.has(section.id) && (
                    <div className="border-t border-surface-800 p-5 space-y-3">
                      {section.contents.length === 0 ? (
                        <p className="text-sm text-surface-500 text-center py-4">
                          No content in this section
                        </p>
                      ) : (
                        section.contents.map((content) => (
                          <div
                            key={content.id}
                            className="flex items-center gap-4 rounded-lg border border-surface-700 bg-surface-800/50 p-4 hover:border-surface-600"
                          >
                            <GripVertical size={14} className="text-surface-500 cursor-grab" />
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-700 text-surface-400">
                              {getContentIcon(content.type)}
                            </div>
                            <div className="flex-1">
                              <h4 className="text-sm font-medium text-surface-100">{content.name}</h4>
                              {content.description && (
                                <p className="text-xs text-surface-400 mt-0.5">{content.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-surface-500">
                              <Eye size={12} />
                              {content.viewCount}
                            </div>
                            <button
                              onClick={() => {
                                if (confirm('Delete this content?')) {
                                  deleteContentMutation.mutate(content.id);
                                }
                              }}
                              className="p-2 text-surface-400 hover:text-red-400"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}

              {allContents.length === 0 && dataRoom.sections.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-surface-700">
                  <FileText size={32} className="text-surface-500" />
                  <h3 className="mt-4 text-lg font-medium text-surface-100">No content yet</h3>
                  <p className="mt-1 text-sm text-surface-400">
                    Add content to share with your prospects
                  </p>
                  <button
                    onClick={() => setShowAddContentModal(true)}
                    className="mt-4 flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
                  >
                    <Plus size={16} />
                    Add Content
                  </button>
                </div>
              )}
            </div>

            {/* Action Items (Mutual Action Plan) */}
            <div>
              <div className="rounded-xl border border-surface-800 bg-surface-900 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-surface-100">Mutual Action Plan</h3>
                  <button
                    onClick={() => setShowAddActionItemModal(true)}
                    className="p-1.5 text-surface-400 hover:text-primary-400"
                  >
                    <Plus size={16} />
                  </button>
                </div>

                {dataRoom.actionItems.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar size={24} className="mx-auto text-surface-500" />
                    <p className="mt-2 text-sm text-surface-400">No action items yet</p>
                    <button
                      onClick={() => setShowAddActionItemModal(true)}
                      className="mt-3 text-sm text-primary-400 hover:text-primary-300"
                    >
                      Add first item
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dataRoom.actionItems.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                          item.isCompleted
                            ? 'border-surface-700 bg-surface-800/30'
                            : 'border-surface-700 bg-surface-800/50'
                        }`}
                      >
                        <button
                          onClick={() => toggleActionItemMutation.mutate(item.id)}
                          className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                            item.isCompleted
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : 'border-surface-600 hover:border-primary-500'
                          }`}
                        >
                          {item.isCompleted && <Check size={12} />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-medium ${
                              item.isCompleted ? 'text-surface-500 line-through' : 'text-surface-100'
                            }`}
                          >
                            {item.title}
                          </p>
                          {item.dueDate && (
                            <p className="text-xs text-surface-500 mt-1">
                              Due {format(new Date(item.dueDate), 'MMM d, yyyy')}
                            </p>
                          )}
                          {item.assignedTo && (
                            <p className="text-xs text-surface-500">{item.assignedTo}</p>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            if (confirm('Delete this action item?')) {
                              deleteActionItemMutation.mutate(item.id);
                            }
                          }}
                          className="p-1 text-surface-400 hover:text-red-400"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Views */}
              {dataRoom.views.length > 0 && (
                <div className="mt-6 rounded-xl border border-surface-800 bg-surface-900 p-5">
                  <h3 className="font-medium text-surface-100 mb-4">Recent Views</h3>
                  <div className="space-y-3">
                    {dataRoom.views.slice(0, 5).map((view) => (
                      <div key={view.id} className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-700 text-xs font-medium text-surface-300">
                          {view.visitorName?.[0] ?? view.visitorEmail?.[0] ?? '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-surface-100 truncate">
                            {view.visitorName ?? view.visitorEmail ?? 'Anonymous'}
                          </p>
                          <p className="text-xs text-surface-500">
                            {format(new Date(view.viewedAt), 'MMM d, h:mm a')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && analytics && (
        <div className="p-8">
          <div className="grid gap-6 md:grid-cols-4">
            <div className="rounded-xl border border-surface-800 bg-surface-900 p-5">
              <p className="text-sm text-surface-400">Total Views</p>
              <p className="mt-2 text-3xl font-semibold text-surface-100">{analytics.totalViews}</p>
            </div>
            <div className="rounded-xl border border-surface-800 bg-surface-900 p-5">
              <p className="text-sm text-surface-400">Unique Visitors</p>
              <p className="mt-2 text-3xl font-semibold text-surface-100">{analytics.uniqueVisitors}</p>
            </div>
            <div className="rounded-xl border border-surface-800 bg-surface-900 p-5">
              <p className="text-sm text-surface-400">Time Spent</p>
              <p className="mt-2 text-3xl font-semibold text-surface-100">
                {Math.round(analytics.totalTimeSpent / 60)}m
              </p>
            </div>
            <div className="rounded-xl border border-surface-800 bg-surface-900 p-5">
              <p className="text-sm text-surface-400">Last Viewed</p>
              <p className="mt-2 text-lg font-semibold text-surface-100">
                {analytics.lastViewedAt
                  ? format(new Date(analytics.lastViewedAt), 'MMM d')
                  : 'Never'}
              </p>
            </div>
          </div>

          {/* Content Stats */}
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-surface-100 mb-4">Content Performance</h3>
            <div className="rounded-xl border border-surface-800 bg-surface-900 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-800">
                    <th className="px-5 py-3 text-left text-xs font-medium text-surface-400 uppercase">Content</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-surface-400 uppercase">Type</th>
                    <th className="px-5 py-3 text-center text-xs font-medium text-surface-400 uppercase">Views</th>
                    <th className="px-5 py-3 text-center text-xs font-medium text-surface-400 uppercase">Downloads</th>
                    <th className="px-5 py-3 text-center text-xs font-medium text-surface-400 uppercase">Avg. Time</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.contentStats.map((content) => (
                    <tr key={content.id} className="border-b border-surface-800/50 last:border-0">
                      <td className="px-5 py-4 text-sm text-surface-100">{content.name}</td>
                      <td className="px-5 py-4 text-sm text-surface-400">{content.type}</td>
                      <td className="px-5 py-4 text-sm text-surface-100 text-center">{content.viewCount}</td>
                      <td className="px-5 py-4 text-sm text-surface-100 text-center">{content.downloadCount}</td>
                      <td className="px-5 py-4 text-sm text-surface-100 text-center">
                        {Math.round(content.avgTimeSpent / 60)}m
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="p-8 max-w-2xl">
          <DataRoomSettings dataRoom={dataRoom} />
        </div>
      )}

      {/* Add Content Modal */}
      {showAddContentModal && (
        <AddContentModal
          dataRoomId={id}
          sections={dataRoom.sections}
          onClose={() => setShowAddContentModal(false)}
          onSuccess={() => {
            setShowAddContentModal(false);
            queryClient.invalidateQueries({ queryKey: ['data-room', id] });
          }}
        />
      )}

      {/* Add Section Modal */}
      {showAddSectionModal && (
        <AddSectionModal
          dataRoomId={id}
          onClose={() => setShowAddSectionModal(false)}
          onSuccess={() => {
            setShowAddSectionModal(false);
            queryClient.invalidateQueries({ queryKey: ['data-room', id] });
          }}
        />
      )}

      {/* Add Action Item Modal */}
      {showAddActionItemModal && (
        <AddActionItemModal
          dataRoomId={id}
          onClose={() => setShowAddActionItemModal(false)}
          onSuccess={() => {
            setShowAddActionItemModal(false);
            queryClient.invalidateQueries({ queryKey: ['data-room', id] });
          }}
        />
      )}
    </div>
  );
}

function DataRoomSettings({
  dataRoom,
}: {
  dataRoom: Awaited<ReturnType<typeof api.getDataRoom>>;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(dataRoom.name);
  const [description, setDescription] = useState(dataRoom.description ?? '');
  const [welcomeMessage, setWelcomeMessage] = useState(dataRoom.welcomeMessage ?? '');
  const [primaryColor, setPrimaryColor] = useState(dataRoom.primaryColor ?? '#6366f1');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      await api.updateDataRoom(dataRoom.id, {
        name,
        description: description || undefined,
        welcomeMessage: welcomeMessage || undefined,
        primaryColor,
      });
      queryClient.invalidateQueries({ queryKey: ['data-room', dataRoom.id] });
    } catch (error) {
      console.error('Failed to update:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-surface-300 mb-1.5">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-surface-300 mb-1.5">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm text-surface-100 focus:border-primary-500 focus:outline-none resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-surface-300 mb-1.5">Welcome Message</label>
        <textarea
          value={welcomeMessage}
          onChange={(e) => setWelcomeMessage(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm text-surface-100 focus:border-primary-500 focus:outline-none resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-surface-300 mb-1.5">Brand Color</label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            className="h-10 w-16 cursor-pointer rounded border border-surface-700 bg-surface-800"
          />
          <input
            type="text"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            className="w-28 rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="pt-4">
        <button
          onClick={handleSave}
          disabled={isSubmitting}
          className="rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
        >
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

function AddContentModal({
  dataRoomId,
  sections,
  onClose,
  onSuccess,
}: {
  dataRoomId: string;
  sections: { id: string; name: string }[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [type, setType] = useState<ContentType>('LINK');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [content, setContent] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await api.createDataRoomContent(dataRoomId, {
        type,
        name,
        description: description || undefined,
        url: url || undefined,
        content: content || undefined,
        sectionId: sectionId || undefined,
      });
      onSuccess();
    } catch (error) {
      console.error('Failed to add content:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-surface-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-800 p-6">
          <h2 className="text-lg font-semibold text-surface-100">Add Content</h2>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-100">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ContentType)}
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
            >
              <option value="LINK">Link</option>
              <option value="VIDEO">Video</option>
              <option value="PDF">PDF</option>
              <option value="TEXT">Text / Rich Content</option>
              <option value="IMAGE">Image</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Product Demo Video"
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description"
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
            />
          </div>

          {(type === 'LINK' || type === 'VIDEO' || type === 'PDF' || type === 'IMAGE') && (
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
              />
            </div>
          )}

          {type === 'TEXT' && (
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">Content</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                placeholder="Enter text content..."
                className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm text-surface-100 focus:border-primary-500 focus:outline-none resize-none"
              />
            </div>
          )}

          {sections.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">Section (optional)</label>
              <select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
              >
                <option value="">No section</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>{section.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-surface-300 hover:text-surface-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {isSubmitting ? 'Adding...' : 'Add Content'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddSectionModal({
  dataRoomId,
  onClose,
  onSuccess,
}: {
  dataRoomId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await api.createDataRoomSection(dataRoomId, {
        name,
        description: description || undefined,
      });
      onSuccess();
    } catch (error) {
      console.error('Failed to add section:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-800 p-6">
          <h2 className="text-lg font-semibold text-surface-100">Add Section</h2>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-100">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Pricing & ROI"
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-surface-300 hover:text-surface-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {isSubmitting ? 'Adding...' : 'Add Section'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddActionItemModal({
  dataRoomId,
  onClose,
  onSuccess,
}: {
  dataRoomId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      await api.createDataRoomActionItem(dataRoomId, {
        title,
        description: description || undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        assignedTo: assignedTo || undefined,
      });
      onSuccess();
    } catch (error) {
      console.error('Failed to add action item:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-800 p-6">
          <h2 className="text-lg font-semibold text-surface-100">Add Action Item</h2>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-100">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Review security documentation"
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm text-surface-100 focus:border-primary-500 focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Assigned To</label>
            <input
              type="text"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="e.g., John (Acme Corp)"
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-surface-300 hover:text-surface-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {isSubmitting ? 'Adding...' : 'Add Action Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

