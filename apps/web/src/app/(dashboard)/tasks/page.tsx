'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  Plus,
  CheckSquare,
  Loader2,
  X,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Calendar,
  User,
  MoreVertical,
  Trash2,
  Filter,
} from 'lucide-react';

const statusIcons: Record<string, React.ReactNode> = {
  PENDING: <Circle size={16} className="text-surface-400" />,
  IN_PROGRESS: <Clock size={16} className="text-primary-400" />,
  COMPLETED: <CheckCircle2 size={16} className="text-green-400" />,
  CANCELLED: <X size={16} className="text-surface-500" />,
};

const priorityColors: Record<string, string> = {
  LOW: 'text-surface-400',
  MEDIUM: 'text-blue-400',
  HIGH: 'text-orange-400',
  URGENT: 'text-red-400',
};

export default function TasksPage() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'overdue' | 'completed'>('pending');
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'MEDIUM', dueAt: '' });

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks', filter],
    queryFn: () =>
      api.getTasks({
        pageSize: 100,
        status: filter === 'completed' ? 'COMPLETED' : filter === 'pending' ? 'PENDING' : undefined,
        overdue: filter === 'overdue' ? true : undefined,
      }),
  });

  const { data: stats } = useQuery({
    queryKey: ['taskStats'],
    queryFn: () => api.getTaskStats(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createTask({
        title: newTask.title,
        description: newTask.description || undefined,
        priority: newTask.priority,
        dueAt: newTask.dueAt || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['taskStats'] });
      setShowAddModal(false);
      setNewTask({ title: '', description: '', priority: 'MEDIUM', dueAt: '' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.updateTask(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['taskStats'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['taskStats'] });
    },
  });

  const toggleComplete = (task: { id: string; status: string }) => {
    const newStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    updateMutation.mutate({ id: task.id, status: newStatus });
  };

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-100">Tasks</h1>
          <p className="mt-1 text-surface-400">Manage your tasks and follow-ups.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          Add Task
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="mb-6 grid gap-4 sm:grid-cols-4">
          <button
            onClick={() => setFilter('overdue')}
            className={`card p-4 text-left transition-colors ${filter === 'overdue' ? 'ring-2 ring-red-500' : ''}`}
          >
            <p className="text-sm text-surface-400">Overdue</p>
            <p className="mt-1 text-2xl font-bold text-red-400">{stats.overdue}</p>
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`card p-4 text-left transition-colors ${filter === 'pending' ? 'ring-2 ring-primary-500' : ''}`}
          >
            <p className="text-sm text-surface-400">Due Today</p>
            <p className="mt-1 text-2xl font-bold text-yellow-400">{stats.dueToday}</p>
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`card p-4 text-left transition-colors ${filter === 'all' ? 'ring-2 ring-primary-500' : ''}`}
          >
            <p className="text-sm text-surface-400">Pending</p>
            <p className="mt-1 text-2xl font-bold text-surface-100">{stats.pending}</p>
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`card p-4 text-left transition-colors ${filter === 'completed' ? 'ring-2 ring-green-500' : ''}`}
          >
            <p className="text-sm text-surface-400">Completed This Week</p>
            <p className="mt-1 text-2xl font-bold text-green-400">{stats.completedThisWeek}</p>
          </button>
        </div>
      )}

      {/* Tasks list */}
      <div className="card">
        <div className="flex items-center justify-between border-b border-surface-800 p-4">
          <h2 className="font-semibold text-surface-100">
            {filter === 'all' && 'All Tasks'}
            {filter === 'pending' && 'Pending Tasks'}
            {filter === 'overdue' && 'Overdue Tasks'}
            {filter === 'completed' && 'Completed Tasks'}
          </h2>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="animate-spin text-surface-500" size={24} />
          </div>
        ) : !tasks || tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-4 rounded-full bg-surface-800 p-4">
              <CheckSquare className="text-surface-500" size={32} />
            </div>
            <h3 className="mb-2 font-semibold text-surface-200">No tasks</h3>
            <p className="mb-6 max-w-sm text-sm text-surface-400">
              {filter === 'completed'
                ? 'No completed tasks this week.'
                : filter === 'overdue'
                ? 'No overdue tasks. Great job!'
                : 'Create a task or let meeting insights generate them for you.'}
            </p>
            {filter !== 'completed' && (
              <button
                onClick={() => setShowAddModal(true)}
                className="btn-primary flex items-center gap-2"
              >
                <Plus size={18} />
                Add Task
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-surface-800">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-start gap-4 p-4 transition-colors hover:bg-surface-800/50"
              >
                <button
                  onClick={() => toggleComplete(task)}
                  className="mt-0.5 rounded p-1 hover:bg-surface-700"
                >
                  {statusIcons[task.status]}
                </button>

                <div className="min-w-0 flex-1">
                  <p
                    className={`font-medium ${
                      task.status === 'COMPLETED'
                        ? 'text-surface-500 line-through'
                        : 'text-surface-100'
                    }`}
                  >
                    {task.title}
                  </p>
                  {task.description && (
                    <p className="mt-1 text-sm text-surface-400 line-clamp-2">
                      {task.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-surface-500">
                    <span className={priorityColors[task.priority]}>{task.priority}</span>
                    {task.dueAt && (
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {new Date(task.dueAt).toLocaleDateString()}
                      </span>
                    )}
                    {task.assignee && (
                      <span className="flex items-center gap-1">
                        <User size={12} />
                        {task.assignee.firstName || task.assignee.email}
                      </span>
                    )}
                    {task.source === 'meeting_insight' && (
                      <Link
                        href={`/meetings/${task.sourceId}`}
                        className="text-primary-400 hover:text-primary-300"
                      >
                        From meeting
                      </Link>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => deleteMutation.mutate(task.id)}
                  disabled={deleteMutation.isPending}
                  className="rounded p-2 text-surface-500 hover:bg-surface-700 hover:text-red-400"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-lg animate-slide-up">
            <div className="flex items-center justify-between border-b border-surface-800 p-4">
              <h2 className="text-lg font-semibold text-surface-100">Add Task</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-surface-400 hover:bg-surface-800 hover:text-surface-100"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
              className="p-4"
            >
              <div className="space-y-4">
                <div>
                  <label htmlFor="title" className="mb-2 block text-sm font-medium text-surface-300">
                    Title *
                  </label>
                  <input
                    id="title"
                    type="text"
                    value={newTask.title}
                    onChange={(e) => setNewTask((prev) => ({ ...prev, title: e.target.value }))}
                    className="input"
                    placeholder="Follow up with prospect"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="description" className="mb-2 block text-sm font-medium text-surface-300">
                    Description
                  </label>
                  <textarea
                    id="description"
                    value={newTask.description}
                    onChange={(e) => setNewTask((prev) => ({ ...prev, description: e.target.value }))}
                    className="input"
                    rows={3}
                    placeholder="Additional details..."
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="priority" className="mb-2 block text-sm font-medium text-surface-300">
                      Priority
                    </label>
                    <select
                      id="priority"
                      value={newTask.priority}
                      onChange={(e) => setNewTask((prev) => ({ ...prev, priority: e.target.value }))}
                      className="input"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="dueAt" className="mb-2 block text-sm font-medium text-surface-300">
                      Due Date
                    </label>
                    <input
                      id="dueAt"
                      type="datetime-local"
                      value={newTask.dueAt}
                      onChange={(e) => setNewTask((prev) => ({ ...prev, dueAt: e.target.value }))}
                      className="input"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || !newTask.title}
                  className="btn-primary"
                >
                  {createMutation.isPending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    'Create Task'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

