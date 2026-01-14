'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';

interface LeadScore {
  id: string;
  contactId: string;
  totalScore: number;
  engagementScore: number;
  behaviorScore: number;
  fitScore: number;
  grade: string | null;
  lastActivity: string | null;
  contact: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    title: string | null;
    company: { id: string; name: string } | null;
  };
}

interface ScoringRule {
  id: string;
  name: string;
  description: string | null;
  eventType: string;
  scoreChange: number;
  isActive: boolean;
  priority: number;
  createdAt: string;
}

interface Distribution {
  grade: string;
  min: number;
  color: string;
  label: string;
  count: number;
}

export default function LeadScoringPage() {
  const [scores, setScores] = useState<LeadScore[]>([]);
  const [rules, setRules] = useState<ScoringRule[]>([]);
  const [distribution, setDistribution] = useState<Distribution[]>([]);
  const [totalScored, setTotalScored] = useState(0);
  const [totalContacts, setTotalContacts] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'rules'>('leaderboard');
  const [filterGrade, setFilterGrade] = useState<string>('');
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [selectedRule, setSelectedRule] = useState<ScoringRule | null>(null);

  // Rule form state
  const [ruleName, setRuleName] = useState('');
  const [ruleDescription, setRuleDescription] = useState('');
  const [ruleEventType, setRuleEventType] = useState('EMAIL_OPENED');
  const [ruleScoreChange, setRuleScoreChange] = useState(5);
  const [ruleIsActive, setRuleIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [eventTypes, setEventTypes] = useState<Array<{ type: string; category: string; description: string; defaultScore: number }>>([]);

  useEffect(() => {
    loadData();
  }, [filterGrade]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [scoresRes, rulesRes, distRes, eventTypesRes] = await Promise.all([
        api.getLeadScores({ grade: filterGrade || undefined, limit: 50 }),
        api.getLeadScoringRules(),
        api.getLeadScoreDistribution(),
        api.getLeadScoreEventTypes(),
      ]);
      // API returns data directly (already extracted in ApiClient)
      setScores(Array.isArray(scoresRes) ? scoresRes : []);
      setRules(Array.isArray(rulesRes) ? rulesRes : []);
      setDistribution(distRes?.distribution || []);
      setTotalScored(distRes?.totalScored || 0);
      setTotalContacts(distRes?.totalContacts || 0);
      setEventTypes(Array.isArray(eventTypesRes) ? eventTypesRes : []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  function resetRuleForm() {
    setRuleName('');
    setRuleDescription('');
    setRuleEventType('EMAIL_OPENED');
    setRuleScoreChange(5);
    setRuleIsActive(true);
    setSelectedRule(null);
  }

  function openEditRule(rule: ScoringRule) {
    setRuleName(rule.name);
    setRuleDescription(rule.description || '');
    setRuleEventType(rule.eventType);
    setRuleScoreChange(rule.scoreChange);
    setRuleIsActive(rule.isActive);
    setSelectedRule(rule);
    setShowRuleModal(true);
  }

  async function handleSaveRule() {
    if (!ruleName.trim()) {
      alert('Please enter a name');
      return;
    }

    setIsSaving(true);
    try {
      if (selectedRule) {
        await api.updateLeadScoringRule(selectedRule.id, {
          name: ruleName,
          description: ruleDescription || undefined,
          eventType: ruleEventType,
          scoreChange: ruleScoreChange,
          isActive: ruleIsActive,
        });
      } else {
        await api.createLeadScoringRule({
          name: ruleName,
          description: ruleDescription || undefined,
          eventType: ruleEventType,
          scoreChange: ruleScoreChange,
          isActive: ruleIsActive,
        });
      }
      setShowRuleModal(false);
      resetRuleForm();
      loadData();
    } catch (error) {
      console.error('Failed to save rule:', error);
      alert('Failed to save rule');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteRule(id: string) {
    if (!confirm('Delete this scoring rule?')) return;
    try {
      await api.deleteLeadScoringRule(id);
      loadData();
    } catch (error) {
      console.error('Failed to delete rule:', error);
    }
  }

  function getGradeColor(grade: string | null) {
    switch (grade) {
      case 'A': return 'bg-green-500';
      case 'B': return 'bg-lime-500';
      case 'C': return 'bg-yellow-500';
      case 'D': return 'bg-orange-500';
      case 'F': return 'bg-red-500';
      default: return 'bg-slate-500';
    }
  }

  function getGradeTextColor(grade: string | null) {
    switch (grade) {
      case 'A': return 'text-green-400';
      case 'B': return 'text-lime-400';
      case 'C': return 'text-yellow-400';
      case 'D': return 'text-orange-400';
      case 'F': return 'text-red-400';
      default: return 'text-slate-400';
    }
  }

  const eventCategories = [...new Set(eventTypes.map(e => e.category))];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Lead Scoring
            </h1>
            <p className="text-slate-400 mt-1">
              AI-powered lead prioritization
            </p>
          </div>
        </div>

        {/* Distribution Overview */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          {distribution.map((d) => (
            <div
              key={d.grade}
              onClick={() => setFilterGrade(filterGrade === d.grade ? '' : d.grade)}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                filterGrade === d.grade
                  ? 'border-cyan-500 bg-cyan-500/10'
                  : 'border-slate-800 bg-slate-900 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-2xl font-bold ${getGradeTextColor(d.grade)}`}>
                  {d.grade}
                </span>
                <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: d.color + '20', color: d.color }}>
                  {d.label}
                </span>
              </div>
              <p className="text-3xl font-bold">{d.count}</p>
              <p className="text-xs text-slate-500">
                {d.min}+ points
              </p>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <p className="text-slate-400 text-sm">Total Contacts</p>
            <p className="text-2xl font-bold">{totalContacts}</p>
          </div>
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <p className="text-slate-400 text-sm">Scored Contacts</p>
            <p className="text-2xl font-bold text-cyan-400">{totalScored}</p>
          </div>
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <p className="text-slate-400 text-sm">Unscored</p>
            <p className="text-2xl font-bold text-slate-500">{totalContacts - totalScored}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 mb-6">
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'leaderboard'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Leaderboard
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'rules'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Scoring Rules ({rules.length})
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activeTab === 'leaderboard' ? (
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 text-left">
                  <th className="p-4 text-sm font-medium text-slate-400">Rank</th>
                  <th className="p-4 text-sm font-medium text-slate-400">Contact</th>
                  <th className="p-4 text-sm font-medium text-slate-400">Company</th>
                  <th className="p-4 text-sm font-medium text-slate-400 text-center">Grade</th>
                  <th className="p-4 text-sm font-medium text-slate-400 text-right">Score</th>
                  <th className="p-4 text-sm font-medium text-slate-400 text-right">Engagement</th>
                  <th className="p-4 text-sm font-medium text-slate-400 text-right">Behavior</th>
                  <th className="p-4 text-sm font-medium text-slate-400 text-right">Fit</th>
                  <th className="p-4 text-sm font-medium text-slate-400">Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((score, index) => (
                  <tr key={score.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                    <td className="p-4">
                      <span className={`font-mono text-sm ${
                        index === 0 ? 'text-yellow-400' :
                        index === 1 ? 'text-slate-300' :
                        index === 2 ? 'text-orange-400' :
                        'text-slate-500'
                      }`}>
                        #{index + 1}
                      </span>
                    </td>
                    <td className="p-4">
                      <Link href={`/contacts/${score.contact.id}`} className="hover:text-cyan-400">
                        <p className="font-medium">
                          {score.contact.firstName} {score.contact.lastName}
                        </p>
                        <p className="text-sm text-slate-500">{score.contact.email}</p>
                      </Link>
                    </td>
                    <td className="p-4 text-slate-300">
                      {score.contact.company?.name || '-'}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-white font-bold ${getGradeColor(score.grade)}`}>
                        {score.grade}
                      </span>
                    </td>
                    <td className="p-4 text-right font-mono font-bold text-lg">
                      {score.totalScore}
                    </td>
                    <td className="p-4 text-right font-mono text-slate-400">
                      {score.engagementScore}
                    </td>
                    <td className="p-4 text-right font-mono text-slate-400">
                      {score.behaviorScore}
                    </td>
                    <td className="p-4 text-right font-mono text-slate-400">
                      {score.fitScore}
                    </td>
                    <td className="p-4 text-sm text-slate-500">
                      {score.lastActivity
                        ? new Date(score.lastActivity).toLocaleDateString()
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {scores.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                No scored contacts yet
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => { resetRuleForm(); setShowRuleModal(true); }}
                className="px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700"
              >
                + Add Rule
              </button>
            </div>
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800 text-left">
                    <th className="p-4 text-sm font-medium text-slate-400">Rule Name</th>
                    <th className="p-4 text-sm font-medium text-slate-400">Event Type</th>
                    <th className="p-4 text-sm font-medium text-slate-400 text-center">Score Change</th>
                    <th className="p-4 text-sm font-medium text-slate-400 text-center">Status</th>
                    <th className="p-4 text-sm font-medium text-slate-400 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                      <td className="p-4">
                        <p className="font-medium">{rule.name}</p>
                        {rule.description && (
                          <p className="text-sm text-slate-500">{rule.description}</p>
                        )}
                      </td>
                      <td className="p-4">
                        <span className="text-sm px-2 py-1 rounded bg-slate-700 text-slate-300">
                          {rule.eventType.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`font-mono font-bold ${
                          rule.scoreChange > 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {rule.scoreChange > 0 ? '+' : ''}{rule.scoreChange}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`text-xs px-2 py-1 rounded ${
                          rule.isActive
                            ? 'bg-green-600/20 text-green-400'
                            : 'bg-slate-700 text-slate-400'
                        }`}>
                          {rule.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => openEditRule(rule)}
                          className="text-cyan-400 hover:text-cyan-300 mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rules.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  No scoring rules configured. Add rules to start scoring leads.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rule Modal */}
        {showRuleModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-lg">
              <div className="p-6 border-b border-slate-800">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">
                    {selectedRule ? 'Edit Rule' : 'Create Scoring Rule'}
                  </h2>
                  <button
                    onClick={() => { setShowRuleModal(false); resetRuleForm(); }}
                    className="text-slate-400 hover:text-white"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Rule Name *</label>
                  <input
                    type="text"
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    placeholder="e.g., Email Open Bonus"
                    className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">Description</label>
                  <input
                    type="text"
                    value={ruleDescription}
                    onChange={(e) => setRuleDescription(e.target.value)}
                    placeholder="Optional description..."
                    className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">Event Type *</label>
                  <select
                    value={ruleEventType}
                    onChange={(e) => {
                      setRuleEventType(e.target.value);
                      const eventType = eventTypes.find(et => et.type === e.target.value);
                      if (eventType) setRuleScoreChange(eventType.defaultScore);
                    }}
                    className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
                  >
                    {eventCategories.map(cat => (
                      <optgroup key={cat} label={cat}>
                        {eventTypes.filter(et => et.category === cat).map(et => (
                          <option key={et.type} value={et.type}>
                            {et.type.replace(/_/g, ' ')} ({et.defaultScore > 0 ? '+' : ''}{et.defaultScore})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">Score Change *</label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={ruleScoreChange}
                      onChange={(e) => setRuleScoreChange(parseInt(e.target.value))}
                      className="flex-1"
                    />
                    <span className={`font-mono font-bold text-xl w-16 text-right ${
                      ruleScoreChange > 0 ? 'text-green-400' : ruleScoreChange < 0 ? 'text-red-400' : 'text-slate-400'
                    }`}>
                      {ruleScoreChange > 0 ? '+' : ''}{ruleScoreChange}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ruleIsActive}
                      onChange={(e) => setRuleIsActive(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                    />
                    <span className="text-sm text-slate-300">Active</span>
                  </label>
                </div>
              </div>

              <div className="p-6 border-t border-slate-800 flex justify-end gap-3">
                <button
                  onClick={() => { setShowRuleModal(false); resetRuleForm(); }}
                  className="px-5 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRule}
                  disabled={isSaving || !ruleName.trim()}
                  className="px-5 py-2.5 rounded-lg bg-cyan-600 text-white font-medium hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Saving...' : selectedRule ? 'Update Rule' : 'Create Rule'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

