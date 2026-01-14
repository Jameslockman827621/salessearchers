'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

interface Enrollment {
  id: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'REPLIED' | 'BOUNCED' | 'UNSUBSCRIBED' | 'CANCELLED';
  currentStepNumber: number;
  enrolledAt: string;
  nextScheduledAt: string | null;
  completedAt: string | null;
  contact: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
  currentStep?: {
    stepNumber: number;
    subject: string | null;
  };
  emailConnection?: {
    email: string;
  };
}

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-emerald-600 text-white',
  PAUSED: 'bg-amber-600 text-white',
  COMPLETED: 'bg-indigo-600 text-white',
  REPLIED: 'bg-blue-600 text-white',
  BOUNCED: 'bg-red-600 text-white',
  UNSUBSCRIBED: 'bg-neutral-600 text-neutral-200',
  CANCELLED: 'bg-neutral-700 text-neutral-400',
};

export default function EnrollmentsPage() {
  const params = useParams();
  const sequenceId = params.id as string;

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');

  const fetchEnrollments = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter) params.set('status', filter);

      const data = await api.get<{ enrollments: Enrollment[] }>(`/sequences/${sequenceId}/enrollments?${params.toString()}`);
      setEnrollments(data.enrollments);
    } catch (error) {
      console.error('Failed to fetch enrollments:', error);
    } finally {
      setLoading(false);
    }
  }, [sequenceId, filter]);

  useEffect(() => {
    fetchEnrollments();
  }, [fetchEnrollments]);

  const handlePause = async (enrollmentId: string) => {
    try {
      await api.put(`/sequences/${sequenceId}/enrollments/${enrollmentId}/status`, {
        status: 'PAUSED',
      });
      fetchEnrollments();
    } catch (error) {
      console.error('Failed to pause enrollment:', error);
    }
  };

  const handleResume = async (enrollmentId: string) => {
    try {
      await api.put(`/sequences/${sequenceId}/enrollments/${enrollmentId}/status`, {
        status: 'ACTIVE',
      });
      fetchEnrollments();
    } catch (error) {
      console.error('Failed to resume enrollment:', error);
    }
  };

  const handleCancel = async (enrollmentId: string) => {
    if (!confirm('Are you sure you want to cancel this enrollment?')) return;

    try {
      await api.put(`/sequences/${sequenceId}/enrollments/${enrollmentId}/status`, {
        status: 'CANCELLED',
      });
      fetchEnrollments();
    } catch (error) {
      console.error('Failed to cancel enrollment:', error);
    }
  };

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
        <div className="flex items-center gap-4">
          <Link href={`/sequences/${sequenceId}`} className="text-neutral-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Enrollments</h1>
            <p className="text-neutral-400 mt-1">{enrollments.length} contacts enrolled</p>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-neutral-800">
        <div className="flex items-center gap-1 bg-neutral-800 rounded-lg p-1">
          {['', 'ACTIVE', 'PAUSED', 'COMPLETED', 'REPLIED', 'BOUNCED'].map((f) => (
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
        ) : enrollments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-neutral-400">
            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-lg">No enrollments yet</p>
            <p className="text-sm mt-2">Enroll contacts to start the sequence</p>
          </div>
        ) : (
          <div className="bg-neutral-800/50 rounded-xl border border-neutral-700 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-700">
                  <th className="px-4 py-3 text-left text-sm font-medium text-neutral-400">Contact</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-neutral-400">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-neutral-400">Current Step</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-neutral-400">Enrolled</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-neutral-400">Next Email</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-neutral-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-700">
                {enrollments.map((enrollment) => (
                  <tr key={enrollment.id} className="hover:bg-neutral-800/50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-white font-medium">
                          {enrollment.contact.firstName} {enrollment.contact.lastName}
                        </p>
                        <p className="text-sm text-neutral-400">{enrollment.contact.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${statusColors[enrollment.status]}`}>
                        {enrollment.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-neutral-300">Step {enrollment.currentStepNumber}</span>
                      {enrollment.currentStep?.subject && (
                        <p className="text-sm text-neutral-500 truncate max-w-[200px]">
                          {enrollment.currentStep.subject}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-400">
                      {formatDistanceToNow(new Date(enrollment.enrolledAt), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-400">
                      {enrollment.nextScheduledAt ? (
                        formatDistanceToNow(new Date(enrollment.nextScheduledAt), { addSuffix: true })
                      ) : (
                        <span className="text-neutral-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {enrollment.status === 'ACTIVE' && (
                          <button
                            onClick={() => handlePause(enrollment.id)}
                            className="p-1 text-neutral-400 hover:text-amber-400 rounded"
                            title="Pause"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        )}
                        {enrollment.status === 'PAUSED' && (
                          <button
                            onClick={() => handleResume(enrollment.id)}
                            className="p-1 text-neutral-400 hover:text-emerald-400 rounded"
                            title="Resume"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        )}
                        {(enrollment.status === 'ACTIVE' || enrollment.status === 'PAUSED') && (
                          <button
                            onClick={() => handleCancel(enrollment.id)}
                            className="p-1 text-neutral-400 hover:text-red-400 rounded"
                            title="Cancel"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

