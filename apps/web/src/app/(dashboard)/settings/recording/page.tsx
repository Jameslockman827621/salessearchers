'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Shield, Info, Loader2, CheckCircle2 } from 'lucide-react';
import { useState, useEffect } from 'react';

const RULE_TYPES = [
  {
    value: 'ALWAYS',
    label: 'Always Record',
    description: 'Record all meetings with video conferencing links.',
  },
  {
    value: 'EXTERNAL_ONLY',
    label: 'External Meetings Only',
    description: 'Only record meetings with attendees outside your organization.',
  },
  {
    value: 'MANUAL_ONLY',
    label: 'Manual Only',
    description: 'Never auto-record. You can manually enable recording for specific meetings.',
  },
  {
    value: 'KEYWORD_INCLUDE',
    label: 'Include Keywords',
    description: 'Only record meetings with specific keywords in the title.',
  },
  {
    value: 'KEYWORD_EXCLUDE',
    label: 'Exclude Keywords',
    description: 'Record all meetings except those with specific keywords in the title.',
  },
];

export default function RecordingSettingsPage() {
  const queryClient = useQueryClient();
  const [notification, setNotification] = useState<string | null>(null);
  const [selectedRuleType, setSelectedRuleType] = useState<string>('EXTERNAL_ONLY');
  const [keywords, setKeywords] = useState<string>('');
  const [useOrgDefault, setUseOrgDefault] = useState(true);

  const { data: policy, isLoading } = useQuery({
    queryKey: ['recordingPolicy'],
    queryFn: () => api.getRecordingPolicy(),
  });

  // Sync form state with fetched data
  useEffect(() => {
    if (policy) {
      if (policy.userOverride) {
        setUseOrgDefault(false);
        setSelectedRuleType(policy.userOverride.ruleType);
        setKeywords(policy.userOverride.keywords.join(', '));
      } else if (policy.effective) {
        setUseOrgDefault(true);
        setSelectedRuleType(policy.effective.ruleType);
        setKeywords(policy.effective.keywords.join(', '));
      }
    }
  }, [policy]);

  const updateOrgPolicyMutation = useMutation({
    mutationFn: (data: { ruleType: string; keywords?: string[] }) =>
      api.updateRecordingPolicy('org', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recordingPolicy'] });
      setNotification('Organization policy updated');
      setTimeout(() => setNotification(null), 3000);
    },
  });

  const updateUserPolicyMutation = useMutation({
    mutationFn: (data: { ruleType: string; keywords?: string[] }) =>
      api.updateRecordingPolicy('user', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recordingPolicy'] });
      setNotification('Your recording preferences updated');
      setTimeout(() => setNotification(null), 3000);
    },
  });

  const deleteUserPolicyMutation = useMutation({
    mutationFn: () => api.deleteUserRecordingPolicy(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recordingPolicy'] });
      setUseOrgDefault(true);
      setNotification('Using organization default');
      setTimeout(() => setNotification(null), 3000);
    },
  });

  const handleSave = () => {
    const keywordsArray = keywords
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    if (useOrgDefault) {
      updateOrgPolicyMutation.mutate({
        ruleType: selectedRuleType,
        keywords: keywordsArray,
      });
    } else {
      updateUserPolicyMutation.mutate({
        ruleType: selectedRuleType,
        keywords: keywordsArray,
      });
    }
  };

  const handleUseOrgDefault = () => {
    if (!useOrgDefault && policy?.userOverride) {
      deleteUserPolicyMutation.mutate();
    }
    setUseOrgDefault(true);
    if (policy?.orgDefault) {
      setSelectedRuleType(policy.orgDefault.ruleType);
      setKeywords(policy.orgDefault.keywords.join(', '));
    }
  };

  const showKeywords = ['KEYWORD_INCLUDE', 'KEYWORD_EXCLUDE'].includes(selectedRuleType);

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-surface-100">Recording Settings</h1>
        <p className="mt-1 text-surface-400">
          Configure when meetings should be automatically recorded.
        </p>
      </div>

      {/* Notification */}
      {notification && (
        <div className="mb-6 flex items-center gap-3 rounded-lg bg-green-500/10 p-4 text-green-400">
          <CheckCircle2 size={20} />
          <span>{notification}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-surface-500" size={24} />
        </div>
      ) : (
        <>
          {/* Scope selector */}
          <div className="card mb-6">
            <div className="border-b border-surface-800 p-4">
              <h2 className="font-semibold text-surface-100">Policy Scope</h2>
            </div>
            <div className="p-4">
              <div className="flex gap-4">
                <button
                  onClick={handleUseOrgDefault}
                  className={`flex-1 rounded-lg border p-4 text-left transition-colors ${
                    useOrgDefault
                      ? 'border-primary-500 bg-primary-500/10'
                      : 'border-surface-700 hover:border-surface-600'
                  }`}
                >
                  <p className="font-medium text-surface-100">Organization Default</p>
                  <p className="mt-1 text-sm text-surface-400">
                    Use the policy set by your organization admin.
                  </p>
                </button>
                <button
                  onClick={() => setUseOrgDefault(false)}
                  className={`flex-1 rounded-lg border p-4 text-left transition-colors ${
                    !useOrgDefault
                      ? 'border-primary-500 bg-primary-500/10'
                      : 'border-surface-700 hover:border-surface-600'
                  }`}
                >
                  <p className="font-medium text-surface-100">Personal Override</p>
                  <p className="mt-1 text-sm text-surface-400">
                    Set your own recording preferences.
                  </p>
                </button>
              </div>
            </div>
          </div>

          {/* Recording rule */}
          <div className="card">
            <div className="border-b border-surface-800 p-4">
              <h2 className="font-semibold text-surface-100">Recording Rule</h2>
            </div>
            <div className="p-4">
              <div className="space-y-3">
                {RULE_TYPES.map((rule) => (
                  <button
                    key={rule.value}
                    onClick={() => setSelectedRuleType(rule.value)}
                    className={`w-full rounded-lg border p-4 text-left transition-colors ${
                      selectedRuleType === rule.value
                        ? 'border-primary-500 bg-primary-500/10'
                        : 'border-surface-700 hover:border-surface-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-4 w-4 rounded-full border-2 ${
                          selectedRuleType === rule.value
                            ? 'border-primary-500 bg-primary-500'
                            : 'border-surface-500'
                        }`}
                      />
                      <div>
                        <p className="font-medium text-surface-100">{rule.label}</p>
                        <p className="text-sm text-surface-400">{rule.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Keywords input */}
              {showKeywords && (
                <div className="mt-6">
                  <label className="mb-2 block text-sm font-medium text-surface-300">
                    Keywords (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    className="input"
                    placeholder="e.g., discovery, demo, sales call"
                  />
                  <p className="mt-2 flex items-center gap-2 text-sm text-surface-500">
                    <Info size={14} />
                    Keywords are matched against meeting titles (case-insensitive).
                  </p>
                </div>
              )}

              {/* Save button */}
              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={updateOrgPolicyMutation.isPending || updateUserPolicyMutation.isPending}
                  className="btn-primary"
                >
                  {updateOrgPolicyMutation.isPending || updateUserPolicyMutation.isPending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Info box */}
          <div className="mt-6 flex items-start gap-3 rounded-lg bg-surface-800/50 p-4">
            <Shield className="mt-0.5 text-primary-400" size={20} />
            <div>
              <p className="font-medium text-surface-200">Recording Consent</p>
              <p className="mt-1 text-sm text-surface-400">
                When a meeting is recorded, the bot will announce its presence to all participants.
                Make sure you comply with local laws regarding recording consent.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

