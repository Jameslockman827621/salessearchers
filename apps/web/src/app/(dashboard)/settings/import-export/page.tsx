'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Upload,
  Download,
  FileUp,
  FileDown,
  Loader2,
  Check,
  AlertCircle,
  X,
  FileText,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type ImportType = 'CONTACTS' | 'COMPANIES' | 'DEALS';
type ExportType = 'CONTACTS' | 'COMPANIES' | 'DEALS' | 'ACTIVITIES' | 'MEETINGS' | 'TASKS';

const importFieldMappings: Record<ImportType, Record<string, string>> = {
  CONTACTS: {
    email: 'email',
    first_name: 'firstName',
    firstName: 'firstName',
    last_name: 'lastName',
    lastName: 'lastName',
    phone: 'phone',
    title: 'title',
    company: 'company',
    linkedin_url: 'linkedinUrl',
    linkedinUrl: 'linkedinUrl',
  },
  COMPANIES: {
    name: 'name',
    domain: 'domain',
    website: 'website',
    industry: 'industry',
    size: 'size',
    location: 'location',
    linkedin_url: 'linkedinUrl',
  },
  DEALS: {
    name: 'name',
    value: 'value',
    currency: 'currency',
    probability: 'probability',
    expected_close: 'expectedClose',
    notes: 'notes',
  },
};

export default function ImportExportPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importType, setImportType] = useState<ImportType>('CONTACTS');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importData, setImportData] = useState<Array<Record<string, unknown>>>([]);
  const [importMapping, setImportMapping] = useState<Record<string, string>>({});
  const [importOptions, setImportOptions] = useState({
    skipDuplicates: true,
    updateExisting: false,
  });
  const [importStep, setImportStep] = useState<'upload' | 'mapping' | 'processing' | 'complete'>(
    'upload'
  );
  const [importResult, setImportResult] = useState<{
    successCount: number;
    errorCount: number;
    errors: Array<{ row: number; error: string }>;
  } | null>(null);

  const { data: imports, isLoading: importsLoading } = useQuery({
    queryKey: ['imports'],
    queryFn: () => api.getImports(),
  });

  const { data: exports, isLoading: exportsLoading } = useQuery({
    queryKey: ['exports'],
    queryFn: () => api.getExports(),
  });

  const importMutation = useMutation({
    mutationFn: (data: {
      type: ImportType;
      fileName: string;
      data: Array<Record<string, unknown>>;
      fieldMapping: Record<string, string>;
      options: { skipDuplicates: boolean; updateExisting: boolean };
    }) => api.createImport(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      setImportResult(result);
      setImportStep('complete');
    },
    onError: () => {
      setImportStep('upload');
    },
  });

  const exportMutation = useMutation({
    mutationFn: (type: ExportType) => api.createExport({ type }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['exports'] });
      // Download as CSV
      if (result.data.length > 0) {
        const headers = Object.keys(result.data[0]);
        const csv = [
          headers.join(','),
          ...result.data.map((row) =>
            headers.map((h) => JSON.stringify(row[h] ?? '')).join(',')
          ),
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${result.id}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);

    // Parse CSV
    const text = await file.text();
    const lines = text.split('\n').filter((line) => line.trim());
    if (lines.length < 2) {
      alert('CSV must have at least a header row and one data row');
      return;
    }

    const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
    const data = lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim().replace(/"/g, ''));
      const row: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        row[h] = values[i] ?? '';
      });
      return row;
    });

    setImportData(data);

    // Auto-map fields
    const mapping: Record<string, string> = {};
    const possibleMappings = importFieldMappings[importType];
    headers.forEach((h) => {
      const lowerH = h.toLowerCase().replace(/[^a-z0-9]/g, '_');
      if (possibleMappings[lowerH]) {
        mapping[h] = possibleMappings[lowerH];
      } else if (possibleMappings[h]) {
        mapping[h] = possibleMappings[h];
      }
    });
    setImportMapping(mapping);
    setImportStep('mapping');
  };

  const handleImport = () => {
    if (!importFile || importData.length === 0) return;
    setImportStep('processing');
    importMutation.mutate({
      type: importType,
      fileName: importFile.name,
      data: importData,
      fieldMapping: importMapping,
      options: importOptions,
    });
  };

  const resetImport = () => {
    setImportFile(null);
    setImportData([]);
    setImportMapping({});
    setImportResult(null);
    setImportStep('upload');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-4xl space-y-8">
      {/* Import Section */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Upload className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Import Data</h2>
              <p className="text-sm text-gray-400">Import contacts, companies, or deals from CSV</p>
            </div>
          </div>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
          >
            <FileUp className="h-4 w-4" />
            Import CSV
          </button>
        </div>

        {/* Recent Imports */}
        {importsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : imports && imports.length > 0 ? (
          <div className="space-y-2">
            {imports.slice(0, 5).map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-white">{job.fileName}</p>
                    <p className="text-xs text-gray-500">
                      {job.type} · {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-400">
                    {job.successCount} imported
                    {job.errorCount > 0 && (
                      <span className="text-red-400"> · {job.errorCount} errors</span>
                    )}
                  </span>
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      job.status === 'COMPLETED'
                        ? 'text-emerald-400 bg-emerald-400/20'
                        : job.status === 'FAILED'
                        ? 'text-red-400 bg-red-400/20'
                        : 'text-amber-400 bg-amber-400/20'
                    }`}
                  >
                    {job.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-500 py-4">No imports yet</p>
        )}
      </div>

      {/* Export Section */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-emerald-500/20 rounded-lg">
            <Download className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Export Data</h2>
            <p className="text-sm text-gray-400">Download your data as CSV</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          {(['CONTACTS', 'COMPANIES', 'DEALS', 'ACTIVITIES', 'MEETINGS', 'TASKS'] as ExportType[]).map(
            (type) => (
              <button
                key={type}
                onClick={() => exportMutation.mutate(type)}
                disabled={exportMutation.isPending}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <FileDown className="h-4 w-4" />
                Export {type.charAt(0) + type.slice(1).toLowerCase()}
              </button>
            )
          )}
        </div>

        {/* Recent Exports */}
        {exportsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : exports && exports.length > 0 ? (
          <div className="space-y-2 border-t border-gray-800 pt-4">
            <p className="text-sm text-gray-400 mb-2">Recent Exports</p>
            {exports.slice(0, 5).map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <FileDown className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-white">{job.type}</p>
                    <p className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-400">{job.totalRows} rows</span>
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      job.status === 'COMPLETED'
                        ? 'text-emerald-400 bg-emerald-400/20'
                        : 'text-amber-400 bg-amber-400/20'
                    }`}
                  >
                    {job.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={() => {
              setShowImportModal(false);
              resetImport();
            }}
          />
          <div className="fixed inset-x-4 top-[10%] mx-auto max-w-2xl bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Import Data</h3>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  resetImport();
                }}
                className="p-1 text-gray-400 hover:text-white rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {importStep === 'upload' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Data Type
                  </label>
                  <select
                    value={importType}
                    onChange={(e) => setImportType(e.target.value as ImportType)}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="CONTACTS">Contacts</option>
                    <option value="COMPANIES">Companies</option>
                    <option value="DEALS">Deals</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    CSV File
                  </label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-indigo-500 transition-colors"
                  >
                    <FileUp className="h-10 w-10 text-gray-500 mb-3" />
                    <p className="text-sm text-gray-400">Click to select a CSV file</p>
                    <p className="text-xs text-gray-500 mt-1">Max 10,000 rows</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              </div>
            )}

            {importStep === 'mapping' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-400">
                  Map your CSV columns to the database fields. Found {importData.length} rows.
                </p>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {Object.keys(importData[0] ?? {}).map((csvField) => (
                    <div key={csvField} className="flex items-center gap-4">
                      <span className="text-sm text-gray-300 w-1/3 truncate">{csvField}</span>
                      <span className="text-gray-500">→</span>
                      <select
                        value={importMapping[csvField] ?? ''}
                        onChange={(e) =>
                          setImportMapping({
                            ...importMapping,
                            [csvField]: e.target.value,
                          })
                        }
                        className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white"
                      >
                        <option value="">Skip this field</option>
                        {Object.values(importFieldMappings[importType]).map((dbField) => (
                          <option key={dbField} value={dbField}>
                            {dbField}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 pt-4 border-t border-gray-800">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={importOptions.skipDuplicates}
                      onChange={(e) =>
                        setImportOptions({
                          ...importOptions,
                          skipDuplicates: e.target.checked,
                        })
                      }
                      className="rounded bg-gray-800 border-gray-700"
                    />
                    <span className="text-sm text-gray-300">Skip duplicate records</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={importOptions.updateExisting}
                      onChange={(e) =>
                        setImportOptions({
                          ...importOptions,
                          updateExisting: e.target.checked,
                        })
                      }
                      className="rounded bg-gray-800 border-gray-700"
                    />
                    <span className="text-sm text-gray-300">Update existing records</span>
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <button
                    onClick={resetImport}
                    className="px-4 py-2 text-sm text-gray-400 hover:text-white"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleImport}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                  >
                    <Upload className="h-4 w-4" />
                    Start Import
                  </button>
                </div>
              </div>
            )}

            {importStep === 'processing' && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-10 w-10 text-indigo-400 animate-spin mb-4" />
                <p className="text-white">Importing your data...</p>
                <p className="text-sm text-gray-500 mt-1">This may take a moment</p>
              </div>
            )}

            {importStep === 'complete' && importResult && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <Check className="h-6 w-6 text-emerald-400" />
                  <div>
                    <p className="text-white font-medium">Import Complete</p>
                    <p className="text-sm text-gray-400">
                      Successfully imported {importResult.successCount} records
                    </p>
                  </div>
                </div>

                {importResult.errorCount > 0 && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="h-5 w-5 text-red-400" />
                      <p className="text-red-400 font-medium">
                        {importResult.errorCount} errors occurred
                      </p>
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {importResult.errors.map((err, idx) => (
                        <p key={idx} className="text-xs text-gray-400">
                          Row {err.row}: {err.error}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setShowImportModal(false);
                      resetImport();
                    }}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

