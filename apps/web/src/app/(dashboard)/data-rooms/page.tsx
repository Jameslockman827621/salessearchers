'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { format } from 'date-fns';
import {
  FolderOpen,
  Plus,
  ExternalLink,
  Eye,
  Clock,
  Trash2,
  MoreVertical,
  Search,
  LayoutGrid,
  Layers,
  Users,
  ArrowRight,
  Copy,
  Settings,
} from 'lucide-react';
import Link from 'next/link';

type DataRoom = Awaited<ReturnType<typeof api.getDataRooms>>[0];

export default function DataRoomsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<DataRoom | null>(null);
  const [showMenu, setShowMenu] = useState<string | null>(null);

  const { data: dataRooms = [], isLoading } = useQuery({
    queryKey: ['data-rooms', statusFilter],
    queryFn: () => api.getDataRooms({ status: statusFilter || undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteDataRoom(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-rooms'] });
    },
  });

  const filteredRooms = dataRooms.filter((room) =>
    room.name.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-emerald-500/20 text-emerald-400';
      case 'DRAFT':
        return 'bg-amber-500/20 text-amber-400';
      case 'ARCHIVED':
        return 'bg-surface-500/20 text-surface-400';
      default:
        return 'bg-surface-500/20 text-surface-400';
    }
  };

  const copyShareLink = (slug: string) => {
    const url = `${window.location.origin}/room/${slug}`;
    navigator.clipboard.writeText(url);
    // Could add toast here
  };

  return (
    <div className="min-h-screen bg-surface-950">
      {/* Header */}
      <div className="border-b border-surface-800 bg-surface-900/50">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-surface-100">Data Rooms</h1>
              <p className="mt-1 text-sm text-surface-400">
                Create and share digital sales rooms with your prospects
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"
            >
              <Plus size={18} />
              Create Data Room
            </button>
          </div>

          {/* Filters */}
          <div className="mt-6 flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400"
              />
              <input
                type="text"
                placeholder="Search data rooms..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-surface-700 bg-surface-800 py-2 pl-10 pr-4 text-sm text-surface-100 placeholder:text-surface-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
            >
              <option value="">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-8">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-800">
              <FolderOpen size={32} className="text-surface-500" />
            </div>
            <h3 className="mt-4 text-lg font-medium text-surface-100">No data rooms yet</h3>
            <p className="mt-1 text-sm text-surface-400">
              Create your first data room to share content with prospects
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-6 flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"
            >
              <Plus size={18} />
              Create Data Room
            </button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredRooms.map((room) => (
              <div
                key={room.id}
                className="group relative overflow-hidden rounded-xl border border-surface-700/50 bg-surface-900 transition-all hover:border-surface-600 hover:shadow-lg"
              >
                {/* Card Header */}
                <div
                  className="h-24 transition-opacity group-hover:opacity-90"
                  style={{
                    background: room.primaryColor
                      ? `linear-gradient(135deg, ${room.primaryColor}40, ${room.primaryColor}10)`
                      : 'linear-gradient(135deg, #6366f140, #6366f110)',
                  }}
                />

                {/* Status Badge */}
                <div className="absolute right-4 top-4">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusColor(
                      room.status
                    )}`}
                  >
                    {room.status}
                  </span>
                </div>

                {/* Menu Button */}
                <div className="absolute right-4 top-14">
                  <div className="relative">
                    <button
                      onClick={() => setShowMenu(showMenu === room.id ? null : room.id)}
                      className="rounded-lg p-1.5 text-surface-400 transition-colors hover:bg-surface-700 hover:text-surface-100"
                    >
                      <MoreVertical size={16} />
                    </button>

                    {showMenu === room.id && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setShowMenu(null)}
                        />
                        <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-surface-700 bg-surface-800 py-1 shadow-xl">
                          <Link
                            href={`/data-rooms/${room.id}`}
                            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-surface-300 hover:bg-surface-700"
                          >
                            <Settings size={14} />
                            Edit Room
                          </Link>
                          <button
                            onClick={() => copyShareLink(room.slug)}
                            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-surface-300 hover:bg-surface-700"
                          >
                            <Copy size={14} />
                            Copy Link
                          </button>
                          <a
                            href={`/room/${room.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-surface-300 hover:bg-surface-700"
                          >
                            <ExternalLink size={14} />
                            View Public Page
                          </a>
                          <hr className="my-1 border-surface-700" />
                          <button
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this data room?')) {
                                deleteMutation.mutate(room.id);
                              }
                              setShowMenu(null);
                            }}
                            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-surface-700"
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-5">
                  <Link
                    href={`/data-rooms/${room.id}`}
                    className="block"
                  >
                    <h3 className="text-lg font-semibold text-surface-100 group-hover:text-primary-400 transition-colors">
                      {room.name}
                    </h3>
                    {room.description && (
                      <p className="mt-1 text-sm text-surface-400 line-clamp-2">
                        {room.description}
                      </p>
                    )}
                  </Link>

                  {/* Associated deal/contact */}
                  {(room.deal || room.contact) && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-surface-500">
                      {room.deal && (
                        <span className="flex items-center gap-1 rounded-full bg-surface-800 px-2 py-1">
                          <Layers size={12} />
                          {room.deal.name}
                        </span>
                      )}
                      {room.contact && (
                        <span className="flex items-center gap-1 rounded-full bg-surface-800 px-2 py-1">
                          <Users size={12} />
                          {room.contact.firstName ?? room.contact.email}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Stats */}
                  <div className="mt-4 flex items-center gap-4 border-t border-surface-800 pt-4">
                    <div className="flex items-center gap-1.5 text-sm text-surface-400">
                      <Eye size={14} />
                      <span>{room.totalViews} views</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-surface-400">
                      <LayoutGrid size={14} />
                      <span>{room._count.contents} items</span>
                    </div>
                    {room.lastViewedAt && (
                      <div className="flex items-center gap-1.5 text-sm text-surface-400">
                        <Clock size={14} />
                        <span>{format(new Date(room.lastViewedAt), 'MMM d')}</span>
                      </div>
                    )}
                  </div>

                  {/* Action */}
                  <Link
                    href={`/data-rooms/${room.id}`}
                    className="mt-4 flex items-center gap-2 text-sm font-medium text-primary-400 hover:text-primary-300 transition-colors"
                  >
                    Manage Room
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateDataRoomModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            queryClient.invalidateQueries({ queryKey: ['data-rooms'] });
          }}
        />
      )}
    </div>
  );
}

function CreateDataRoomModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#6366f1');
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await api.createDataRoom({
        name,
        description: description || undefined,
        welcomeMessage: welcomeMessage || undefined,
        primaryColor,
        isPasswordProtected,
        password: isPasswordProtected ? password : undefined,
      });
      onSuccess();
    } catch (error) {
      console.error('Failed to create data room:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-surface-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-800 p-6">
          <h2 className="text-lg font-semibold text-surface-100">Create Data Room</h2>
          <button
            onClick={onClose}
            className="text-surface-400 hover:text-surface-100"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Q1 2025 Proposal - Acme Corp"
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm text-surface-100 placeholder:text-surface-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description for your team"
              rows={2}
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm text-surface-100 placeholder:text-surface-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Welcome Message
            </label>
            <textarea
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              placeholder="Personalized message for the prospect"
              rows={3}
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm text-surface-100 placeholder:text-surface-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Brand Color
            </label>
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

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="password-protect"
              checked={isPasswordProtected}
              onChange={(e) => setIsPasswordProtected(e.target.checked)}
              className="h-4 w-4 rounded border-surface-600 bg-surface-800 text-primary-500 focus:ring-primary-500"
            />
            <label htmlFor="password-protect" className="text-sm text-surface-300">
              Password protect this room
            </label>
          </div>

          {isPasswordProtected && (
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm text-surface-100 placeholder:text-surface-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                required={isPasswordProtected}
              />
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
              className="rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Data Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

