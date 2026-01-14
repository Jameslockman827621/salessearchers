'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Kanban,
  Plus,
  DollarSign,
  Building2,
  Users,
  MoreVertical,
  Trash2,
  Edit,
  X,
  Loader2,
  Calendar,
  GripVertical,
  Settings,
} from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';

interface Deal {
  id: string;
  name: string;
  value: number | null;
  currency: string;
  probability: number | null;
  expectedCloseDate: string | null;
  stage: { id: string; name: string; color: string | null; order: number };
  company: { id: string; name: string } | null;
  contacts: Array<{ id: string; email: string | null; firstName: string | null; lastName: string | null }>;
  owner: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

interface Stage {
  id: string;
  name: string;
  order: number;
  color: string | null;
  isWon: boolean;
  isLost: boolean;
  dealCount: number;
}

export default function PipelinePage() {
  const queryClient = useQueryClient();
  const [showAddDealModal, setShowAddDealModal] = useState(false);
  const [showAddStageModal, setShowAddStageModal] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null);

  const { data: stages, isLoading: stagesLoading } = useQuery({
    queryKey: ['pipeline-stages'],
    queryFn: () => api.getPipelineStages(),
  });

  const { data: deals, isLoading: dealsLoading } = useQuery({
    queryKey: ['pipeline-deals'],
    queryFn: () => api.getPipelineDeals(),
  });

  const { data: companiesData } = useQuery({
    queryKey: ['companies-list'],
    queryFn: () => api.getCompanies({ pageSize: 100 }),
  });

  const createDealMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.createDeal>[0]) => api.createDeal(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] });
      setShowAddDealModal(false);
      setSelectedStageId(null);
    },
  });

  const updateDealMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Parameters<typeof api.updateDeal>[1]) =>
      api.updateDeal(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] });
      setEditingDeal(null);
    },
  });

  const deleteDealMutation = useMutation({
    mutationFn: (id: string) => api.deleteDeal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] });
    },
  });

  const createStageMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.createPipelineStage>[0]) => api.createPipelineStage(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] });
      setShowAddStageModal(false);
    },
  });

  const handleDealSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      stageId: formData.get('stageId') as string,
      value: formData.get('value') ? Number(formData.get('value')) : undefined,
      currency: formData.get('currency') as string || 'USD',
      probability: formData.get('probability') ? Number(formData.get('probability')) : undefined,
      expectedCloseDate: formData.get('expectedCloseDate') as string || undefined,
      companyId: formData.get('companyId') as string || undefined,
      notes: formData.get('notes') as string || undefined,
    };

    if (editingDeal) {
      updateDealMutation.mutate({ id: editingDeal.id, ...data });
    } else {
      createDealMutation.mutate(data);
    }
  };

  const handleStageSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createStageMutation.mutate({
      name: formData.get('name') as string,
      color: formData.get('color') as string || undefined,
      isWon: formData.get('isWon') === 'true',
      isLost: formData.get('isLost') === 'true',
    });
  };

  const handleDragStart = (dealId: string) => {
    setDraggingDealId(dealId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (stageId: string) => {
    if (draggingDealId) {
      updateDealMutation.mutate({ id: draggingDealId, stageId });
      setDraggingDealId(null);
    }
  };

  const getDealsForStage = (stageId: string) => {
    return deals?.filter((d) => d.stage.id === stageId) ?? [];
  };

  const getTotalValue = (stageId: string) => {
    return getDealsForStage(stageId).reduce((sum, d) => sum + (d.value ?? 0), 0);
  };

  const formatCurrency = (value: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const isLoading = stagesLoading || dealsLoading;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-surface-800 px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-surface-100">Pipeline</h1>
          <p className="text-sm text-surface-500">
            {deals?.length ?? 0} deals · {formatCurrency(deals?.reduce((sum, d) => sum + (d.value ?? 0), 0) ?? 0)} total value
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddStageModal(true)}
            className="flex items-center gap-2 rounded-lg border border-surface-700 px-4 py-2 text-sm font-medium text-surface-300 transition-colors hover:bg-surface-800"
          >
            <Settings size={16} />
            Add Stage
          </button>
          <button
            onClick={() => setShowAddDealModal(true)}
            className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            <Plus size={16} />
            Add Deal
          </button>
        </div>
      </header>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-6">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
          </div>
        ) : !stages?.length ? (
          <div className="flex h-64 flex-col items-center justify-center text-surface-500">
            <Kanban size={48} className="mb-4 opacity-50" />
            <p>No pipeline stages defined</p>
            <button
              onClick={() => setShowAddStageModal(true)}
              className="mt-4 text-primary-400 hover:underline"
            >
              Create your first stage
            </button>
          </div>
        ) : (
          <div className="flex gap-4" style={{ minWidth: stages.length * 300 }}>
            {stages.map((stage) => (
              <div
                key={stage.id}
                className={clsx(
                  'flex w-72 flex-shrink-0 flex-col rounded-xl border bg-surface-900/50',
                  draggingDealId ? 'border-primary-500/50' : 'border-surface-800'
                )}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(stage.id)}
              >
                {/* Stage Header */}
                <div className="flex items-center justify-between border-b border-surface-800 p-4">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: stage.color ?? '#6b7280' }}
                    />
                    <h3 className="font-medium text-surface-100">{stage.name}</h3>
                    <span className="rounded-full bg-surface-800 px-2 py-0.5 text-xs text-surface-400">
                      {getDealsForStage(stage.id).length}
                    </span>
                  </div>
                  {stage.isWon && (
                    <span className="rounded bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                      Won
                    </span>
                  )}
                  {stage.isLost && (
                    <span className="rounded bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                      Lost
                    </span>
                  )}
                </div>

                {/* Stage Value */}
                <div className="border-b border-surface-800 px-4 py-2">
                  <p className="text-sm text-surface-500">
                    {formatCurrency(getTotalValue(stage.id))}
                  </p>
                </div>

                {/* Deals */}
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {getDealsForStage(stage.id).map((deal) => (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={() => handleDragStart(deal.id)}
                      className={clsx(
                        'group cursor-grab rounded-lg border border-surface-700 bg-surface-800 p-4 transition-all hover:border-surface-600',
                        draggingDealId === deal.id && 'opacity-50'
                      )}
                    >
                      <div className="mb-3 flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <GripVertical size={14} className="text-surface-600" />
                          <h4 className="font-medium text-surface-100">{deal.name}</h4>
                        </div>
                        <div className="relative">
                          <button
                            onClick={() => setOpenMenuId(openMenuId === deal.id ? null : deal.id)}
                            className="rounded p-1 text-surface-500 opacity-0 transition-opacity hover:bg-surface-700 group-hover:opacity-100"
                          >
                            <MoreVertical size={14} />
                          </button>
                          {openMenuId === deal.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setOpenMenuId(null)}
                              />
                              <div className="absolute right-0 top-6 z-20 w-32 rounded-lg border border-surface-700 bg-surface-800 py-1 shadow-lg">
                                <button
                                  onClick={() => {
                                    setEditingDeal(deal);
                                    setOpenMenuId(null);
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-surface-300 hover:bg-surface-700"
                                >
                                  <Edit size={14} />
                                  Edit
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('Delete this deal?')) {
                                      deleteDealMutation.mutate(deal.id);
                                    }
                                    setOpenMenuId(null);
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-surface-700"
                                >
                                  <Trash2 size={14} />
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {deal.value !== null && (
                        <div className="mb-2 flex items-center gap-1 text-lg font-semibold text-surface-100">
                          <DollarSign size={16} className="text-green-400" />
                          {formatCurrency(deal.value, deal.currency).replace(/^\$/, '')}
                        </div>
                      )}

                      <div className="space-y-1.5 text-sm">
                        {deal.company && (
                          <div className="flex items-center gap-1.5 text-surface-400">
                            <Building2 size={12} />
                            <span className="truncate">{deal.company.name}</span>
                          </div>
                        )}
                        {deal.contacts.length > 0 && (
                          <div className="flex items-center gap-1.5 text-surface-400">
                            <Users size={12} />
                            <span className="truncate">
                              {deal.contacts[0].firstName ?? deal.contacts[0].email}
                              {deal.contacts.length > 1 && ` +${deal.contacts.length - 1}`}
                            </span>
                          </div>
                        )}
                        {deal.expectedCloseDate && (
                          <div className="flex items-center gap-1.5 text-surface-400">
                            <Calendar size={12} />
                            <span>{format(new Date(deal.expectedCloseDate), 'MMM d, yyyy')}</span>
                          </div>
                        )}
                      </div>

                      {deal.probability !== null && (
                        <div className="mt-3">
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="text-surface-500">Probability</span>
                            <span className="text-surface-400">{deal.probability}%</span>
                          </div>
                          <div className="h-1 overflow-hidden rounded-full bg-surface-700">
                            <div
                              className="h-full bg-primary-500 transition-all"
                              style={{ width: `${deal.probability}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Add Deal to Stage */}
                  <button
                    onClick={() => {
                      setSelectedStageId(stage.id);
                      setShowAddDealModal(true);
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-surface-700 py-3 text-sm text-surface-500 transition-colors hover:border-surface-600 hover:text-surface-400"
                  >
                    <Plus size={16} />
                    Add Deal
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Deal Modal */}
      {(showAddDealModal || editingDeal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-surface-700 bg-surface-900 shadow-xl">
            <div className="flex items-center justify-between border-b border-surface-800 px-6 py-4">
              <h2 className="text-lg font-semibold text-surface-100">
                {editingDeal ? 'Edit Deal' : 'Add Deal'}
              </h2>
              <button
                onClick={() => {
                  setShowAddDealModal(false);
                  setEditingDeal(null);
                  setSelectedStageId(null);
                }}
                className="text-surface-500 hover:text-surface-300"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleDealSubmit} className="space-y-4 p-6">
              <div>
                <label className="mb-1 block text-sm font-medium text-surface-300">
                  Deal Name *
                </label>
                <input
                  name="name"
                  required
                  defaultValue={editingDeal?.name ?? ''}
                  className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-surface-300">
                  Stage *
                </label>
                <select
                  name="stageId"
                  required
                  defaultValue={editingDeal?.stage.id ?? selectedStageId ?? stages?.[0]?.id ?? ''}
                  className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                >
                  {stages?.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-surface-300">
                    Value
                  </label>
                  <input
                    name="value"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={editingDeal?.value ?? ''}
                    className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-surface-300">
                    Currency
                  </label>
                  <select
                    name="currency"
                    defaultValue={editingDeal?.currency ?? 'USD'}
                    className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-surface-300">
                    Probability %
                  </label>
                  <input
                    name="probability"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={editingDeal?.probability ?? ''}
                    className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-surface-300">
                    Expected Close
                  </label>
                  <input
                    name="expectedCloseDate"
                    type="date"
                    defaultValue={editingDeal?.expectedCloseDate?.split('T')[0] ?? ''}
                    className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-surface-300">
                  Company
                </label>
                <select
                  name="companyId"
                  defaultValue={editingDeal?.company?.id ?? ''}
                  className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                >
                  <option value="">No company</option>
                  {companiesData?.companies?.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-surface-300">
                  Notes
                </label>
                <textarea
                  name="notes"
                  rows={3}
                  className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddDealModal(false);
                    setEditingDeal(null);
                    setSelectedStageId(null);
                  }}
                  className="rounded-lg border border-surface-700 px-4 py-2 text-sm font-medium text-surface-300 transition-colors hover:bg-surface-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createDealMutation.isPending || updateDealMutation.isPending}
                  className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
                >
                  {(createDealMutation.isPending || updateDealMutation.isPending) && (
                    <Loader2 size={16} className="animate-spin" />
                  )}
                  {editingDeal ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Stage Modal */}
      {showAddStageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-surface-700 bg-surface-900 shadow-xl">
            <div className="flex items-center justify-between border-b border-surface-800 px-6 py-4">
              <h2 className="text-lg font-semibold text-surface-100">Add Stage</h2>
              <button
                onClick={() => setShowAddStageModal(false)}
                className="text-surface-500 hover:text-surface-300"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleStageSubmit} className="space-y-4 p-6">
              <div>
                <label className="mb-1 block text-sm font-medium text-surface-300">
                  Stage Name *
                </label>
                <input
                  name="name"
                  required
                  placeholder="e.g., Qualified, Proposal, Negotiation"
                  className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-surface-300">
                  Color
                </label>
                <input
                  name="color"
                  type="color"
                  defaultValue="#6366f1"
                  className="h-10 w-full rounded-lg border border-surface-700 bg-surface-800 p-1"
                />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-surface-300">
                  <input
                    type="radio"
                    name="stageType"
                    value="normal"
                    defaultChecked
                    className="text-primary-500 focus:ring-primary-500"
                  />
                  Normal
                </label>
                <label className="flex items-center gap-2 text-sm text-surface-300">
                  <input
                    type="radio"
                    name="stageType"
                    value="won"
                    className="text-green-500 focus:ring-green-500"
                  />
                  Won Stage
                </label>
                <label className="flex items-center gap-2 text-sm text-surface-300">
                  <input
                    type="radio"
                    name="stageType"
                    value="lost"
                    className="text-red-500 focus:ring-red-500"
                  />
                  Lost Stage
                </label>
              </div>
              <input type="hidden" name="isWon" id="isWon" />
              <input type="hidden" name="isLost" id="isLost" />
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddStageModal(false)}
                  className="rounded-lg border border-surface-700 px-4 py-2 text-sm font-medium text-surface-300 transition-colors hover:bg-surface-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createStageMutation.isPending}
                  className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
                >
                  {createStageMutation.isPending && (
                    <Loader2 size={16} className="animate-spin" />
                  )}
                  Create Stage
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
