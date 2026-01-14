'use client';

import { useState, useEffect, use } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface AutomationDetail {
  id: string;
  name: string;
  description: string | null;
  triggerType: string;
  triggerConfig: Record<string, unknown> | null;
  actions: Array<{ type: string; config: Record<string, unknown>; order: number }>;
  isActive: boolean;
  runCount: number;
  lastRunAt: string | null;
  lastError: string | null;
  createdAt: string;
  createdBy: { id: string; email: string; firstName: string | null; lastName: string | null };
  runs: Array<{
    id: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    actionsExecuted: number;
    error: string | null;
    createdAt: string;
  }>;
}

interface WorkflowRun {
  id: string;
  status: string;
  triggerData: Record<string, unknown> | null;
  entityType: string | null;
  entityId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  actionsExecuted: number;
  actionResults: unknown[] | null;
  error: string | null;
  createdAt: string;
}

interface Trigger {
  type: string;
  name: string;
  category: string;
}

interface Action {
  type: string;
  name: string;
  category: string;
}

export default function AutomationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [automation, setAutomation] = useState<AutomationDetail | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'runs'>('overview');
  const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null);

  useEffect(() => {
    loadData();
  }, [resolvedParams.id]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [automationRes, runsRes, triggersRes, actionsRes] = await Promise.all([
        api.getAutomation(resolvedParams.id),
        api.getAutomationRuns(resolvedParams.id, { limit: 50 }),
        api.getAutomationTriggers(),
        api.getAutomationActions(),
      ]);
      setAutomation(automationRes);
      setRuns(runsRes || []);
      setTriggers(triggersRes || []);
      setActions(actionsRes || []);
    } catch (error) {
      console.error('Failed to load automation:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggle() {
    if (!automation) return;
    try {
      await api.toggleAutomation(automation.id);
      loadData();
    } catch (error) {
      console.error('Failed to toggle automation:', error);
    }
  }

  async function handleDelete() {
    if (!automation) return;
    if (!confirm('Are you sure you want to delete this automation?')) return;
    try {
      await api.deleteAutomation(automation.id);
      router.push('/automations');
    } catch (error) {
      console.error('Failed to delete automation:', error);
    }
  }

  async function handleTrigger() {
    if (!automation) return;
    try {
      const result = await api.triggerAutomation(automation.id);
      alert(`Automation triggered! Status: ${result.status}`);
      loadData();
    } catch (error) {
      console.error('Failed to trigger automation:', error);
      alert('Failed to trigger automation');
    }
  }

  const getTriggerName = (type: string) => triggers.find(t => t.type === type)?.name ?? type;
  const getActionName = (type: string) => actions.find(a => a.type === type)?.name ?? type;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'text-green-400 bg-green-600/20';
      case 'FAILED': return 'text-red-400 bg-red-600/20';
      case 'RUNNING': return 'text-blue-400 bg-blue-600/20';
      case 'PENDING': return 'text-yellow-400 bg-yellow-600/20';
      case 'CANCELLED': return 'text-slate-400 bg-slate-600/20';
      default: return 'text-slate-400 bg-slate-600/20';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!automation) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-4">Automation not found</h2>
          <Link href="/automations" className="text-amber-400 hover:underline">
            Back to Automations
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-400 mb-6">
          <Link href="/automations" className="hover:text-white">Automations</Link>
          <span>/</span>
          <span className="text-white">{automation.name}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{automation.name}</h1>
              <span className={`text-xs px-2 py-1 rounded ${
                automation.isActive
                  ? 'bg-green-600/20 text-green-400'
                  : 'bg-slate-700 text-slate-400'
              }`}>
                {automation.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            {automation.description && (
              <p className="text-slate-400">{automation.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {automation.triggerType === 'MANUAL' && (
              <button
                onClick={handleTrigger}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700"
              >
                Trigger Now
              </button>
            )}
            <button
              onClick={handleToggle}
              className={`px-4 py-2 rounded-lg ${
                automation.isActive
                  ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {automation.isActive ? 'Deactivate' : 'Activate'}
            </button>
            <button
              onClick={handleDelete}
              className="px-4 py-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <p className="text-slate-400 text-sm">Total Runs</p>
            <p className="text-2xl font-bold text-amber-400">{automation.runCount}</p>
          </div>
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <p className="text-slate-400 text-sm">Last Run</p>
            <p className="text-lg font-semibold">
              {automation.lastRunAt ? new Date(automation.lastRunAt).toLocaleDateString() : 'Never'}
            </p>
          </div>
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <p className="text-slate-400 text-sm">Success Rate</p>
            <p className="text-2xl font-bold text-green-400">
              {runs.length > 0
                ? Math.round((runs.filter(r => r.status === 'COMPLETED').length / runs.length) * 100)
                : 0}%
            </p>
          </div>
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <p className="text-slate-400 text-sm">Created</p>
            <p className="text-lg font-semibold">
              {new Date(automation.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 mb-6">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('runs')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'runs'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Run History ({runs.length})
          </button>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Trigger */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
              <h3 className="text-lg font-semibold mb-4">Trigger</h3>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-amber-600/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium">{getTriggerName(automation.triggerType)}</p>
                  <p className="text-sm text-slate-400">{automation.triggerType}</p>
                </div>
              </div>
              {automation.triggerConfig && Object.keys(automation.triggerConfig).length > 0 && (
                <div className="mt-4 p-3 bg-slate-800 rounded-lg">
                  <p className="text-xs text-slate-500 mb-2">Configuration</p>
                  <pre className="text-sm text-slate-300">
                    {JSON.stringify(automation.triggerConfig, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
              <h3 className="text-lg font-semibold mb-4">Actions</h3>
              <div className="space-y-4">
                {automation.actions.sort((a, b) => a.order - b.order).map((action, index) => (
                  <div key={index} className="flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-amber-400 font-semibold">
                        {index + 1}
                      </div>
                      {index < automation.actions.length - 1 && (
                        <div className="w-0.5 h-8 bg-slate-700 my-1" />
                      )}
                    </div>
                    <div className="flex-1 p-4 bg-slate-800 rounded-lg">
                      <p className="font-medium">{getActionName(action.type)}</p>
                      {Object.keys(action.config).length > 0 && (
                        <div className="mt-2 grid gap-1">
                          {Object.entries(action.config).map(([key, value]) => (
                            <div key={key} className="flex gap-2 text-sm">
                              <span className="text-slate-500">{key}:</span>
                              <span className="text-slate-300">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Last Error */}
            {automation.lastError && (
              <div className="bg-red-900/20 rounded-xl border border-red-800 p-6">
                <h3 className="text-lg font-semibold text-red-400 mb-2">Last Error</h3>
                <p className="text-red-300">{automation.lastError}</p>
              </div>
            )}
          </div>
        )}

        {/* Runs Tab */}
        {activeTab === 'runs' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Runs List */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-800">
                <h3 className="font-semibold">Run History</h3>
              </div>
              {runs.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  No runs yet
                </div>
              ) : (
                <div className="divide-y divide-slate-800 max-h-[600px] overflow-y-auto">
                  {runs.map((run) => (
                    <button
                      key={run.id}
                      onClick={() => setSelectedRun(run)}
                      className={`w-full p-4 text-left hover:bg-slate-800 transition-colors ${
                        selectedRun?.id === run.id ? 'bg-slate-800' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(run.status)}`}>
                          {run.status}
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date(run.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-slate-300">
                        {run.actionsExecuted} action(s) executed
                      </p>
                      {run.error && (
                        <p className="text-xs text-red-400 truncate mt-1">{run.error}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Run Details */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
              <h3 className="font-semibold mb-4">Run Details</h3>
              {selectedRun ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500">Status</p>
                      <span className={`text-sm px-2 py-0.5 rounded ${getStatusColor(selectedRun.status)}`}>
                        {selectedRun.status}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Actions Executed</p>
                      <p className="text-sm">{selectedRun.actionsExecuted}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Started At</p>
                      <p className="text-sm">
                        {selectedRun.startedAt ? new Date(selectedRun.startedAt).toLocaleString() : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Completed At</p>
                      <p className="text-sm">
                        {selectedRun.completedAt ? new Date(selectedRun.completedAt).toLocaleString() : '-'}
                      </p>
                    </div>
                  </div>

                  {selectedRun.entityType && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Entity</p>
                      <p className="text-sm">
                        {selectedRun.entityType}: {selectedRun.entityId}
                      </p>
                    </div>
                  )}

                  {selectedRun.error && (
                    <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg">
                      <p className="text-xs text-red-400 mb-1">Error</p>
                      <p className="text-sm text-red-300">{selectedRun.error}</p>
                    </div>
                  )}

                  {selectedRun.triggerData && Object.keys(selectedRun.triggerData).length > 0 && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Trigger Data</p>
                      <pre className="text-xs p-3 bg-slate-800 rounded-lg overflow-x-auto">
                        {JSON.stringify(selectedRun.triggerData, null, 2)}
                      </pre>
                    </div>
                  )}

                  {selectedRun.actionResults && (selectedRun.actionResults as unknown[]).length > 0 && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Action Results</p>
                      <div className="space-y-2">
                        {(selectedRun.actionResults as Array<{ order: number; type: string; success: boolean; result?: unknown; error?: string }>).map((result, i) => (
                          <div
                            key={i}
                            className={`p-3 rounded-lg ${
                              result.success ? 'bg-green-900/20 border border-green-800' : 'bg-red-900/20 border border-red-800'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium">
                                {result.order + 1}. {getActionName(result.type)}
                              </span>
                              <span className={result.success ? 'text-green-400' : 'text-red-400'}>
                                {result.success ? '✓' : '✗'}
                              </span>
                            </div>
                            {result.result !== undefined && result.result !== null && (
                              <pre className="text-xs text-slate-400 overflow-x-auto">
                                {JSON.stringify(result.result as object, null, 2)}
                              </pre>
                            )}
                            {result.error && (
                              <p className="text-xs text-red-400">{result.error}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-slate-400 py-8">
                  Select a run to view details
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

