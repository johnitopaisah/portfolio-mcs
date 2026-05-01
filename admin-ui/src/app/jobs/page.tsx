/**
 * Admin Dashboard - Job Aggregation System
 * Main dashboard showing stats, recent jobs, ingestion logs, etc.
 */

'use client';

import React, { useState, useEffect } from 'react';

interface JobStats {
  total_jobs: number;
  active_jobs: number;
  avg_relevance: number;
  jobs_this_week: number;
}

interface IngestionLog {
  id: string;
  source_api: string;
  status: string;
  jobs_fetched: number;
  jobs_new: number;
  jobs_duplicates: number;
  duration_ms: number;
  created_at: string;
}

export default function JobAdminDashboard() {
  const [stats, setStats] = useState<JobStats | null>(null);
  const [logs, setLogs] = useState<IngestionLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      // These endpoints need to be added to the API
      // For now, we'll show the component structure
      setLoading(false);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Job System Admin</h1>
          <p className="text-gray-600 mt-2">Manage job ingestion, filtering, and monitoring</p>
        </div>

        {/* Navigation Tabs */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="flex gap-8" aria-label="Tabs">
            <a
              href="#"
              className="py-4 px-1 border-b-2 border-blue-600 font-medium text-blue-600"
            >
              Dashboard
            </a>
            <a
              href="/admin/jobs/logs"
              className="py-4 px-1 border-b-2 border-transparent font-medium text-gray-600 hover:text-gray-900"
            >
              Ingestion Logs
            </a>
            <a
              href="/admin/jobs/sources"
              className="py-4 px-1 border-b-2 border-transparent font-medium text-gray-600 hover:text-gray-900"
            >
              Job Sources
            </a>
            <a
              href="/admin/jobs/settings"
              className="py-4 px-1 border-b-2 border-transparent font-medium text-gray-600 hover:text-gray-900"
            >
              Settings
            </a>
          </nav>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <StatCard
                title="Total Jobs"
                value={stats?.total_jobs || 0}
                icon="📊"
                trend="+12% this week"
              />
              <StatCard
                title="Active Jobs"
                value={stats?.active_jobs || 0}
                icon="✅"
                trend="Last 30 days"
              />
              <StatCard
                title="Avg Relevance"
                value={`${Math.round(stats?.avg_relevance || 0)}%`}
                icon="🎯"
                trend="All jobs"
              />
              <StatCard
                title="This Week"
                value={stats?.jobs_this_week || 0}
                icon="📈"
                trend="New jobs"
              />
            </div>

            {/* Recent Ingestions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Ingestion Runs</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Source
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Fetched
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          New
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Duration
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Time
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {log.source_api}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-medium ${
                                log.status === 'SUCCESS'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {log.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {log.jobs_fetched}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {log.jobs_new}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {(log.duration_ms / 1000).toFixed(2)}s
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {new Date(log.created_at).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
                <div className="space-y-3">
                  <button className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition">
                    ▶️ Run Ingestion Now
                  </button>
                  <button className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition">
                    🤖 Run AI Filtering
                  </button>
                  <button className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition">
                    📧 Send Alerts
                  </button>
                  <button className="w-full px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition">
                    ⚙️ Settings
                  </button>
                </div>
              </div>
            </div>

            {/* System Health */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">API Health</h2>
                <div className="space-y-3">
                  <HealthItem name="Jooble API" status="healthy" lastCheck="2 min ago" />
                  <HealthItem name="RemoteOK API" status="healthy" lastCheck="5 min ago" />
                  <HealthItem name="Database" status="healthy" lastCheck="now" />
                  <HealthItem name="Email Service" status="warning" lastCheck="1 hour ago" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Alerts</h2>
                <div className="space-y-3">
                  <AlertItem severity="info" message="Scheduled ingestion in 5 minutes" />
                  <AlertItem
                    severity="warning"
                    message="RemoteOK API response time degraded (avg 3.2s)"
                  />
                  <AlertItem severity="success" message="All systems operational" />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  trend,
}: {
  title: string;
  value: string | number;
  icon: string;
  trend: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
          <p className="text-xs text-gray-500 mt-2">{trend}</p>
        </div>
        <span className="text-4xl">{icon}</span>
      </div>
    </div>
  );
}

function HealthItem({ name, status, lastCheck }: { name: string; status: string; lastCheck: string }) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
      <div className="flex items-center gap-3">
        <div
          className={`w-3 h-3 rounded-full ${
            status === 'healthy' ? 'bg-green-500' : status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
          }`}
        />
        <span className="text-sm font-medium text-gray-900">{name}</span>
      </div>
      <span className="text-xs text-gray-500">{lastCheck}</span>
    </div>
  );
}

function AlertItem({ severity, message }: { severity: string; message: string }) {
  const bgColor =
    severity === 'info'
      ? 'bg-blue-50'
      : severity === 'warning'
      ? 'bg-yellow-50'
      : severity === 'error'
      ? 'bg-red-50'
      : 'bg-green-50';

  const borderColor =
    severity === 'info'
      ? 'border-blue-200'
      : severity === 'warning'
      ? 'border-yellow-200'
      : severity === 'error'
      ? 'border-red-200'
      : 'border-green-200';

  return (
    <div className={`${bgColor} border ${borderColor} rounded p-3`}>
      <p className="text-sm text-gray-800">{message}</p>
    </div>
  );
}
