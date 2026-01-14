'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import Link from 'next/link';

interface SequenceStep {
  id: string;
  stepNumber: number;
  stepType: 'EMAIL' | 'WAIT' | 'TASK' | 'LINKEDIN_VIEW' | 'LINKEDIN_CONNECT' | 'LINKEDIN_MESSAGE' | 'MANUAL_TASK';
  delayDays: number;
  delayHours: number;
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  isEnabled: boolean;
  stats: { sent?: number; opened?: number; clicked?: number; replied?: number } | null;
}

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  settings: any;
  steps: SequenceStep[];
  stats: {
    enrolled: number;
    active: number;
    completed: number;
    replied: number;
    bounced: number;
  };
}

const stepTypeLabels: Record<string, string> = {
  EMAIL: 'Email',
  WAIT: 'Wait',
  TASK: 'Task',
  LINKEDIN_VIEW: 'LinkedIn View',
  LINKEDIN_CONNECT: 'LinkedIn Connect',
  LINKEDIN_MESSAGE: 'LinkedIn Message',
  MANUAL_TASK: 'Manual Task',
};

const stepTypeIcons: Record<string, JSX.Element> = {
  EMAIL: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  WAIT: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  TASK: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
};

export default function SequenceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sequenceId = params.id as string;

  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingStep, setEditingStep] = useState<SequenceStep | null>(null);
  const [showAddStep, setShowAddStep] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchSequence = useCallback(async () => {
    try {
      const data = await api.get<Sequence>(`/sequences/${sequenceId}`);
      setSequence(data);
    } catch (error) {
      console.error('Failed to fetch sequence:', error);
    } finally {
      setLoading(false);
    }
  }, [sequenceId]);

  useEffect(() => {
    fetchSequence();
  }, [fetchSequence]);

  const handleUpdateSequence = async (updates: Partial<Sequence>) => {
    if (!sequence) return;

    setSaving(true);
    try {
      await api.put(`/sequences/${sequenceId}`, updates);
      setSequence({ ...sequence, ...updates });
    } catch (error) {
      console.error('Failed to update sequence:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleAddStep = async (stepData: Partial<SequenceStep>) => {
    setSaving(true);
    try {
      await api.post(`/sequences/${sequenceId}/steps`, {
        stepNumber: (sequence?.steps.length || 0) + 1,
        ...stepData,
      });
      setShowAddStep(false);
      fetchSequence();
    } catch (error) {
      console.error('Failed to add step:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStep = async (stepId: string, updates: Partial<SequenceStep>) => {
    setSaving(true);
    try {
      await api.put(`/sequences/${sequenceId}/steps/${stepId}`, updates);
      setEditingStep(null);
      fetchSequence();
    } catch (error) {
      console.error('Failed to update step:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!confirm('Are you sure you want to delete this step?')) return;

    try {
      await api.delete(`/sequences/${sequenceId}/steps/${stepId}`);
      fetchSequence();
    } catch (error) {
      console.error('Failed to delete step:', error);
    }
  };

  const handleToggleStep = async (step: SequenceStep) => {
    await handleUpdateStep(step.id, { isEnabled: !step.isEnabled });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!sequence) {
    return (
      <div className="p-6">
        <p className="text-neutral-400">Sequence not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
        <div className="flex items-center gap-4">
          <Link href="/sequences" className="text-neutral-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <input
              type="text"
              value={sequence.name}
              onChange={(e) => setSequence({ ...sequence, name: e.target.value })}
              onBlur={() => handleUpdateSequence({ name: sequence.name })}
              className="text-2xl font-bold text-white bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded px-1 -ml-1"
            />
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 text-xs rounded-full ${
                sequence.status === 'ACTIVE' ? 'bg-emerald-600 text-white' :
                sequence.status === 'PAUSED' ? 'bg-amber-600 text-white' :
                'bg-neutral-600 text-neutral-200'
              }`}>
                {sequence.status}
              </span>
              <span className="text-neutral-500">•</span>
              <span className="text-sm text-neutral-400">{sequence.steps.length} steps</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {sequence.status === 'DRAFT' && (
            <button
              onClick={() => handleUpdateSequence({ status: 'ACTIVE' })}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Activate Sequence
            </button>
          )}
          {sequence.status === 'ACTIVE' && (
            <button
              onClick={() => handleUpdateSequence({ status: 'PAUSED' })}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
            >
              Pause
            </button>
          )}
          {sequence.status === 'PAUSED' && (
            <button
              onClick={() => handleUpdateSequence({ status: 'ACTIVE' })}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Resume
            </button>
          )}
          <Link
            href={`/sequences/${sequenceId}/enrollments`}
            className="px-4 py-2 bg-neutral-700 text-white rounded-lg hover:bg-neutral-600 transition-colors"
          >
            View Enrollments ({sequence.stats.enrolled})
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4 px-6 py-4 border-b border-neutral-800">
        <div className="bg-neutral-800/50 rounded-lg p-4">
          <p className="text-sm text-neutral-400">Enrolled</p>
          <p className="text-2xl font-bold text-white">{sequence.stats.enrolled}</p>
        </div>
        <div className="bg-neutral-800/50 rounded-lg p-4">
          <p className="text-sm text-neutral-400">Active</p>
          <p className="text-2xl font-bold text-emerald-400">{sequence.stats.active}</p>
        </div>
        <div className="bg-neutral-800/50 rounded-lg p-4">
          <p className="text-sm text-neutral-400">Completed</p>
          <p className="text-2xl font-bold text-indigo-400">{sequence.stats.completed}</p>
        </div>
        <div className="bg-neutral-800/50 rounded-lg p-4">
          <p className="text-sm text-neutral-400">Replied</p>
          <p className="text-2xl font-bold text-blue-400">{sequence.stats.replied}</p>
        </div>
        <div className="bg-neutral-800/50 rounded-lg p-4">
          <p className="text-sm text-neutral-400">Bounced</p>
          <p className="text-2xl font-bold text-red-400">{sequence.stats.bounced}</p>
        </div>
      </div>

      {/* Steps */}
      <div className="p-6">
        <div className="max-w-3xl mx-auto">
          {sequence.steps.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 text-neutral-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p className="text-neutral-400 mb-4">No steps yet. Add your first step to get started.</p>
              <button
                onClick={() => setShowAddStep(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Add First Step
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {sequence.steps.map((step, index) => (
                <div key={step.id}>
                  {index > 0 && (
                    <div className="flex items-center gap-2 py-2 ml-8">
                      <div className="w-0.5 h-8 bg-neutral-700"></div>
                      <div className="flex items-center gap-2 text-sm text-neutral-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Wait {step.delayDays} day{step.delayDays !== 1 ? 's' : ''} {step.delayHours > 0 ? `${step.delayHours}h` : ''}
                      </div>
                    </div>
                  )}
                  <div
                    className={`bg-neutral-800/50 rounded-xl border ${
                      step.isEnabled ? 'border-neutral-700' : 'border-neutral-800 opacity-60'
                    } hover:border-neutral-600 transition-colors`}
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg ${
                            step.stepType === 'EMAIL' ? 'bg-indigo-600/20 text-indigo-400' :
                            step.stepType === 'WAIT' ? 'bg-amber-600/20 text-amber-400' :
                            'bg-neutral-700 text-neutral-400'
                          }`}>
                            {stepTypeIcons[step.stepType] || stepTypeIcons.TASK}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-neutral-500">Step {step.stepNumber}</span>
                              <span className="text-xs text-neutral-600">•</span>
                              <span className="text-xs text-neutral-500">{stepTypeLabels[step.stepType]}</span>
                              {!step.isEnabled && (
                                <span className="px-1.5 py-0.5 text-xs bg-neutral-700 text-neutral-400 rounded">Disabled</span>
                              )}
                            </div>
                            {step.stepType === 'EMAIL' && (
                              <p className="text-white font-medium mt-1">{step.subject || '(no subject)'}</p>
                            )}
                            {step.stepType === 'EMAIL' && step.bodyText && (
                              <p className="text-sm text-neutral-400 mt-1 line-clamp-2">{step.bodyText}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {step.stats && step.stepType === 'EMAIL' && (
                            <div className="flex items-center gap-3 text-xs text-neutral-500 mr-4">
                              <span>{step.stats.sent || 0} sent</span>
                              <span>{step.stats.opened || 0} opened</span>
                              <span>{step.stats.replied || 0} replied</span>
                            </div>
                          )}
                          <button
                            onClick={() => handleToggleStep(step)}
                            className={`p-1 rounded ${step.isEnabled ? 'text-emerald-400' : 'text-neutral-500'}`}
                            title={step.isEnabled ? 'Disable step' : 'Enable step'}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              {step.isEnabled ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                              )}
                            </svg>
                          </button>
                          <button
                            onClick={() => setEditingStep(step)}
                            className="p-1 text-neutral-400 hover:text-white rounded"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteStep(step.id)}
                            className="p-1 text-neutral-400 hover:text-red-400 rounded"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add Step Button */}
              <div className="flex items-center gap-2 py-2 ml-8">
                <div className="w-0.5 h-8 bg-neutral-700"></div>
              </div>
              <button
                onClick={() => setShowAddStep(true)}
                className="w-full py-4 border-2 border-dashed border-neutral-700 rounded-xl text-neutral-400 hover:border-indigo-600 hover:text-indigo-400 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Step
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Edit Step Modal */}
      {editingStep && (
        <StepEditorModal
          step={editingStep}
          onSave={(updates) => handleUpdateStep(editingStep.id, updates)}
          onClose={() => setEditingStep(null)}
          saving={saving}
        />
      )}

      {/* Add Step Modal */}
      {showAddStep && (
        <StepEditorModal
          onSave={handleAddStep}
          onClose={() => setShowAddStep(false)}
          saving={saving}
        />
      )}
    </div>
  );
}

function StepEditorModal({
  step,
  onSave,
  onClose,
  saving,
}: {
  step?: SequenceStep;
  onSave: (data: Partial<SequenceStep>) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [stepType, setStepType] = useState<SequenceStep['stepType']>(step?.stepType || 'EMAIL');
  const [delayDays, setDelayDays] = useState(step?.delayDays || 1);
  const [delayHours, setDelayHours] = useState(step?.delayHours || 0);
  const [subject, setSubject] = useState(step?.subject || '');
  const [bodyHtml, setBodyHtml] = useState(step?.bodyHtml || '');
  const [bodyText, setBodyText] = useState(step?.bodyText || '');

  const handleSave = () => {
    onSave({
      stepType,
      delayDays,
      delayHours,
      subject: stepType === 'EMAIL' ? subject : null,
      bodyHtml: stepType === 'EMAIL' ? bodyHtml : null,
      bodyText: stepType === 'EMAIL' ? bodyText : null,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 rounded-xl w-full max-w-2xl border border-neutral-800 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 sticky top-0 bg-neutral-900">
          <h2 className="text-lg font-semibold text-white">
            {step ? 'Edit Step' : 'Add Step'}
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-6">
          {/* Step Type */}
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-2">Step Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(['EMAIL', 'WAIT', 'TASK'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setStepType(type)}
                  className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                    stepType === type
                      ? 'border-indigo-600 bg-indigo-600/20 text-indigo-400'
                      : 'border-neutral-700 text-neutral-400 hover:border-neutral-600'
                  }`}
                >
                  {stepTypeLabels[type]}
                </button>
              ))}
            </div>
          </div>

          {/* Delay */}
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-2">Wait Before This Step</label>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={delayDays}
                  onChange={(e) => setDelayDays(parseInt(e.target.value) || 0)}
                  className="w-20 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-neutral-400">days</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={delayHours}
                  onChange={(e) => setDelayHours(parseInt(e.target.value) || 0)}
                  className="w-20 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-neutral-400">hours</span>
              </div>
            </div>
          </div>

          {/* Email Fields */}
          {stepType === 'EMAIL' && (
            <>
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-2">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject line..."
                  className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Use {'{{firstName}}'}, {'{{company}}'}, etc. for personalization
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-2">Email Body</label>
                <textarea
                  value={bodyText}
                  onChange={(e) => {
                    setBodyText(e.target.value);
                    setBodyHtml(`<p>${e.target.value.replace(/\n/g, '</p><p>')}</p>`);
                  }}
                  rows={10}
                  placeholder="Write your email content..."
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Available variables: {'{{firstName}}'}, {'{{lastName}}'}, {'{{email}}'}, {'{{company}}'}
                </p>
              </div>
            </>
          )}

          {/* Task Fields */}
          {stepType === 'TASK' && (
            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-2">Task Description</label>
              <textarea
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                rows={3}
                placeholder="Describe the task..."
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-neutral-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (stepType === 'EMAIL' && !subject.trim())}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : null}
            {step ? 'Save Changes' : 'Add Step'}
          </button>
        </div>
      </div>
    </div>
  );
}

