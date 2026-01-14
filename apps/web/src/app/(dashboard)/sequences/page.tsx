'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    firstName: string | null;
    lastName: string | null;
  };
  _count: {
    steps: number;
    enrollments: number;
  };
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-neutral-600 text-neutral-200',
  ACTIVE: 'bg-emerald-600 text-white',
  PAUSED: 'bg-amber-600 text-white',
  ARCHIVED: 'bg-neutral-700 text-neutral-400',
};

export default function SequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchSequences = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter) params.set('status', filter);
      if (searchQuery) params.set('search', searchQuery);

      const data = await api.get<{ sequences: Sequence[] }>(`/api/sequences?${params.toString()}`);
      setSequences(data?.sequences ?? []);
    } catch (error) {
      console.error('Failed to fetch sequences:', error);
      setSequences([]);
    } finally {
      setLoading(false);
    }
  }, [filter, searchQuery]);

  useEffect(() => {
    fetchSequences();
  }, [fetchSequences]);

  const handleDuplicate = async (sequenceId: string) => {
    try {
      await api.post(`/api/sequences/${sequenceId}/duplicate`);
      fetchSequences();
    } catch (error) {
      console.error('Failed to duplicate sequence:', error);
    }
  };

  const handleDelete = async (sequenceId: string) => {
    if (!confirm('Are you sure you want to delete this sequence?')) return;

    try {
      await api.delete(`/api/sequences/${sequenceId}`);
      fetchSequences();
    } catch (error) {
      console.error('Failed to delete sequence:', error);
    }
  };

  const handleStatusChange = async (sequenceId: string, status: string) => {
    try {
      await api.put(`/api/sequences/${sequenceId}`, { status });
      fetchSequences();
    } catch (error) {
      console.error('Failed to update sequence:', error);
    }
  };

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
        <div>
          <h1 className="text-2xl font-bold text-white">Sequences</h1>
          <p className="text-neutral-400 mt-1">Automated email outreach campaigns</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Sequence
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-neutral-800">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search sequences..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 pl-10 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <svg className="absolute left-3 top-2.5 w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div className="flex items-center gap-1 bg-neutral-800 rounded-lg p-1">
          {['', 'ACTIVE', 'DRAFT', 'PAUSED', 'ARCHIVED'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm rounded-md capitalize transition-colors ${
                filter === f
                  ? 'bg-neutral-700 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {f || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : sequences.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-neutral-400">
            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-lg mb-2">No sequences yet</p>
            <p className="text-sm">Create your first email sequence to start automating outreach</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sequences.map((sequence) => (
              <div
                key={sequence.id}
                className="bg-neutral-800/50 rounded-xl border border-neutral-700 hover:border-neutral-600 transition-colors"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <Link
                        href={`/sequences/${sequence.id}`}
                        className="text-lg font-semibold text-white hover:text-indigo-400 transition-colors"
                      >
                        {sequence.name}
                      </Link>
                      <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${statusColors[sequence.status]}`}>
                        {sequence.status}
                      </span>
                    </div>
                    <div className="relative group">
                      <button className="p-1 text-neutral-400 hover:text-white rounded">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                      </button>
                      <div className="absolute right-0 top-8 w-40 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl hidden group-hover:block z-10">
                        <Link
                          href={`/sequences/${sequence.id}`}
                          className="block px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-700 hover:text-white"
                        >
                          Edit
                        </Link>
                        {sequence.status === 'DRAFT' && (
                          <button
                            onClick={() => handleStatusChange(sequence.id, 'ACTIVE')}
                            className="w-full text-left px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-700 hover:text-white"
                          >
                            Activate
                          </button>
                        )}
                        {sequence.status === 'ACTIVE' && (
                          <button
                            onClick={() => handleStatusChange(sequence.id, 'PAUSED')}
                            className="w-full text-left px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-700 hover:text-white"
                          >
                            Pause
                          </button>
                        )}
                        {sequence.status === 'PAUSED' && (
                          <button
                            onClick={() => handleStatusChange(sequence.id, 'ACTIVE')}
                            className="w-full text-left px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-700 hover:text-white"
                          >
                            Resume
                          </button>
                        )}
                        <button
                          onClick={() => handleDuplicate(sequence.id)}
                          className="w-full text-left px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-700 hover:text-white"
                        >
                          Duplicate
                        </button>
                        <button
                          onClick={() => handleDelete(sequence.id)}
                          className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-neutral-700 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                  {sequence.description && (
                    <p className="text-sm text-neutral-400 mb-4 line-clamp-2">{sequence.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-neutral-500">
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      {sequence._count.steps} steps
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      {sequence._count.enrollments} enrolled
                    </span>
                  </div>
                </div>
                <div className="px-5 py-3 border-t border-neutral-700 flex items-center justify-between text-xs text-neutral-500">
                  <span>
                    Updated {formatDistanceToNow(new Date(sequence.updatedAt), { addSuffix: true })}
                  </span>
                  {sequence.createdBy && (
                    <span>
                      by {sequence.createdBy.firstName} {sequence.createdBy.lastName}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <CreateSequenceModal
          onClose={() => setShowCreate(false)}
          onCreate={() => {
            setShowCreate(false);
            fetchSequences();
          }}
        />
      )}
    </div>
  );
}

function CreateSequenceModal({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;

    setCreating(true);
    try {
      const sequence = await api.post<{ id: string }>('/sequences', { name, description: description || undefined });
      // Navigate to the new sequence
      window.location.href = `/sequences/${sequence.id}`;
    } catch (error) {
      console.error('Failed to create sequence:', error);
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-neutral-900 rounded-xl w-full max-w-md border border-neutral-800 shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <h2 className="text-lg font-semibold text-white">New Sequence</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Cold Outreach Q1"
              className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this sequence for?"
              rows={3}
              className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
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
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {creating ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : null}
            Create Sequence
          </button>
        </div>
      </div>
    </div>
  );
}

