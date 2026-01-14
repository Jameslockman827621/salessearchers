'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Target,
  Calendar,
  Users,
  Mail,
  CheckSquare,
  DollarSign,
  Trophy,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

type Period = '7d' | '30d' | '90d' | '12m';

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('30d');

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['analytics', 'overview', period],
    queryFn: () => api.getAnalyticsOverview({ period }),
  });

  const { data: forecast, isLoading: forecastLoading } = useQuery({
    queryKey: ['analytics', 'forecast'],
    queryFn: () => api.getAnalyticsForecast(),
  });

  const { data: trends, isLoading: trendsLoading } = useQuery({
    queryKey: ['analytics', 'trends', period],
    queryFn: () => api.getAnalyticsTrends(period === '12m' ? '90d' : period),
  });

  const { data: leaderboard } = useQuery({
    queryKey: ['analytics', 'leaderboard'],
    queryFn: () => api.getLeaderboard({ metric: 'revenue', period: 'month' }),
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Analytics</h1>
          <p className="text-gray-400 mt-1">Sales performance and insights</p>
        </div>

        {/* Period Selector */}
        <div className="flex items-center gap-2 bg-gray-800/50 rounded-lg p-1">
          {(['7d', '30d', '90d', '12m'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                period === p
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : p === '90d' ? '90 Days' : '12 Months'}
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-emerald-900/50 to-emerald-800/30 border border-emerald-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div className="p-3 bg-emerald-500/20 rounded-lg">
              <DollarSign className="h-6 w-6 text-emerald-400" />
            </div>
            <span className="flex items-center text-emerald-400 text-sm font-medium">
              <ArrowUpRight className="h-4 w-4 mr-1" />
              +{overview?.winRate ?? 0}%
            </span>
          </div>
          <h3 className="text-2xl font-bold text-white mt-4">
            {formatCurrency(overview?.wonDeals.value ?? 0)}
          </h3>
          <p className="text-gray-400 text-sm">Revenue Won</p>
          <p className="text-emerald-400 text-xs mt-1">
            {overview?.wonDeals.count ?? 0} deals closed
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 border border-blue-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div className="p-3 bg-blue-500/20 rounded-lg">
              <Target className="h-6 w-6 text-blue-400" />
            </div>
            <span className="flex items-center text-blue-400 text-sm font-medium">
              {overview?.pipeline.dealCount ?? 0} deals
            </span>
          </div>
          <h3 className="text-2xl font-bold text-white mt-4">
            {formatCurrency(overview?.pipeline.totalValue ?? 0)}
          </h3>
          <p className="text-gray-400 text-sm">Pipeline Value</p>
          <p className="text-blue-400 text-xs mt-1">
            Active opportunities
          </p>
        </div>

        <div className="bg-gradient-to-br from-purple-900/50 to-purple-800/30 border border-purple-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div className="p-3 bg-purple-500/20 rounded-lg">
              <TrendingUp className="h-6 w-6 text-purple-400" />
            </div>
            <span className="flex items-center text-purple-400 text-sm font-medium">
              Win Rate
            </span>
          </div>
          <h3 className="text-2xl font-bold text-white mt-4">
            {overview?.winRate ?? 0}%
          </h3>
          <p className="text-gray-400 text-sm">Close Rate</p>
          <p className="text-purple-400 text-xs mt-1">
            {overview?.wonDeals.count ?? 0} / {(overview?.wonDeals.count ?? 0) + (overview?.lostDeals.count ?? 0)} deals
          </p>
        </div>

        <div className="bg-gradient-to-br from-amber-900/50 to-amber-800/30 border border-amber-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div className="p-3 bg-amber-500/20 rounded-lg">
              <Activity className="h-6 w-6 text-amber-400" />
            </div>
            <span className="flex items-center text-amber-400 text-sm font-medium">
              {overview?.tasks.completionRate ?? 0}% done
            </span>
          </div>
          <h3 className="text-2xl font-bold text-white mt-4">
            {formatNumber(overview?.tasks.completed ?? 0)}
          </h3>
          <p className="text-gray-400 text-sm">Tasks Completed</p>
          <p className="text-amber-400 text-xs mt-1">
            of {overview?.tasks.total ?? 0} total
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline by Stage */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">Pipeline by Stage</h2>
            <BarChart3 className="h-5 w-5 text-gray-400" />
          </div>
          <div className="space-y-4">
            {overview?.pipeline.byStage.map((stage) => {
              const maxValue = Math.max(...(overview?.pipeline.byStage.map((s) => s.totalValue) ?? [1]));
              const percentage = maxValue > 0 ? (stage.totalValue / maxValue) * 100 : 0;
              return (
                <div key={stage.stageId}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-300 flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: stage.color ?? '#6366f1' }}
                      />
                      {stage.stageName}
                    </span>
                    <span className="text-sm text-gray-400">
                      {formatCurrency(stage.totalValue)} ({stage.dealCount})
                    </span>
                  </div>
                  <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: stage.color ?? '#6366f1',
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {(!overview?.pipeline.byStage || overview.pipeline.byStage.length === 0) && (
              <p className="text-gray-500 text-center py-8">No pipeline data</p>
            )}
          </div>
        </div>

        {/* Forecast */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">Revenue Forecast</h2>
            <Calendar className="h-5 w-5 text-gray-400" />
          </div>
          <div className="mb-4 grid grid-cols-3 gap-4">
            <div className="bg-gray-800/50 rounded-lg p-3">
              <p className="text-xs text-gray-400">Total Pipeline</p>
              <p className="text-lg font-semibold text-white">
                {formatCurrency(forecast?.summary.totalPipeline ?? 0)}
              </p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <p className="text-xs text-gray-400">Weighted</p>
              <p className="text-lg font-semibold text-emerald-400">
                {formatCurrency(forecast?.summary.weightedPipeline ?? 0)}
              </p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <p className="text-xs text-gray-400">Avg Deal Size</p>
              <p className="text-lg font-semibold text-blue-400">
                {formatCurrency(forecast?.summary.avgDealSize ?? 0)}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {forecast?.forecast.map((month) => (
              <div key={month.month} className="flex items-center gap-4">
                <span className="text-sm text-gray-400 w-20">{month.month}</span>
                <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${(month.committed / (month.pipeline || 1)) * 100}%` }}
                  />
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${((month.bestCase - month.committed) / (month.pipeline || 1)) * 100}%` }}
                  />
                  <div
                    className="h-full bg-gray-600"
                    style={{ width: `${((month.pipeline - month.bestCase) / (month.pipeline || 1)) * 100}%` }}
                  />
                </div>
                <span className="text-sm text-gray-300 w-24 text-right">
                  {formatCurrency(month.pipeline)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-6 mt-4 pt-4 border-t border-gray-800">
            <span className="flex items-center text-xs text-gray-400">
              <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2" />
              Committed
            </span>
            <span className="flex items-center text-xs text-gray-400">
              <span className="w-2 h-2 bg-blue-500 rounded-full mr-2" />
              Best Case
            </span>
            <span className="flex items-center text-xs text-gray-400">
              <span className="w-2 h-2 bg-gray-600 rounded-full mr-2" />
              Pipeline
            </span>
          </div>
        </div>
      </div>

      {/* Activity & Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Summary */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">Activity Overview</h2>
            <Activity className="h-5 w-5 text-gray-400" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-4 w-4 text-indigo-400" />
                <span className="text-sm text-gray-400">Meetings</span>
              </div>
              <p className="text-2xl font-bold text-white">{overview?.meetings.total ?? 0}</p>
              <p className="text-xs text-gray-500">{overview?.meetings.withInsights ?? 0} with insights</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="h-4 w-4 text-blue-400" />
                <span className="text-sm text-gray-400">Emails Sent</span>
              </div>
              <p className="text-2xl font-bold text-white">{overview?.emails.sent ?? 0}</p>
              <p className="text-xs text-gray-500">{overview?.emails.received ?? 0} received</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckSquare className="h-4 w-4 text-emerald-400" />
                <span className="text-sm text-gray-400">Tasks</span>
              </div>
              <p className="text-2xl font-bold text-white">{overview?.tasks.completed ?? 0}</p>
              <p className="text-xs text-gray-500">{overview?.tasks.completionRate ?? 0}% completion</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-purple-400" />
                <span className="text-sm text-gray-400">Win Rate</span>
              </div>
              <p className="text-2xl font-bold text-white">{overview?.winRate ?? 0}%</p>
              <p className="text-xs text-gray-500">{overview?.wonDeals.count ?? 0} deals won</p>
            </div>
          </div>

          {/* Activity Trend Chart */}
          <div className="h-48 flex items-end gap-1">
            {trends?.activities.map((day, idx) => {
              const maxCount = Math.max(...(trends?.activities.map((d) => d.count) ?? [1]));
              const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
              return (
                <div
                  key={idx}
                  className="flex-1 bg-indigo-500/30 hover:bg-indigo-500/50 rounded-t transition-colors"
                  style={{ height: `${Math.max(height, 2)}%` }}
                  title={`${day.date}: ${day.count} activities`}
                />
              );
            })}
            {(!trends?.activities || trends.activities.length === 0) && (
              <p className="text-gray-500 text-center w-full">No activity data</p>
            )}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">Top Performers</h2>
            <Trophy className="h-5 w-5 text-amber-400" />
          </div>
          <div className="space-y-4">
            {leaderboard?.leaderboard.slice(0, 5).map((member, idx) => (
              <div key={member.userId} className="flex items-center gap-3">
                <span className={`text-sm font-bold w-6 ${
                  idx === 0 ? 'text-amber-400' :
                  idx === 1 ? 'text-gray-300' :
                  idx === 2 ? 'text-amber-700' :
                  'text-gray-500'
                }`}>
                  #{member.rank}
                </span>
                <div className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center">
                  {member.avatarUrl ? (
                    <img src={member.avatarUrl} alt={member.name} className="h-8 w-8 rounded-full" />
                  ) : (
                    <span className="text-sm font-medium text-gray-300">
                      {member.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{member.name}</p>
                  <p className="text-xs text-gray-500">{formatCurrency(member.value)}</p>
                </div>
                {idx === 0 && <Trophy className="h-5 w-5 text-amber-400" />}
              </div>
            ))}
            {(!leaderboard?.leaderboard || leaderboard.leaderboard.length === 0) && (
              <p className="text-gray-500 text-center py-4">No data yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Won vs Lost */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500/20 rounded-lg">
              <TrendingUp className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Deals Won</h3>
              <p className="text-sm text-gray-400">in selected period</p>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-emerald-400">
              {formatCurrency(overview?.wonDeals.value ?? 0)}
            </span>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
            <span className="text-emerald-400 font-medium">{overview?.wonDeals.count ?? 0}</span>
            deals closed successfully
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <TrendingDown className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Deals Lost</h3>
              <p className="text-sm text-gray-400">in selected period</p>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-red-400">
              {formatCurrency(overview?.lostDeals.value ?? 0)}
            </span>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
            <span className="text-red-400 font-medium">{overview?.lostDeals.count ?? 0}</span>
            deals lost
          </div>
        </div>
      </div>
    </div>
  );
}

