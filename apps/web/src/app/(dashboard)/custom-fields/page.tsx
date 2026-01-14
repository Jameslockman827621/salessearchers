'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface CustomField {
  id: string;
  name: string;
  label: string;
  description: string | null;
  entityType: string;
  fieldType: string;
  isRequired: boolean;
  isUnique: boolean;
  options: Array<{ value: string; label: string; color?: string }> | null;
  defaultValue: string | null;
  order: number;
  isVisible: boolean;
  showInList: boolean;
  showInForm: boolean;
  createdAt: string;
}

interface FieldType {
  type: string;
  label: string;
  icon: string;
  hasOptions: boolean;
}

const entityTypes = ['CONTACT', 'COMPANY', 'DEAL'] as const;
type EntityType = typeof entityTypes[number];

export default function CustomFieldsPage() {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [fieldTypes, setFieldTypes] = useState<FieldType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<EntityType>('CONTACT');
  const [showModal, setShowModal] = useState(false);
  const [selectedField, setSelectedField] = useState<CustomField | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [fieldName, setFieldName] = useState('');
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldDescription, setFieldDescription] = useState('');
  const [fieldType, setFieldType] = useState('TEXT');
  const [isRequired, setIsRequired] = useState(false);
  const [isUnique, setIsUnique] = useState(false);
  const [showInList, setShowInList] = useState(true);
  const [showInForm, setShowInForm] = useState(true);
  const [defaultValue, setDefaultValue] = useState('');
  const [options, setOptions] = useState<Array<{ value: string; label: string; color?: string }>>([]);
  const [newOptionValue, setNewOptionValue] = useState('');
  const [newOptionLabel, setNewOptionLabel] = useState('');

  useEffect(() => {
    loadData();
  }, [activeTab]);

  useEffect(() => {
    loadFieldTypes();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const result = await api.getCustomFields(activeTab);
      setFields(Array.isArray(result) ? result : []);
    } catch (error) {
      console.error('Failed to load custom fields:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadFieldTypes() {
    try {
      const result = await api.getCustomFieldTypes();
      setFieldTypes(Array.isArray(result) ? result : []);
    } catch (error) {
      console.error('Failed to load field types:', error);
    }
  }

  function resetForm() {
    setFieldName('');
    setFieldLabel('');
    setFieldDescription('');
    setFieldType('TEXT');
    setIsRequired(false);
    setIsUnique(false);
    setShowInList(true);
    setShowInForm(true);
    setDefaultValue('');
    setOptions([]);
    setNewOptionValue('');
    setNewOptionLabel('');
    setSelectedField(null);
  }

  function openEditField(field: CustomField) {
    setFieldName(field.name);
    setFieldLabel(field.label);
    setFieldDescription(field.description || '');
    setFieldType(field.fieldType);
    setIsRequired(field.isRequired);
    setIsUnique(field.isUnique);
    setShowInList(field.showInList);
    setShowInForm(field.showInForm);
    setDefaultValue(field.defaultValue || '');
    setOptions(field.options || []);
    setSelectedField(field);
    setShowModal(true);
  }

  function addOption() {
    if (!newOptionValue.trim() || !newOptionLabel.trim()) return;
    setOptions([...options, { value: newOptionValue.trim(), label: newOptionLabel.trim() }]);
    setNewOptionValue('');
    setNewOptionLabel('');
  }

  function removeOption(index: number) {
    setOptions(options.filter((_, i) => i !== index));
  }

  async function handleSaveField() {
    if (!fieldName.trim() || !fieldLabel.trim()) {
      alert('Please enter name and label');
      return;
    }

    // Validate name format
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(fieldName)) {
      alert('Name must start with a letter or underscore and contain only letters, numbers, and underscores');
      return;
    }

    setIsSaving(true);
    try {
      const selectedTypeInfo = fieldTypes.find(t => t.type === fieldType);
      const hasOptions = selectedTypeInfo?.hasOptions;

      if (selectedField) {
        await api.updateCustomField(selectedField.id, {
          label: fieldLabel,
          description: fieldDescription || undefined,
          fieldType,
          isRequired,
          options: hasOptions ? options : undefined,
          defaultValue: defaultValue || undefined,
          showInList,
          showInForm,
        });
      } else {
        await api.createCustomField({
          name: fieldName,
          label: fieldLabel,
          description: fieldDescription || undefined,
          entityType: activeTab,
          fieldType,
          isRequired,
          isUnique,
          options: hasOptions ? options : undefined,
          defaultValue: defaultValue || undefined,
          showInList,
          showInForm,
        });
      }
      setShowModal(false);
      resetForm();
      loadData();
    } catch (error: unknown) {
      console.error('Failed to save field:', error);
      alert((error as Error).message || 'Failed to save field');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteField(id: string) {
    if (!confirm('Delete this custom field? All stored values will be lost.')) return;
    try {
      await api.deleteCustomField(id);
      loadData();
    } catch (error) {
      console.error('Failed to delete field:', error);
    }
  }

  function getFieldTypeInfo(type: string): FieldType | undefined {
    return fieldTypes.find(t => t.type === type);
  }

  function getTypeIcon(type: string) {
    const icons: Record<string, string> = {
      TEXT: 'Aa',
      TEXTAREA: '¶',
      NUMBER: '#',
      CURRENCY: '$',
      PERCENT: '%',
      DATE: '📅',
      DATETIME: '🕐',
      CHECKBOX: '☑',
      DROPDOWN: '▼',
      MULTI_SELECT: '☰',
      URL: '🔗',
      EMAIL: '✉',
      PHONE: '📞',
    };
    return icons[type] || '?';
  }

  const filteredFields = fields.filter(f => f.entityType === activeTab);
  const currentTypeInfo = fieldTypes.find(t => t.type === fieldType);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
              Custom Fields
            </h1>
            <p className="text-slate-400 mt-1">
              Define additional fields for contacts, companies, and deals
            </p>
          </div>
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 font-medium"
          >
            + Add Field
          </button>
        </div>

        {/* Entity Type Tabs */}
        <div className="flex border-b border-slate-800 mb-6">
          {entityTypes.map((type) => (
            <button
              key={type}
              onClick={() => setActiveTab(type)}
              className={`px-6 py-3 border-b-2 transition-colors ${
                activeTab === type
                  ? 'border-violet-500 text-violet-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {type.charAt(0) + type.slice(1).toLowerCase()}s
              <span className="ml-2 text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                {fields.filter(f => f.entityType === type).length}
              </span>
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 text-left">
                  <th className="p-4 text-sm font-medium text-slate-400 w-12">Type</th>
                  <th className="p-4 text-sm font-medium text-slate-400">Label</th>
                  <th className="p-4 text-sm font-medium text-slate-400">Name</th>
                  <th className="p-4 text-sm font-medium text-slate-400 text-center">Required</th>
                  <th className="p-4 text-sm font-medium text-slate-400 text-center">List</th>
                  <th className="p-4 text-sm font-medium text-slate-400 text-center">Form</th>
                  <th className="p-4 text-sm font-medium text-slate-400 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFields.map((field, index) => (
                  <tr 
                    key={field.id} 
                    className="border-b border-slate-800 hover:bg-slate-800/50"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('fieldIndex', String(index))}
                  >
                    <td className="p-4">
                      <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-700 text-slate-300 text-sm">
                        {getTypeIcon(field.fieldType)}
                      </span>
                    </td>
                    <td className="p-4">
                      <p className="font-medium">{field.label}</p>
                      {field.description && (
                        <p className="text-sm text-slate-500">{field.description}</p>
                      )}
                    </td>
                    <td className="p-4 font-mono text-sm text-slate-400">
                      {field.name}
                    </td>
                    <td className="p-4 text-center">
                      {field.isRequired ? (
                        <span className="text-green-400">✓</span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      {field.showInList ? (
                        <span className="text-green-400">✓</span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      {field.showInForm ? (
                        <span className="text-green-400">✓</span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => openEditField(field)}
                        className="text-violet-400 hover:text-violet-300 mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteField(field.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredFields.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                No custom fields for {activeTab.toLowerCase()}s yet.
                <br />
                <button
                  onClick={() => { resetForm(); setShowModal(true); }}
                  className="text-violet-400 hover:text-violet-300 mt-2 inline-block"
                >
                  Create your first field
                </button>
              </div>
            )}
          </div>
        )}

        {/* Info Section */}
        <div className="mt-8 p-6 rounded-xl bg-slate-900 border border-slate-800">
          <h3 className="text-lg font-semibold mb-4">About Custom Fields</h3>
          <div className="grid grid-cols-3 gap-6 text-sm text-slate-400">
            <div>
              <h4 className="font-medium text-white mb-2">Field Types</h4>
              <ul className="space-y-1">
                <li>• Text, Textarea for free-form input</li>
                <li>• Number, Currency, Percentage for numeric data</li>
                <li>• Date, DateTime for temporal values</li>
                <li>• Dropdown, Multi-select for predefined choices</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-white mb-2">Usage</h4>
              <ul className="space-y-1">
                <li>• Values are stored per entity (contact/company/deal)</li>
                <li>• Required fields must be filled on create/update</li>
                <li>• Show in List controls table column visibility</li>
                <li>• Show in Form controls edit form display</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-white mb-2">Best Practices</h4>
              <ul className="space-y-1">
                <li>• Use snake_case for field names</li>
                <li>• Keep labels short and descriptive</li>
                <li>• Set default values for common entries</li>
                <li>• Drag rows to reorder fields</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Field Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-lg max-h-[90vh] overflow-auto">
              <div className="p-6 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">
                    {selectedField ? 'Edit Field' : `Add ${activeTab.charAt(0) + activeTab.slice(1).toLowerCase()} Field`}
                  </h2>
                  <button
                    onClick={() => { setShowModal(false); resetForm(); }}
                    className="text-slate-400 hover:text-white"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Field Name *</label>
                    <input
                      type="text"
                      value={fieldName}
                      onChange={(e) => setFieldName(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                      placeholder="e.g., industry_segment"
                      disabled={!!selectedField}
                      className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-violet-500 disabled:opacity-50 font-mono text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">Alphanumeric with underscores</p>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Display Label *</label>
                    <input
                      type="text"
                      value={fieldLabel}
                      onChange={(e) => setFieldLabel(e.target.value)}
                      placeholder="e.g., Industry Segment"
                      className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">Description</label>
                  <input
                    type="text"
                    value={fieldDescription}
                    onChange={(e) => setFieldDescription(e.target.value)}
                    placeholder="Optional description for this field..."
                    className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">Field Type *</label>
                  <div className="grid grid-cols-4 gap-2">
                    {fieldTypes.map((type) => (
                      <button
                        key={type.type}
                        onClick={() => setFieldType(type.type)}
                        className={`p-2 rounded-lg border text-center transition-all ${
                          fieldType === type.type
                            ? 'border-violet-500 bg-violet-500/10 text-violet-400'
                            : 'border-slate-700 hover:border-slate-600 text-slate-400'
                        }`}
                      >
                        <span className="text-lg block mb-1">{getTypeIcon(type.type)}</span>
                        <span className="text-xs">{type.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Options for Dropdown/Multi-select */}
                {currentTypeInfo?.hasOptions && (
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Options</label>
                    <div className="space-y-2 mb-3">
                      {options.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2 bg-slate-800 rounded-lg p-2">
                          <span className="font-mono text-sm text-slate-300 flex-1">{opt.value}</span>
                          <span className="text-slate-400">→</span>
                          <span className="flex-1">{opt.label}</span>
                          <button
                            onClick={() => removeOption(i)}
                            className="text-red-400 hover:text-red-300 p-1"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newOptionValue}
                        onChange={(e) => setNewOptionValue(e.target.value)}
                        placeholder="Value"
                        className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-violet-500"
                      />
                      <input
                        type="text"
                        value={newOptionLabel}
                        onChange={(e) => setNewOptionLabel(e.target.value)}
                        placeholder="Label"
                        className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-violet-500"
                      />
                      <button
                        onClick={addOption}
                        className="px-3 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm text-slate-400 mb-2">Default Value</label>
                  <input
                    type="text"
                    value={defaultValue}
                    onChange={(e) => setDefaultValue(e.target.value)}
                    placeholder="Optional default value..."
                    className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-violet-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800">
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isRequired}
                        onChange={(e) => setIsRequired(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-violet-500 focus:ring-violet-500"
                      />
                      <span className="text-sm text-slate-300">Required field</span>
                    </label>
                    {!selectedField && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isUnique}
                          onChange={(e) => setIsUnique(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-violet-500 focus:ring-violet-500"
                        />
                        <span className="text-sm text-slate-300">Unique values only</span>
                      </label>
                    )}
                  </div>
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showInList}
                        onChange={(e) => setShowInList(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-violet-500 focus:ring-violet-500"
                      />
                      <span className="text-sm text-slate-300">Show in list view</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showInForm}
                        onChange={(e) => setShowInForm(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-violet-500 focus:ring-violet-500"
                      />
                      <span className="text-sm text-slate-300">Show in edit form</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-800 flex justify-end gap-3 sticky bottom-0 bg-slate-900">
                <button
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="px-5 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveField}
                  disabled={isSaving || !fieldName.trim() || !fieldLabel.trim()}
                  className="px-5 py-2.5 rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Saving...' : selectedField ? 'Update Field' : 'Create Field'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

