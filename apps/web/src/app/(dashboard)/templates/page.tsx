'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface Template {
  id: string;
  name: string;
  description: string | null;
  type: string;
  category: string | null;
  subject: string | null;
  body: string;
  variables: Array<{ name: string; defaultValue?: string; required: boolean }> | null;
  isShared: boolean;
  isDefault: boolean;
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  createdBy: { id: string; email: string; firstName: string | null; lastName: string | null };
}

const templateTypes = [
  { value: 'EMAIL_COLD', label: 'Cold Email', category: 'Email' },
  { value: 'EMAIL_FOLLOW_UP', label: 'Follow-up Email', category: 'Email' },
  { value: 'EMAIL_BREAK_UP', label: 'Break-up Email', category: 'Email' },
  { value: 'EMAIL_NURTURE', label: 'Nurture Email', category: 'Email' },
  { value: 'LINKEDIN_CONNECTION', label: 'LinkedIn Connection', category: 'LinkedIn' },
  { value: 'LINKEDIN_INMAIL', label: 'LinkedIn InMail', category: 'LinkedIn' },
  { value: 'LINKEDIN_REPLY', label: 'LinkedIn Reply', category: 'LinkedIn' },
  { value: 'CALL_SCRIPT', label: 'Call Script', category: 'Calls' },
  { value: 'SMS', label: 'SMS', category: 'SMS' },
];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [filterType, setFilterType] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Create form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState('EMAIL_COLD');
  const [formCategory, setFormCategory] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formIsShared, setFormIsShared] = useState(false);
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [filterType, filterCategory, searchQuery]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [templatesRes, categoriesRes] = await Promise.all([
        api.getTemplates({
          type: filterType || undefined,
          category: filterCategory || undefined,
          search: searchQuery || undefined,
        }),
        api.getTemplateCategories(),
      ]);
      setTemplates(templatesRes || []);
      setCategories(categoriesRes || []);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setIsLoading(false);
    }
  }

  function resetForm() {
    setFormName('');
    setFormDescription('');
    setFormType('EMAIL_COLD');
    setFormCategory('');
    setFormSubject('');
    setFormBody('');
    setFormIsShared(false);
    setFormIsDefault(false);
    setSelectedTemplate(null);
  }

  function openEdit(template: Template) {
    setFormName(template.name);
    setFormDescription(template.description || '');
    setFormType(template.type);
    setFormCategory(template.category || '');
    setFormSubject(template.subject || '');
    setFormBody(template.body);
    setFormIsShared(template.isShared);
    setFormIsDefault(template.isDefault);
    setSelectedTemplate(template);
    setShowCreateModal(true);
  }

  async function handleSave() {
    if (!formName.trim() || !formBody.trim()) {
      alert('Please fill in name and body');
      return;
    }

    setIsSaving(true);
    try {
      if (selectedTemplate) {
        await api.updateTemplate(selectedTemplate.id, {
          name: formName,
          description: formDescription || undefined,
          type: formType,
          category: formCategory || undefined,
          subject: formSubject || undefined,
          body: formBody,
          isShared: formIsShared,
          isDefault: formIsDefault,
        });
      } else {
        await api.createTemplate({
          name: formName,
          description: formDescription || undefined,
          type: formType,
          category: formCategory || undefined,
          subject: formSubject || undefined,
          body: formBody,
          isShared: formIsShared,
          isDefault: formIsDefault,
        });
      }
      setShowCreateModal(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error('Failed to save template:', error);
      alert('Failed to save template');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      await api.deleteTemplate(id);
      loadData();
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  }

  async function handleDuplicate(id: string) {
    try {
      await api.duplicateTemplate(id);
      loadData();
    } catch (error) {
      console.error('Failed to duplicate template:', error);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  const getTypeLabel = (type: string) => templateTypes.find(t => t.value === type)?.label || type;
  const getTypeCategory = (type: string) => templateTypes.find(t => t.value === type)?.category || 'Other';

  const typeCategories = [...new Set(templateTypes.map(t => t.category))];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              Templates Library
            </h1>
            <p className="text-slate-400 mt-1">
              Reusable templates for emails, LinkedIn, and calls
            </p>
          </div>
          <button
            onClick={() => { resetForm(); setShowCreateModal(true); }}
            className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium hover:from-emerald-600 hover:to-teal-600 transition-all"
          >
            + Create Template
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500 w-64"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Types</option>
            {templateTypes.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Categories</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Templates Grid */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-20 bg-slate-900 rounded-xl border border-slate-800">
            <svg className="w-16 h-16 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <h3 className="text-xl font-semibold mb-2">No templates yet</h3>
            <p className="text-slate-400 mb-6">Create your first template to get started</p>
            <button
              onClick={() => { resetForm(); setShowCreateModal(true); }}
              className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700"
            >
              Create Template
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => (
              <div
                key={template.id}
                className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden hover:border-slate-700 transition-colors"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-lg line-clamp-1">{template.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs px-2 py-0.5 rounded bg-emerald-600/20 text-emerald-400">
                          {getTypeLabel(template.type)}
                        </span>
                        {template.category && (
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                            {template.category}
                          </span>
                        )}
                        {template.isDefault && (
                          <span className="text-xs px-2 py-0.5 rounded bg-yellow-600/20 text-yellow-400">
                            Default
                          </span>
                        )}
                      </div>
                    </div>
                    {template.isShared && (
                      <span className="text-xs text-blue-400" title="Shared with team">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </span>
                    )}
                  </div>

                  {template.description && (
                    <p className="text-slate-400 text-sm mb-3 line-clamp-2">{template.description}</p>
                  )}

                  {template.subject && (
                    <div className="mb-3">
                      <p className="text-xs text-slate-500">Subject</p>
                      <p className="text-sm text-slate-300 line-clamp-1">{template.subject}</p>
                    </div>
                  )}

                  <div className="p-3 bg-slate-800 rounded-lg mb-3">
                    <p className="text-sm text-slate-300 line-clamp-4 font-mono text-xs">{template.body}</p>
                  </div>

                  {template.variables && template.variables.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {template.variables.slice(0, 3).map((v, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded bg-purple-600/20 text-purple-300">
                          {`{{${v.name}}}`}
                        </span>
                      ))}
                      {template.variables.length > 3 && (
                        <span className="text-xs text-slate-500">+{template.variables.length - 3} more</span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Used {template.useCount} times</span>
                    <span>
                      {template.createdBy.firstName || template.createdBy.email.split('@')[0]}
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-800 p-3 flex items-center justify-end gap-2">
                  <button
                    onClick={() => copyToClipboard(template.body)}
                    className="px-3 py-1.5 rounded text-sm bg-slate-700 text-slate-300 hover:bg-slate-600"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => handleDuplicate(template.id)}
                    className="px-3 py-1.5 rounded text-sm bg-slate-700 text-slate-300 hover:bg-slate-600"
                  >
                    Duplicate
                  </button>
                  <button
                    onClick={() => openEdit(template)}
                    className="px-3 py-1.5 rounded text-sm bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="px-3 py-1.5 rounded text-sm bg-red-600/20 text-red-400 hover:bg-red-600/30"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create/Edit Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-slate-800">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">
                    {selectedTemplate ? 'Edit Template' : 'Create Template'}
                  </h2>
                  <button
                    onClick={() => { setShowCreateModal(false); resetForm(); }}
                    className="text-slate-400 hover:text-white"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Name *</label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g., Cold Outreach v2"
                      className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Type *</label>
                    <select
                      value={formType}
                      onChange={(e) => setFormType(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                    >
                      {typeCategories.map(cat => (
                        <optgroup key={cat} label={cat}>
                          {templateTypes.filter(t => t.category === cat).map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Category</label>
                    <input
                      type="text"
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      placeholder="e.g., Enterprise, SMB"
                      className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                      list="categories"
                    />
                    <datalist id="categories">
                      {categories.map(c => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Description</label>
                    <input
                      type="text"
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      placeholder="Brief description..."
                      className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {formType.startsWith('EMAIL_') && (
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Subject Line</label>
                    <input
                      type="text"
                      value={formSubject}
                      onChange={(e) => setFormSubject(e.target.value)}
                      placeholder="e.g., Quick question about {{company.name}}"
                      className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm text-slate-400 mb-2">Body *</label>
                  <textarea
                    value={formBody}
                    onChange={(e) => setFormBody(e.target.value)}
                    placeholder="Hi {{contact.firstName}},&#10;&#10;I noticed that..."
                    className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500 h-64 resize-none font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Use {"{{variable}}"} for personalization. Available: contact.firstName, contact.lastName, contact.email, company.name, sender.firstName, etc.
                  </p>
                </div>

                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsShared}
                      onChange={(e) => setFormIsShared(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span className="text-sm text-slate-300">Share with team</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsDefault}
                      onChange={(e) => setFormIsDefault(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span className="text-sm text-slate-300">Set as default for this type</span>
                  </label>
                </div>
              </div>

              <div className="p-6 border-t border-slate-800 flex justify-end gap-3">
                <button
                  onClick={() => { setShowCreateModal(false); resetForm(); }}
                  className="px-5 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || !formName.trim() || !formBody.trim()}
                  className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Saving...' : selectedTemplate ? 'Update Template' : 'Create Template'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

