'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Users,
  Mail,
  UserPlus,
  Shield,
  Trash2,
  Loader2,
  Copy,
  Check,
  X,
  Clock,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type Role = 'ADMIN' | 'MANAGER' | 'MEMBER';

const roleLabels: Record<string, { label: string; color: string }> = {
  OWNER: { label: 'Owner', color: 'text-amber-400 bg-amber-400/20' },
  ADMIN: { label: 'Admin', color: 'text-purple-400 bg-purple-400/20' },
  MANAGER: { label: 'Manager', color: 'text-blue-400 bg-blue-400/20' },
  MEMBER: { label: 'Member', color: 'text-gray-400 bg-gray-400/20' },
};

export default function TeamSettingsPage() {
  const queryClient = useQueryClient();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('MEMBER');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ['team', 'members'],
    queryFn: () => api.getTeamMembers(),
  });

  const { data: invitations, isLoading: invitationsLoading } = useQuery({
    queryKey: ['team', 'invitations'],
    queryFn: () => api.getPendingInvitations(),
  });

  const inviteMutation = useMutation({
    mutationFn: (data: { email: string; role: Role }) =>
      api.inviteTeamMember(data.email, data.role),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['team', 'invitations'] });
      setShowInviteModal(false);
      setInviteEmail('');
      setInviteRole('MEMBER');
      // Copy invite URL to clipboard
      navigator.clipboard.writeText(data.inviteUrl);
      setCopiedUrl(data.inviteUrl);
      setTimeout(() => setCopiedUrl(null), 3000);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.revokeInvitation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', 'invitations'] });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: (data: { userId: string; role: Role }) =>
      api.updateMemberRole(data.userId, data.role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', 'members'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => api.removeMember(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', 'members'] });
    },
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
  };

  return (
    <div className="max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/20 rounded-lg">
            <Users className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Team Members</h2>
            <p className="text-sm text-gray-400">Manage your team and permissions</p>
          </div>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
        >
          <UserPlus className="h-4 w-4" />
          Invite Member
        </button>
      </div>

      {/* Team Members */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {membersLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-3">
                  Member
                </th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-3">
                  Role
                </th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-3">
                  Joined
                </th>
                <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-3">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {members?.map((member) => (
                <tr key={member.userId} className="hover:bg-gray-800/50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gray-700 flex items-center justify-center">
                        {member.user.avatarUrl ? (
                          <img
                            src={member.user.avatarUrl}
                            alt=""
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <span className="text-sm font-medium text-gray-300">
                            {member.user.firstName?.[0] ?? member.user.email[0].toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">
                          {member.user.firstName
                            ? `${member.user.firstName} ${member.user.lastName ?? ''}`.trim()
                            : member.user.email}
                        </p>
                        <p className="text-xs text-gray-500">{member.user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                        roleLabels[member.role]?.color ?? roleLabels.MEMBER.color
                      }`}
                    >
                      {roleLabels[member.role]?.label ?? member.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-400">
                      {formatDistanceToNow(new Date(member.joinedAt), { addSuffix: true })}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {member.role !== 'OWNER' && (
                      <div className="flex items-center justify-end gap-2">
                        <select
                          value={member.role}
                          onChange={(e) =>
                            updateRoleMutation.mutate({
                              userId: member.userId,
                              role: e.target.value as Role,
                            })
                          }
                          className="px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300"
                        >
                          <option value="ADMIN">Admin</option>
                          <option value="MANAGER">Manager</option>
                          <option value="MEMBER">Member</option>
                        </select>
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to remove this member?')) {
                              removeMutation.mutate(member.userId);
                            }
                          }}
                          className="p-1 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pending Invitations */}
      {(invitations?.length ?? 0) > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-400" />
            Pending Invitations
          </h3>
          <div className="space-y-3">
            {invitations?.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <Mail className="h-4 w-4 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{invite.email}</p>
                    <p className="text-xs text-gray-500">
                      Invited by {invite.invitedBy.firstName ?? invite.invitedBy.email} ·{' '}
                      {formatDistanceToNow(new Date(invite.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                      roleLabels[invite.role]?.color ?? roleLabels.MEMBER.color
                    }`}
                  >
                    {roleLabels[invite.role]?.label ?? invite.role}
                  </span>
                  <button
                    onClick={() => revokeMutation.mutate(invite.id)}
                    className="p-1 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded"
                    title="Revoke invitation"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={() => setShowInviteModal(false)}
          />
          <div className="fixed inset-x-4 top-[20%] mx-auto max-w-md bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Invite Team Member</h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="p-1 text-gray-400 hover:text-white rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Role)}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="MEMBER">Member - View and edit data</option>
                  <option value="MANAGER">Manager - Manage team members</option>
                  <option value="ADMIN">Admin - Full access</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
                >
                  {inviteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  Send Invitation
                </button>
              </div>
            </form>

            {inviteMutation.isError && (
              <p className="mt-4 text-sm text-red-400">
                Failed to send invitation. Please try again.
              </p>
            )}
          </div>
        </>
      )}

      {/* Copied Notification */}
      {copiedUrl && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg shadow-lg z-50">
          <Check className="h-4 w-4" />
          Invite link copied to clipboard!
        </div>
      )}
    </div>
  );
}

