'use client';
import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────
interface CvDoc {
  id: number;
  application_id: number;
  document_type: string;
  version: number;
  ai_model: string | null;
  generated_by_ai: boolean;
  created_at: string;
  company_name: string;
  job_title: string;
  base_cv_version_num: number | null;
  base_cv_name: string | null;
}

type DocTypeFilter = 'all' | 'CV' | 'COVER_LETTER' | 'MESSAGE';

// ── Helpers ───────────────────────────────────────────────────
function abbreviateModel(model: string | null): string {
  if (model?.includes('haiku'))  return 'Haiku';
  if (model?.includes('sonnet')) return 'Sonnet';
  if (model?.includes('opus'))   return 'Opus';
  return model || '—';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day   = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-GB', { month: 'short' });
  const year  = d.getFullYear();
  const hh    = String(d.getHours()).padStart(2, '0');
  const mm    = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} ${hh}:${mm}`;
}

function typeBadge(type: string): { label: string; cls: string } {
  switch (type) {
    case 'CV':           return { label: 'CV',           cls: 'bg-blue-900/40 border-blue-800/40 text-blue-400'   };
    case 'COVER_LETTER': return { label: 'Cover Letter', cls: 'bg-purple-900/40 border-purple-800/40 text-purple-400' };
    case 'MESSAGE':      return { label: 'Message',      cls: 'bg-gray-800 border-gray-700 text-gray-400'          };
    default:             return { label: type,            cls: 'bg-gray-800 border-gray-700 text-gray-400'          };
  }
}

// ── Skeleton ──────────────────────────────────────────────────
function TableSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 bg-gray-800 rounded-lg mb-4 w-48" />
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="border-b border-gray-800 px-4 py-3 flex gap-4">
          {[120, 160, 80, 60, 80, 120, 120, 80].map((w, i) => (
            <div key={i} className={`h-3 bg-gray-800 rounded`} style={{ width: w }} />
          ))}
        </div>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="border-b border-gray-800/50 px-4 py-3.5 flex gap-4 items-center">
            {[120, 160, 80, 60, 80, 120, 120, 72].map((w, j) => (
              <div key={j} className="h-3 bg-gray-800 rounded" style={{ width: w }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function CvLibraryPage() {
  const [docs,       setDocs]       = useState<CvDoc[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [filterType, setFilterType] = useState<DocTypeFilter>('all');
  const [dlError,    setDlError]    = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const type = filterType === 'all' ? undefined : filterType;
      const data  = await adminApi.getCvLibrary(type);
      setDocs(data);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  async function handleDownload(doc: CvDoc) {
    setDlError(null);
    try {
      const filename = `${doc.document_type}-v${doc.version}-${doc.company_name.replace(/\s+/g, '-')}.pdf`;
      await adminApi.downloadCvDocument(doc.application_id, doc.id, filename);
    } catch (err: any) {
      setDlError(err.message || 'Download failed');
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">CV Library</h1>
        <p className="text-gray-500 text-sm">All AI-generated documents across every application</p>
      </div>

      {/* Filter toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-1 bg-gray-900 border border-gray-800 rounded-lg">
          {([
            { value: 'all',          label: 'All'          },
            { value: 'CV',           label: 'CV'           },
            { value: 'COVER_LETTER', label: 'Cover Letter' },
            { value: 'MESSAGE',      label: 'Message'      },
          ] as { value: DocTypeFilter; label: string }[]).map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilterType(opt.value)}
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
              style={filterType === opt.value ? {
                background: 'linear-gradient(135deg, rgba(124,58,237,0.75), rgba(79,70,229,0.75))',
                color: '#fff',
              } : { color: '#475569' }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          onClick={fetchDocs}
          className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 border border-gray-700
            text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Download error */}
      {dlError && (
        <div className="p-3 rounded-lg bg-red-900/20 border border-red-800/30 text-xs text-red-400">
          {dlError}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <TableSkeleton />
      ) : docs.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-500 text-sm">
            No documents generated yet. Generate a CV from an application to see it here.
          </p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Company', 'Role', 'Type', 'Version', 'AI Model', 'Generated', 'Base CV', ''].map(h => (
                    <th key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.map((doc, idx) => {
                  const badge = typeBadge(doc.document_type);
                  const isLast = idx === docs.length - 1;
                  return (
                    <tr key={doc.id}
                      className={`transition-colors hover:bg-gray-800/40 ${!isLast ? 'border-b border-gray-800/50' : ''}`}>

                      {/* Company */}
                      <td className="px-4 py-3.5 text-gray-200 font-medium whitespace-nowrap max-w-[160px] truncate">
                        {doc.company_name}
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3.5 text-gray-400 whitespace-nowrap max-w-[180px] truncate">
                        {doc.job_title}
                      </td>

                      {/* Type badge */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>

                      {/* Version */}
                      <td className="px-4 py-3.5 text-gray-400 whitespace-nowrap">
                        v{doc.version}
                      </td>

                      {/* AI Model */}
                      <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">
                        {abbreviateModel(doc.ai_model)}
                      </td>

                      {/* Generated date */}
                      <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap font-mono text-xs">
                        {formatDate(doc.created_at)}
                      </td>

                      {/* Base CV */}
                      <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap max-w-[160px] truncate text-xs">
                        {doc.base_cv_name ?? (doc.base_cv_version_num != null ? `v${doc.base_cv_version_num}` : '—')}
                      </td>

                      {/* Download */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <button
                          onClick={() => handleDownload(doc)}
                          className="px-3 py-1 text-xs rounded-lg bg-gray-800 hover:bg-indigo-700
                            border border-gray-700 hover:border-indigo-600
                            text-gray-400 hover:text-white font-medium transition-colors"
                        >
                          Download
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Row count footer */}
          <div className="px-4 py-2.5 border-t border-gray-800/50">
            <p className="text-xs text-gray-600">
              {docs.length} document{docs.length !== 1 ? 's' : ''}
              {filterType !== 'all' ? ` · filtered by ${filterType}` : ''}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
