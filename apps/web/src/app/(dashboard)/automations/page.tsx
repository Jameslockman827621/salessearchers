'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';

interface Automation {
  id: string;
  name: string;
  description: string | null;
  triggerType: string;
  isActive: boolean;
  runCount: number;
  lastRunAt: string | null;
  lastError: string | null;
  createdAt: string;
  createdBy: { id: string; email: string; firstName: string | null; lastName: string | null };
  _count: { runs: number };
}

interface Trigger {
  type: string;
  name: string;
  category: string;
  configOptions: string[];
}

interface Action {
  type: string;
  name: string;
  category: string;
  configFields: string[];
}

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Create form state
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newTrigger, setNewTrigger] = useState('');
  const [newActions, setNewActions] = useState<Array<{ type: string; config: Record<string, unknown>; order: number }>>([]);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadData();
  }, [filter]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [automationsRes, triggersRes, actionsRes] = await Promise.all([
        api.getAutomations({
          isActive: filter === 'all' ? undefined : filter === 'active',
        }),
        api.getAutomationTriggers(),
        api.getAutomationActions(),
      ]);
      setAutomations(automationsRes || []);
      setTriggers(triggersRes || []);
      setActions(actionsRes || []);
    } catch (error) {
      console.error('Failed to load automations:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggle(id: string) {
    try {
      await api.toggleAutomation(id);
      loadData();
    } catch (error) {
      console.error('Failed to toggle automation:', error);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this automation?')) return;
    try {
      await api.deleteAutomation(id);
      loadData();
    } catch (error) {
      console.error('Failed to delete automation:', error);
    }
  }

  async function handleTriggerManual(id: string) {
    try {
      const result = await api.triggerAutomation(id);
      alert(`Automation triggered! Status: ${result.status}`);
      loadData();
    } catch (error) {
      console.error('Failed to trigger automation:', error);
      alert('Failed to trigger automation');
    }
  }

  function addAction(type: string) {
    setNewActions([...newActions, { type, config: {}, order: newActions.length }]);
  }

  function removeAction(index: number) {
    setNewActions(newActions.filter((_, i) => i !== index).map((a, i) => ({ ...a, order: i })));
  }

  function updateActionConfig(index: number, key: string, value: string) {
    const updated = [...newActions];
    updated[index] = { ...updated[index], config: { ...updated[index].config, [key]: value } };
    setNewActions(updated);
  }

  async function handleCreate() {
    if (!newName.trim() || !newTrigger || newActions.length === 0) {
      alert('Please fill in all required fields');
      return;
    }

    setIsCreating(true);
    try {
      await api.createAutomation({
        name: newName,
        description: newDescription || undefined,
        triggerType: newTrigger,
        actions: newActions,
        isActive: true,
      });
      setShowCreateModal(false);
      setNewName('');
      setNewDescription('');
      setNewTrigger('');
      setNewActions([]);
      loadData();
    } catch (error) {
      console.error('Failed to create automation:', error);
      alert('Failed to create automation');
    } finally {
      setIsCreating(false);
    }
  }

  const triggerCategories = [...new Set(triggers.map(t => t.category))];
  const actionCategories = [...new Set(actions.map(a => a.category))];

  const getTriggerName = (type: string) => triggers.find(t => t.type === type)?.name ?? type;
  const getActionName = (type: string) => actions.find(a => a.type === type)?.name ?? type;
  const getActionFields = (type: string) => actions.find(a => a.type === type)?.configFields ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
              Workflow Automations
            </h1>
            <p className="text-slate-400 mt-1">
              Automate repetitive tasks with triggers and actions
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium hover:from-amber-600 hover:to-orange-600 transition-all"
          >
            + Create Automation
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6">
          {(['all', 'active', 'inactive'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm transition-all ${
                filter === f
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Automations List */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : automations.length === 0 ? (
          <div className="text-center py-20 bg-slate-900 rounded-xl border border-slate-800">
            <svg className="w-16 h-16 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h3 className="text-xl font-semibold mb-2">No automations yet</h3>
            <p className="text-slate-400 mb-6">Create your first automation to start saving time</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-5 py-2.5 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700"
            >
              Create Automation
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {automations.map((automation) => (
              <div
                key={automation.id}
                className="bg-slate-900 rounded-xl border border-slate-800 p-6 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold">{automation.name}</h3>
                      <span className={`text-xs px-2 py-1 rounded ${
                        automation.isActive
                          ? 'bg-green-600/20 text-green-400'
                          : 'bg-slate-700 text-slate-400'
                      }`}>
                        {automation.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {automation.description && (
                      <p className="text-slate-400 text-sm mb-3">{automation.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-amber-400">
                        Trigger: {getTriggerName(automation.triggerType)}
                      </span>
                      <span className="text-slate-500">|</span>
                      <span className="text-slate-400">
                        {automation.runCount} runs
                      </span>
                      {automation.lastRunAt && (
                        <>
                          <span className="text-slate-500">|</span>
                          <span className="text-slate-400">
                            Last: {new Date(automation.lastRunAt).toLocaleDateString()}
                          </span>
                        </>
                      )}
                      {automation.lastError && (
                        <>
                          <span className="text-slate-500">|</span>
                          <span className="text-red-400 truncate max-w-[200px]">
                            Error: {automation.lastError}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {automation.triggerType === 'MANUAL' && (
                      <button
                        onClick={() => handleTriggerManual(automation.id)}
                        className="p-2 rounded-lg bg-amber-600/20 text-amber-400 hover:bg-amber-600/30"
                        title="Trigger Now"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={() => handleToggle(automation.id)}
                      className={`p-2 rounded-lg transition-colors ${
                        automation.isActive
                          ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                      }`}
                      title={automation.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {automation.isActive ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </button>
                    <Link
                      href={`/automations/${automation.id}`}
                      className="p-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600"
                      title="View Details"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </Link>
                    <button
                      onClick={() => handleDelete(automation.id)}
                      className="p-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30"
                      title="Delete"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-slate-800">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Create Automation</h2>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Basic Info */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Name *</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g., Follow up on meeting"
                      className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Description</label>
                    <textarea
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="What does this automation do?"
                      className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-amber-500 h-20 resize-none"
                    />
                  </div>
                </div>

                {/* Trigger */}
                <div>
                  <label className="block text-sm text-slate-400 mb-3">Trigger *</label>
                  <div className="space-y-3">
                    {triggerCategories.map((category) => (
                      <div key={category}>
                        <p className="text-xs text-slate-500 mb-2">{category}</p>
                        <div className="flex flex-wrap gap-2">
                          {triggers.filter(t => t.category === category).map((trigger) => (
                            <button
                              key={trigger.type}
                              onClick={() => setNewTrigger(trigger.type)}
                              className={`px-3 py-2 rounded-lg text-sm transition-all ${
                                newTrigger === trigger.type
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                              }`}
                            >
                              {trigger.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div>
                  <label className="block text-sm text-slate-400 mb-3">Actions *</label>
                  
                  {/* Selected Actions */}
                  {newActions.length > 0 && (
                    <div className="space-y-3 mb-4">
                      {newActions.map((action, index) => (
                        <div key={index} className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-medium">{index + 1}. {getActionName(action.type)}</span>
                            <button
                              onClick={() => removeAction(index)}
                              className="text-red-400 hover:text-red-300"
                            >
                              Remove
                            </button>
                          </div>
                          {getActionFields(action.type).length > 0 && (
                            <div className="grid gap-3">
                              {getActionFields(action.type).map((field) => (
                                <div key={field}>
                                  <label className="block text-xs text-slate-500 mb-1">{field}</label>
                                  <input
                                    type="text"
                                    value={(action.config[field] as string) ?? ''}
                                    onChange={(e) => updateActionConfig(index, field, e.target.value)}
                                    className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-600 text-white text-sm focus:outline-none focus:border-amber-500"
                                    placeholder={`Enter ${field}...`}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Action */}
                  <div className="space-y-3">
                    {actionCategories.map((category) => (
                      <div key={category}>
                        <p className="text-xs text-slate-500 mb-2">{category}</p>
                        <div className="flex flex-wrap gap-2">
                          {actions.filter(a => a.category === category).map((action) => (
                            <button
                              key={action.type}
                              onClick={() => addAction(action.type)}
                              className="px-3 py-2 rounded-lg text-sm bg-slate-800 text-slate-300 hover:bg-slate-700 border border-dashed border-slate-600"
                            >
                              + {action.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-800 flex justify-end gap-3">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-5 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isCreating || !newName.trim() || !newTrigger || newActions.length === 0}
                  className="px-5 py-2.5 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreating ? 'Creating...' : 'Create Automation'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

