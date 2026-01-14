'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Bell, Mail, Clock, Loader2, Save, Check } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function NotificationSettingsPage() {
  const queryClient = useQueryClient();

  const { data: prefs, isLoading } = useQuery({
    queryKey: ['notifications', 'preferences'],
    queryFn: () => api.getNotificationPreferences(),
  });

  const [formData, setFormData] = useState({
    emailEnabled: true,
    emailMeetingReminders: true,
    emailTaskReminders: true,
    emailDealUpdates: true,
    emailDataRoomViews: true,
    emailWeeklyDigest: true,
    inAppEnabled: true,
    inAppMeetingUpdates: true,
    inAppTaskUpdates: true,
    inAppDealUpdates: true,
    inAppDataRoomViews: true,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
  });

  useEffect(() => {
    if (prefs) {
      setFormData({
        emailEnabled: prefs.emailEnabled,
        emailMeetingReminders: prefs.emailMeetingReminders,
        emailTaskReminders: prefs.emailTaskReminders,
        emailDealUpdates: prefs.emailDealUpdates,
        emailDataRoomViews: prefs.emailDataRoomViews,
        emailWeeklyDigest: prefs.emailWeeklyDigest,
        inAppEnabled: prefs.inAppEnabled,
        inAppMeetingUpdates: prefs.inAppMeetingUpdates,
        inAppTaskUpdates: prefs.inAppTaskUpdates,
        inAppDealUpdates: prefs.inAppDealUpdates,
        inAppDataRoomViews: prefs.inAppDataRoomViews,
        quietHoursEnabled: prefs.quietHoursEnabled,
        quietHoursStart: prefs.quietHoursStart ?? '22:00',
        quietHoursEnd: prefs.quietHoursEnd ?? '08:00',
      });
    }
  }, [prefs]);

  const updateMutation = useMutation({
    mutationFn: (data: typeof formData) => api.updateNotificationPreferences(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'preferences'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const Toggle = ({
    checked,
    onChange,
    disabled,
  }: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-indigo-600' : 'bg-gray-700'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      <form onSubmit={handleSubmit}>
        {/* Email Notifications */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Mail className="h-5 w-5 text-blue-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-white">Email Notifications</h2>
              <p className="text-sm text-gray-400">Receive updates via email</p>
            </div>
            <Toggle
              checked={formData.emailEnabled}
              onChange={(checked) => setFormData({ ...formData, emailEnabled: checked })}
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-t border-gray-800">
              <div>
                <p className="text-sm font-medium text-gray-300">Meeting Reminders</p>
                <p className="text-xs text-gray-500">Get reminders before scheduled meetings</p>
              </div>
              <Toggle
                checked={formData.emailMeetingReminders}
                onChange={(checked) => setFormData({ ...formData, emailMeetingReminders: checked })}
                disabled={!formData.emailEnabled}
              />
            </div>
            <div className="flex items-center justify-between py-3 border-t border-gray-800">
              <div>
                <p className="text-sm font-medium text-gray-300">Task Reminders</p>
                <p className="text-xs text-gray-500">Get notified when tasks are due</p>
              </div>
              <Toggle
                checked={formData.emailTaskReminders}
                onChange={(checked) => setFormData({ ...formData, emailTaskReminders: checked })}
                disabled={!formData.emailEnabled}
              />
            </div>
            <div className="flex items-center justify-between py-3 border-t border-gray-800">
              <div>
                <p className="text-sm font-medium text-gray-300">Deal Updates</p>
                <p className="text-xs text-gray-500">Notifications about deal stage changes</p>
              </div>
              <Toggle
                checked={formData.emailDealUpdates}
                onChange={(checked) => setFormData({ ...formData, emailDealUpdates: checked })}
                disabled={!formData.emailEnabled}
              />
            </div>
            <div className="flex items-center justify-between py-3 border-t border-gray-800">
              <div>
                <p className="text-sm font-medium text-gray-300">Data Room Views</p>
                <p className="text-xs text-gray-500">Know when someone views your data room</p>
              </div>
              <Toggle
                checked={formData.emailDataRoomViews}
                onChange={(checked) => setFormData({ ...formData, emailDataRoomViews: checked })}
                disabled={!formData.emailEnabled}
              />
            </div>
            <div className="flex items-center justify-between py-3 border-t border-gray-800">
              <div>
                <p className="text-sm font-medium text-gray-300">Weekly Digest</p>
                <p className="text-xs text-gray-500">Summary of your weekly sales activity</p>
              </div>
              <Toggle
                checked={formData.emailWeeklyDigest}
                onChange={(checked) => setFormData({ ...formData, emailWeeklyDigest: checked })}
                disabled={!formData.emailEnabled}
              />
            </div>
          </div>
        </div>

        {/* In-App Notifications */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Bell className="h-5 w-5 text-purple-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-white">In-App Notifications</h2>
              <p className="text-sm text-gray-400">Notifications within the app</p>
            </div>
            <Toggle
              checked={formData.inAppEnabled}
              onChange={(checked) => setFormData({ ...formData, inAppEnabled: checked })}
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-t border-gray-800">
              <div>
                <p className="text-sm font-medium text-gray-300">Meeting Updates</p>
                <p className="text-xs text-gray-500">Meeting start, end, and insights ready</p>
              </div>
              <Toggle
                checked={formData.inAppMeetingUpdates}
                onChange={(checked) => setFormData({ ...formData, inAppMeetingUpdates: checked })}
                disabled={!formData.inAppEnabled}
              />
            </div>
            <div className="flex items-center justify-between py-3 border-t border-gray-800">
              <div>
                <p className="text-sm font-medium text-gray-300">Task Updates</p>
                <p className="text-xs text-gray-500">Task assignments and due dates</p>
              </div>
              <Toggle
                checked={formData.inAppTaskUpdates}
                onChange={(checked) => setFormData({ ...formData, inAppTaskUpdates: checked })}
                disabled={!formData.inAppEnabled}
              />
            </div>
            <div className="flex items-center justify-between py-3 border-t border-gray-800">
              <div>
                <p className="text-sm font-medium text-gray-300">Deal Updates</p>
                <p className="text-xs text-gray-500">Deals won, lost, or stage changed</p>
              </div>
              <Toggle
                checked={formData.inAppDealUpdates}
                onChange={(checked) => setFormData({ ...formData, inAppDealUpdates: checked })}
                disabled={!formData.inAppEnabled}
              />
            </div>
            <div className="flex items-center justify-between py-3 border-t border-gray-800">
              <div>
                <p className="text-sm font-medium text-gray-300">Data Room Views</p>
                <p className="text-xs text-gray-500">Real-time data room visitor alerts</p>
              </div>
              <Toggle
                checked={formData.inAppDataRoomViews}
                onChange={(checked) => setFormData({ ...formData, inAppDataRoomViews: checked })}
                disabled={!formData.inAppEnabled}
              />
            </div>
          </div>
        </div>

        {/* Quiet Hours */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <Clock className="h-5 w-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-white">Quiet Hours</h2>
              <p className="text-sm text-gray-400">Pause notifications during specific hours</p>
            </div>
            <Toggle
              checked={formData.quietHoursEnabled}
              onChange={(checked) => setFormData({ ...formData, quietHoursEnabled: checked })}
            />
          </div>

          {formData.quietHoursEnabled && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-800">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Start Time</label>
                <input
                  type="time"
                  value={formData.quietHoursStart}
                  onChange={(e) => setFormData({ ...formData, quietHoursStart: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">End Time</label>
                <input
                  type="time"
                  value={formData.quietHoursEnd}
                  onChange={(e) => setFormData({ ...formData, quietHoursEnd: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : updateMutation.isSuccess ? (
              <Check className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Preferences
          </button>
        </div>
      </form>
    </div>
  );
}

