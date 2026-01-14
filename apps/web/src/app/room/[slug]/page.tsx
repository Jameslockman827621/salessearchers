'use client';

import { useState, useEffect, use } from 'react';
import { format } from 'date-fns';
import {
  FileText,
  Link as LinkIcon,
  Video,
  Image as ImageIcon,
  ExternalLink,
  Check,
  Lock,
  Calendar,
  ChevronDown,
  ChevronRight,
  Download,
  Play,
} from 'lucide-react';

interface DataRoomContent {
  id: string;
  type: string;
  name: string;
  description: string | null;
  url: string | null;
  embedCode: string | null;
  content: string | null;
  thumbnailUrl: string | null;
  isRequired: boolean;
}

interface DataRoomSection {
  id: string;
  name: string;
  description: string | null;
  order: number;
  contents: DataRoomContent[];
}

interface ActionItem {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  assignedTo: string | null;
  isCompleted: boolean;
}

interface PublicDataRoom {
  id: string;
  name: string;
  description: string | null;
  welcomeMessage: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  primaryColor: string | null;
  sections: DataRoomSection[];
  contents: DataRoomContent[];
  actionItems: ActionItem[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export default function PublicDataRoomPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [dataRoom, setDataRoom] = useState<PublicDataRoom | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [selectedContent, setSelectedContent] = useState<DataRoomContent | null>(null);
  const [visitorEmail, setVisitorEmail] = useState('');
  const [showWelcome, setShowWelcome] = useState(true);

  const primaryColor = dataRoom?.primaryColor ?? '#6366f1';

  useEffect(() => {
    fetchDataRoom();
  }, [slug]);

  const fetchDataRoom = async (passwordAttempt?: string) => {
    try {
      setIsLoading(true);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (passwordAttempt) {
        headers['x-data-room-password'] = passwordAttempt;
      }

      const response = await fetch(`${API_BASE}/api/data-rooms/public/${slug}`, {
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.data?.passwordRequired) {
          setNeedsPassword(true);
          setError(null);
        } else {
          setError(data.error?.message ?? 'Data room not found');
        }
        return;
      }

      setDataRoom(data.data);
      setNeedsPassword(false);
      setError(null);

      // Expand all sections by default
      const allSectionIds = new Set<string>(data.data.sections.map((s: DataRoomSection) => s.id));
      setExpandedSections(allSectionIds);

      // Record view
      recordView();
    } catch (err) {
      setError('Failed to load data room');
    } finally {
      setIsLoading(false);
    }
  };

  const recordView = async () => {
    try {
      await fetch(`${API_BASE}/api/data-rooms/public/${slug}/view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorEmail: visitorEmail || undefined,
        }),
      });
    } catch (err) {
      // Silent fail
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDataRoom(password);
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
        return <FileText size={20} />;
      case 'LINK':
        return <LinkIcon size={20} />;
      case 'VIDEO':
        return <Video size={20} />;
      case 'IMAGE':
        return <ImageIcon size={20} />;
      default:
        return <FileText size={20} />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-950">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-950 p-4">
        <div className="w-full max-w-md rounded-2xl bg-surface-900 p-8 shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-800">
              <Lock size={28} className="text-surface-400" />
            </div>
          </div>
          <h1 className="text-xl font-semibold text-surface-100 text-center mb-2">
            Password Protected
          </h1>
          <p className="text-sm text-surface-400 text-center mb-6">
            Enter the password to access this data room
          </p>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-3 text-surface-100 placeholder:text-surface-500 focus:border-primary-500 focus:outline-none"
              autoFocus
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-primary-500 py-3 text-sm font-medium text-white hover:bg-primary-600"
            >
              Access Data Room
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (error || !dataRoom) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-950">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-surface-100">Data Room Not Found</h1>
          <p className="mt-2 text-surface-400">{error ?? 'This data room may have expired or been deleted.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-950">
      {/* Header/Banner */}
      <div
        className="relative h-48 md:h-64"
        style={{
          background: `linear-gradient(135deg, ${primaryColor}60, ${primaryColor}20)`,
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-surface-950" />
        
        {dataRoom.logoUrl && (
          <div className="absolute bottom-0 left-8 translate-y-1/2">
            <div className="h-20 w-20 rounded-xl bg-white p-2 shadow-lg">
              <img
                src={dataRoom.logoUrl}
                alt="Logo"
                className="h-full w-full object-contain"
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-6xl px-6 py-12">
        {/* Title */}
        <div className={dataRoom.logoUrl ? 'ml-28' : ''}>
          <h1 className="text-3xl font-bold text-surface-100">{dataRoom.name}</h1>
          {dataRoom.description && (
            <p className="mt-2 text-lg text-surface-400">{dataRoom.description}</p>
          )}
        </div>

        {/* Welcome Message */}
        {dataRoom.welcomeMessage && showWelcome && (
          <div className="mt-8 rounded-xl bg-surface-900 border border-surface-800 p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-medium text-surface-100 mb-2">Welcome!</h2>
                <p className="text-surface-300 whitespace-pre-wrap">{dataRoom.welcomeMessage}</p>
              </div>
              <button
                onClick={() => setShowWelcome(false)}
                className="text-surface-500 hover:text-surface-300"
              >
                ×
              </button>
            </div>
          </div>
        )}

        <div className="mt-10 grid gap-8 lg:grid-cols-3">
          {/* Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Unsectioned Content */}
            {dataRoom.contents.length > 0 && (
              <div className="space-y-4">
                {dataRoom.contents.map((content) => (
                  <ContentCard
                    key={content.id}
                    content={content}
                    primaryColor={primaryColor}
                    onClick={() => setSelectedContent(content)}
                  />
                ))}
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
                  className="flex w-full items-center gap-3 p-5 text-left hover:bg-surface-800/50 transition-colors"
                >
                  {expandedSections.has(section.id) ? (
                    <ChevronDown size={18} className="text-surface-400" />
                  ) : (
                    <ChevronRight size={18} className="text-surface-400" />
                  )}
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-surface-100">{section.name}</h3>
                    {section.description && (
                      <p className="text-sm text-surface-400 mt-0.5">{section.description}</p>
                    )}
                  </div>
                  <span className="text-sm text-surface-500">{section.contents.length} items</span>
                </button>

                {expandedSections.has(section.id) && section.contents.length > 0 && (
                  <div className="border-t border-surface-800 p-5 space-y-4">
                    {section.contents.map((content) => (
                      <ContentCard
                        key={content.id}
                        content={content}
                        primaryColor={primaryColor}
                        onClick={() => setSelectedContent(content)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}

            {dataRoom.contents.length === 0 && dataRoom.sections.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-surface-700">
                <FileText size={40} className="text-surface-500" />
                <h3 className="mt-4 text-lg font-medium text-surface-100">No content yet</h3>
                <p className="mt-1 text-sm text-surface-400">Check back soon for updates</p>
              </div>
            )}
          </div>

          {/* Sidebar - Action Items */}
          <div>
            {dataRoom.actionItems.length > 0 && (
              <div className="rounded-xl border border-surface-800 bg-surface-900 p-6 sticky top-6">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar size={18} style={{ color: primaryColor }} />
                  <h3 className="font-medium text-surface-100">Mutual Action Plan</h3>
                </div>

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
                      <div
                        className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border ${
                          item.isCompleted
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-surface-600'
                        }`}
                      >
                        {item.isCompleted && <Check size={12} />}
                      </div>
                      <div className="flex-1">
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
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content Viewer Modal */}
      {selectedContent && (
        <ContentViewerModal
          content={selectedContent}
          primaryColor={primaryColor}
          onClose={() => setSelectedContent(null)}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-surface-800 py-8 mt-16">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <p className="text-sm text-surface-500">
            Powered by <span className="text-surface-400 font-medium">SalesSearchers</span>
          </p>
        </div>
      </footer>
    </div>
  );
}

function ContentCard({
  content,
  primaryColor,
  onClick,
}: {
  content: DataRoomContent;
  primaryColor: string;
  onClick: () => void;
}) {
  const getContentIcon = (type: string) => {
    switch (type) {
      case 'FILE':
      case 'PDF':
        return <FileText size={20} />;
      case 'LINK':
        return <LinkIcon size={20} />;
      case 'VIDEO':
        return <Video size={20} />;
      case 'IMAGE':
        return <ImageIcon size={20} />;
      default:
        return <FileText size={20} />;
    }
  };

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 rounded-xl border border-surface-700 bg-surface-800/50 p-5 text-left hover:border-surface-600 hover:bg-surface-800 transition-all group"
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-lg text-white"
        style={{ backgroundColor: primaryColor + '40' }}
      >
        <span style={{ color: primaryColor }}>{getContentIcon(content.type)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-surface-100 group-hover:text-white transition-colors">
          {content.name}
        </h4>
        {content.description && (
          <p className="text-sm text-surface-400 mt-0.5 truncate">{content.description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 text-surface-400 group-hover:text-surface-300">
        {content.type === 'VIDEO' ? (
          <Play size={18} />
        ) : content.type === 'LINK' ? (
          <ExternalLink size={18} />
        ) : (
          <Download size={18} />
        )}
      </div>
    </button>
  );
}

function ContentViewerModal({
  content,
  primaryColor,
  onClose,
}: {
  content: DataRoomContent;
  primaryColor: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-4xl rounded-2xl bg-surface-900 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-surface-800 p-5">
          <h2 className="text-lg font-semibold text-surface-100">{content.name}</h2>
          <button
            onClick={onClose}
            className="text-surface-400 hover:text-surface-100 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="p-6">
          {content.type === 'VIDEO' && content.url && (
            <div className="aspect-video rounded-lg overflow-hidden bg-black">
              <iframe
                src={content.url.replace('watch?v=', 'embed/')}
                className="w-full h-full"
                allowFullScreen
              />
            </div>
          )}

          {content.type === 'LINK' && content.url && (
            <div className="text-center py-12">
              <LinkIcon size={48} className="mx-auto text-surface-400 mb-4" />
              <p className="text-surface-300 mb-6">{content.description ?? 'External link'}</p>
              <a
                href={content.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-white font-medium hover:opacity-90 transition-opacity"
                style={{ backgroundColor: primaryColor }}
              >
                Open Link
                <ExternalLink size={16} />
              </a>
            </div>
          )}

          {content.type === 'PDF' && content.url && (
            <div className="aspect-[4/3] rounded-lg overflow-hidden bg-surface-800">
              <iframe src={content.url} className="w-full h-full" />
            </div>
          )}

          {content.type === 'IMAGE' && content.url && (
            <div className="flex items-center justify-center">
              <img
                src={content.url}
                alt={content.name}
                className="max-h-[70vh] rounded-lg"
              />
            </div>
          )}

          {content.type === 'TEXT' && content.content && (
            <div className="prose prose-invert max-w-none">
              <div className="whitespace-pre-wrap text-surface-300">{content.content}</div>
            </div>
          )}

          {content.embedCode && (
            <div dangerouslySetInnerHTML={{ __html: content.embedCode }} />
          )}
        </div>

        {(content.type === 'PDF' || content.type === 'FILE') && content.url && (
          <div className="border-t border-surface-800 p-4 flex justify-end">
            <a
              href={content.url}
              download
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              <Download size={16} />
              Download
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

