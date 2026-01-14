'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Building2,
  Plus,
  Search,
  Sparkles,
  Globe,
  Users,
  MoreVertical,
  Trash2,
  Edit,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Check,
  ExternalLink,
  Mail,
  Phone,
  UserPlus,
  ArrowRight,
  Filter,
  CheckSquare,
  Square,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';

interface Company {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  size: string | null;
  location: string | null;
  linkedinUrl: string | null;
  logoUrl: string | null;
  enrichmentData: Record<string, unknown> | null;
  enrichedAt: string | null;
  contactCount: number;
  createdAt: string;
  updatedAt: string;
}

interface FoundEmployee {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  title?: string;
  email?: string;
  emailStatus?: string;
  phone?: string;
  phoneStatus?: string;
  linkedinUrl?: string;
  avatarUrl?: string;
  department?: string;
  seniority?: string;
  selected?: boolean;
}

interface CompanySearchResult {
  id: string;
  name: string;
  domain?: string;
  website?: string;
  industry?: string;
  size?: string;
  location?: string;
  logoUrl?: string;
  linkedinUrl?: string;
  employeeCount?: number;
}

type AddCompanyStep = 'search' | 'employees' | 'enrichment' | 'importing';

export default function CompaniesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  
  // View Company Modal State (for viewing/adding employees to existing company)
  const [viewingCompany, setViewingCompany] = useState<Company | null>(null);
  const [viewTab, setViewTab] = useState<'contacts' | 'find'>('contacts');
  const [companyContacts, setCompanyContacts] = useState<Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    title: string | null;
    linkedinUrl: string | null;
  }>>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);

  // Add Company Flow State
  const [addStep, setAddStep] = useState<AddCompanyStep>('search');
  const [companySearchQuery, setCompanySearchQuery] = useState('');
  const [companyDomainInput, setCompanyDomainInput] = useState('');
  const [companyLinkedinUrl, setCompanyLinkedinUrl] = useState('');
  const [isSearchingCompanies, setIsSearchingCompanies] = useState(false);
  const [foundCompanies, setFoundCompanies] = useState<CompanySearchResult[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<CompanySearchResult | null>(null);
  const [employees, setEmployees] = useState<FoundEmployee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);
  const [employeeError, setEmployeeError] = useState<string | null>(null);
  const [enrichEmail, setEnrichEmail] = useState(true);
  const [enrichPhone, setEnrichPhone] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    companyId: string;
  } | null>(null);

  // Filter options for employees
  const [titleFilter, setTitleFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [seniorityFilter, setSeniorityFilter] = useState('');

  const pageSize = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['companies', page, search],
    queryFn: () => api.getCompanies({ page, pageSize, search: search || undefined }),
  });

  const { data: filterOptions } = useQuery({
    queryKey: ['company-finder-filters'],
    queryFn: () => api.getCompanyFinderFilters(),
    staleTime: Infinity,
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.createCompany>[0]) => api.createCompany(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setShowAddModal(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Parameters<typeof api.updateCompany>[1]) =>
      api.updateCompany(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setEditingCompany(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteCompany(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });

  const enrichMutation = useMutation({
    mutationFn: (id: string) => api.enrichCompany(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      domain: formData.get('domain') as string || undefined,
      website: formData.get('website') as string || undefined,
      industry: formData.get('industry') as string || undefined,
      size: formData.get('size') as string || undefined,
      linkedinUrl: formData.get('linkedinUrl') as string || undefined,
      location: formData.get('location') as string || undefined,
      description: formData.get('description') as string || undefined,
    };

    if (editingCompany) {
      updateMutation.mutate({ id: editingCompany.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  // Reset add company flow
  const resetAddFlow = () => {
    setAddStep('search');
    setCompanySearchQuery('');
    setCompanyDomainInput('');
    setCompanyLinkedinUrl('');
    setFoundCompanies([]);
    setSelectedCompany(null);
    setEmployees([]);
    setEmployeeError(null);
    setEnrichEmail(true);
    setEnrichPhone(true);
    setImportResult(null);
    setTitleFilter('');
    setDepartmentFilter('');
    setSeniorityFilter('');
  };

  const openAddModal = () => {
    resetAddFlow();
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    resetAddFlow();
  };

  // Open company view modal and load existing contacts
  const openViewCompanyModal = async (company: Company) => {
    setViewingCompany(company);
    setViewTab('contacts');
    setIsLoadingContacts(true);
    setCompanyContacts([]);
    setEmployees([]);
    setEmployeeError(null);
    
    // Load existing contacts for this company
    try {
      const result = await api.getContacts({ companyId: company.id, pageSize: 100 });
      setCompanyContacts(result.contacts);
    } catch (error) {
      console.error('Failed to load contacts:', error);
    } finally {
      setIsLoadingContacts(false);
    }
  };

  const closeViewCompanyModal = () => {
    setViewingCompany(null);
    setCompanyContacts([]);
    setEmployees([]);
    setEmployeeError(null);
    setViewTab('contacts');
    setTitleFilter('');
    setDepartmentFilter('');
    setSeniorityFilter('');
  };

  // Find more employees for the viewed company
  const handleFindMoreEmployees = async () => {
    if (!viewingCompany) return;
    
    setIsLoadingEmployees(true);
    setEmployeeError(null);
    setViewTab('find');
    
    try {
      const result = await api.findEmployees({
        companyName: viewingCompany.name,
        companyDomain: viewingCompany.domain ?? undefined,
        companyLinkedinUrl: viewingCompany.linkedinUrl ?? undefined,
        titles: titleFilter ? [titleFilter] : undefined,
        departments: departmentFilter ? [departmentFilter] : undefined,
        seniorities: seniorityFilter ? [seniorityFilter] : undefined,
        limit: 100, // Increased from 50 to get more employees
      });
      
      // Add selection state to employees, exclude those already in contacts
      const existingEmails = new Set(companyContacts.map(c => c.email?.toLowerCase()).filter(Boolean));
      const existingLinkedIns = new Set(companyContacts.map(c => c.linkedinUrl?.toLowerCase()).filter(Boolean));
      
      setEmployees(result.employees.map(e => ({
        ...e,
        selected: !existingEmails.has(e.email?.toLowerCase()) && !existingLinkedIns.has(e.linkedinUrl?.toLowerCase()),
      })));
      
      if (result.employees.length === 0) {
        setEmployeeError('No employees found. Try adjusting filters or check Lead Finder credits.');
      }
    } catch (error: unknown) {
      console.error('Failed to find employees:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      let displayError = errorMessage;
      if (errorMessage.includes('402') || errorMessage.includes('not have enough tokens')) {
        displayError = 'Insufficient Lead Finder credits. Please top up at bettercontact.rocks';
      } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        displayError = 'Invalid API key. Please check your BetterContact API key.';
      }
      
      setEmployeeError(displayError);
      setEmployees([]);
    } finally {
      setIsLoadingEmployees(false);
    }
  };

  // Import employees for viewed company
  const handleImportForViewedCompany = async () => {
    if (!viewingCompany) return;
    
    const selectedEmployees = employees.filter(e => e.selected);
    if (selectedEmployees.length === 0) {
      alert('Please select at least one employee to import');
      return;
    }

    setIsImporting(true);

    try {
      const result = await api.importContactsFromFinder({
        companyName: viewingCompany.name,
        companyDomain: viewingCompany.domain ?? undefined,
        companyWebsite: viewingCompany.website ?? undefined,
        companyIndustry: viewingCompany.industry ?? undefined,
        companySize: viewingCompany.size ?? undefined,
        companyLocation: viewingCompany.location ?? undefined,
        companyLinkedinUrl: viewingCompany.linkedinUrl ?? undefined,
        contacts: selectedEmployees.map(e => ({
          id: e.id,
          firstName: e.firstName,
          lastName: e.lastName,
          fullName: e.fullName,
          email: e.email,
          phone: e.phone,
          title: e.title,
          linkedinUrl: e.linkedinUrl,
          department: e.department,
          seniority: e.seniority,
        })),
        enrichmentOptions: {
          enrichEmail,
          enrichPhone,
        },
      });

      setImportResult({
        imported: result.imported,
        skipped: result.skipped,
        companyId: viewingCompany.id,
      });

      // Refresh contacts
      const refreshed = await api.getContacts({ companyId: viewingCompany.id, pageSize: 100 });
      setCompanyContacts(refreshed.contacts);
      setEmployees([]);
      setViewTab('contacts');
      
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    } catch (error) {
      console.error('Failed to import:', error);
      alert('Failed to import contacts. Please try again.');
    } finally {
      setIsImporting(false);
    }
  };

  // Search for companies
  const handleCompanySearch = async () => {
    if (!companySearchQuery.trim() && !companyDomainInput.trim() && !companyLinkedinUrl.trim()) return;
    
    setIsSearchingCompanies(true);
    setEmployeeError(null);
    
    try {
      // Clean up the domain input - remove protocol, www prefix, and trailing paths
      let cleanDomain = companyDomainInput.trim();
      if (cleanDomain) {
        cleanDomain = cleanDomain
          .replace(/^https?:\/\//i, '')
          .replace(/^www\./i, '')
          .split('/')[0]
          .trim();
      }
      
      // Extract company name from domain if not provided
      const companyName = companySearchQuery.trim() || 
        (cleanDomain ? cleanDomain.split('.')[0] : undefined) || 
        'Company';
      
      // Create a company result from the search inputs
      const searchResult: CompanySearchResult = {
        id: `search-${Date.now()}`,
        name: companyName,
        domain: cleanDomain || undefined,
        website: cleanDomain ? `https://${cleanDomain}` : undefined,
        linkedinUrl: companyLinkedinUrl.trim() || undefined,
      };
      
      setFoundCompanies([searchResult]);
      setSelectedCompany(searchResult);
      setAddStep('employees');
      
      // Automatically load employees
      loadEmployees(searchResult);
    } catch (error) {
      console.error('Failed to search companies:', error);
    } finally {
      setIsSearchingCompanies(false);
    }
  };

  // Load employees for a company
  const loadEmployees = async (company: CompanySearchResult) => {
    setIsLoadingEmployees(true);
    setEmployeeError(null);
    
    try {
      const result = await api.findEmployees({
        companyName: company.name,
        companyDomain: company.domain,
        companyLinkedinUrl: company.linkedinUrl,
        titles: titleFilter ? [titleFilter] : undefined,
        departments: departmentFilter ? [departmentFilter] : undefined,
        seniorities: seniorityFilter ? [seniorityFilter] : undefined,
        limit: 100, // Increased from 50 to get more employees
      });
      
      // Add selection state to employees
      setEmployees(result.employees.map(e => ({ ...e, selected: true })));
      
      if (result.employees.length === 0) {
        setEmployeeError('No employees found. Try providing a company LinkedIn URL for better results.');
      }
    } catch (error: unknown) {
      console.error('Failed to load employees:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Provide clearer error messages for common issues
      let displayError = errorMessage;
      if (errorMessage.includes('402') || errorMessage.includes('not have enough tokens')) {
        displayError = 'Insufficient Lead Finder credits. Note: BetterContact has separate credit pools - Lead Finder credits are different from Enrichment credits. Please top up your Lead Finder credits at bettercontact.rocks';
      } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        displayError = 'Invalid API key. Please check your BetterContact API key in the settings.';
      }
      
      setEmployeeError(displayError);
      setEmployees([]);
    } finally {
      setIsLoadingEmployees(false);
    }
  };

  // Toggle employee selection
  const toggleEmployeeSelection = (id: string) => {
    setEmployees(prev => prev.map(e => 
      e.id === id ? { ...e, selected: !e.selected } : e
    ));
  };

  // Select/deselect all employees
  const toggleSelectAll = () => {
    const allSelected = employees.every(e => e.selected);
    setEmployees(prev => prev.map(e => ({ ...e, selected: !allSelected })));
  };

  // Import selected contacts
  const handleImport = async () => {
    if (!selectedCompany) return;
    
    const selectedEmployees = employees.filter(e => e.selected);
    if (selectedEmployees.length === 0) {
      alert('Please select at least one contact to import');
      return;
    }

    setIsImporting(true);
    setAddStep('importing');
    
    try {
      const result = await api.importContactsFromFinder({
        companyName: selectedCompany.name,
        companyDomain: selectedCompany.domain,
        companyWebsite: selectedCompany.website,
        companyIndustry: selectedCompany.industry,
        companySize: selectedCompany.size,
        companyLocation: selectedCompany.location,
        companyLinkedinUrl: selectedCompany.linkedinUrl,
        contacts: selectedEmployees.map(e => ({
          id: e.id,
          firstName: e.firstName,
          lastName: e.lastName,
          fullName: e.fullName,
          title: e.title,
          email: e.email,
          phone: e.phone,
          linkedinUrl: e.linkedinUrl,
          department: e.department,
          seniority: e.seniority,
        })),
        enrichmentOptions: {
          enrichEmail,
          enrichPhone,
        },
      });

      setImportResult({
        imported: result.imported,
        skipped: result.skipped,
        companyId: result.company.id,
      });
      
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    } catch (error) {
      console.error('Failed to import contacts:', error);
      alert('Failed to import contacts. Please try again.');
    } finally {
      setIsImporting(false);
    }
  };

  const selectedCount = employees.filter(e => e.selected).length;
  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-surface-800 px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-surface-100">Companies</h1>
          <p className="text-sm text-surface-500">
            {data?.total ?? 0} companies
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
        >
          <Plus size={16} />
          Add Company
        </button>
      </header>

      {/* Search */}
      <div className="border-b border-surface-800 px-6 py-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500"
            />
            <input
              type="text"
              placeholder="Search companies..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full rounded-lg border border-surface-700 bg-surface-800 py-2 pl-10 pr-4 text-sm text-surface-100 placeholder-surface-500 focus:border-primary-500 focus:outline-none"
            />
          </div>
          <button
            onClick={handleSearch}
            className="rounded-lg bg-surface-800 px-4 py-2 text-sm font-medium text-surface-300 transition-colors hover:bg-surface-700"
          >
            Search
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
          </div>
        ) : !data?.companies?.length ? (
          <div className="flex h-64 flex-col items-center justify-center text-surface-500">
            <Building2 size={48} className="mb-4 opacity-50" />
            <p>No companies found</p>
            <button
              onClick={openAddModal}
              className="mt-4 text-primary-400 hover:underline"
            >
              Add your first company
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.companies.map((company) => (
              <div
                key={company.id}
                onClick={() => openViewCompanyModal(company)}
                className="group relative cursor-pointer rounded-xl border border-surface-800 bg-surface-900 p-5 transition-colors hover:border-primary-500/50 hover:shadow-lg hover:shadow-primary-500/5"
              >
                {/* Menu */}
                <div className="absolute right-3 top-3" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setOpenMenuId(openMenuId === company.id ? null : company.id)}
                    className="rounded p-1 text-surface-500 opacity-0 transition-opacity hover:bg-surface-700 group-hover:opacity-100"
                  >
                    <MoreVertical size={16} />
                  </button>
                  {openMenuId === company.id && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setOpenMenuId(null)}
                      />
                      <div className="absolute right-0 top-8 z-20 w-36 rounded-lg border border-surface-700 bg-surface-800 py-1 shadow-lg">
                        <button
                          onClick={() => {
                            setEditingCompany(company);
                            setOpenMenuId(null);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-surface-300 hover:bg-surface-700"
                        >
                          <Edit size={14} />
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            enrichMutation.mutate(company.id);
                            setOpenMenuId(null);
                          }}
                          disabled={!company.domain}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-surface-300 hover:bg-surface-700 disabled:opacity-50"
                        >
                          <Sparkles size={14} />
                          Enrich
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Delete this company?')) {
                              deleteMutation.mutate(company.id);
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

                {/* Logo & Name */}
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-800 text-lg font-bold text-surface-400">
                    {company.logoUrl ? (
                      <img
                        src={company.logoUrl}
                        alt=""
                        className="h-full w-full rounded-lg object-contain"
                      />
                    ) : (
                      company.name[0].toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <h3 className="truncate font-semibold text-surface-100">
                      {company.name}
                    </h3>
                    {company.domain && (
                      <a
                        href={company.website ?? `https://${company.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-primary-400 hover:underline"
                      >
                        <Globe size={10} />
                        {company.domain}
                      </a>
                    )}
                  </div>
                </div>

                {/* Details */}
                <div className="mb-4 space-y-2 text-sm">
                  {company.industry && (
                    <p className="text-surface-400">
                      <span className="text-surface-500">Industry:</span> {company.industry}
                    </p>
                  )}
                  {company.size && (
                    <p className="text-surface-400">
                      <span className="text-surface-500">Size:</span> {company.size}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-surface-400">
                    <Users size={14} />
                    <span>{company.contactCount} contacts</span>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-surface-800 pt-3">
                  {company.enrichedAt ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-400">
                      <Check size={12} />
                      Enriched {format(new Date(company.enrichedAt), 'MMM d')}
                    </span>
                  ) : (
                    <span className="text-xs text-surface-500">Not enriched</span>
                  )}
                  {company.linkedinUrl && (
                    <a
                      href={company.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-surface-500 hover:text-primary-400"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-surface-800 px-6 py-3">
          <p className="text-sm text-surface-500">
            Showing {(page - 1) * pageSize + 1} to{' '}
            {Math.min(page * pageSize, data?.total ?? 0)} of {data?.total ?? 0}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-surface-700 p-2 text-surface-400 transition-colors hover:bg-surface-800 disabled:opacity-50"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-surface-400">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-surface-700 p-2 text-surface-400 transition-colors hover:bg-surface-800 disabled:opacity-50"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Add Company Modal - BetterContact Flow */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-surface-700 bg-surface-900 shadow-xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-surface-800 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-surface-100">
                  {addStep === 'search' && 'Find Company'}
                  {addStep === 'employees' && `Select Contacts from ${selectedCompany?.name}`}
                  {addStep === 'enrichment' && 'Enrichment Options'}
                  {addStep === 'importing' && 'Importing Contacts'}
                </h2>
                <p className="text-sm text-surface-500">
                  {addStep === 'search' && 'Search for a company to find employees'}
                  {addStep === 'employees' && `${selectedCount} of ${employees.length} contacts selected`}
                  {addStep === 'enrichment' && 'Choose what data to enrich'}
                  {addStep === 'importing' && (isImporting ? 'Please wait...' : 'Import complete!')}
                </p>
              </div>
              <button
                onClick={closeAddModal}
                className="text-surface-500 hover:text-surface-300"
              >
                <X size={20} />
              </button>
            </div>

            {/* Step 1: Search Company */}
            {addStep === 'search' && (
              <div className="flex-1 overflow-auto p-6">
                <div className="mx-auto max-w-md space-y-6">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600/20">
                      <Building2 size={32} className="text-primary-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-surface-100">
                      Find a Company
                    </h3>
                    <p className="mt-1 text-sm text-surface-500">
                      Enter a company name or domain to find employees
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                      <p className="text-sm text-amber-200">
                        <strong>Tip:</strong> Enter a company domain (e.g., stripe.com) for best results. 
                        The BetterContact Lead Finder API will search for real employees at this company.
                      </p>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-surface-300">
                        Company Domain <span className="text-green-400">(Recommended)</span>
                      </label>
                      <input
                        type="text"
                        value={companyDomainInput}
                        onChange={(e) => setCompanyDomainInput(e.target.value)}
                        placeholder="e.g., stripe.com"
                        className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-3 text-surface-100 placeholder-surface-500 focus:border-primary-500 focus:outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && handleCompanySearch()}
                      />
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="h-px flex-1 bg-surface-700" />
                      <span className="text-sm text-surface-500">or</span>
                      <div className="h-px flex-1 bg-surface-700" />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-surface-300">
                        Company Name
                      </label>
                      <input
                        type="text"
                        value={companySearchQuery}
                        onChange={(e) => setCompanySearchQuery(e.target.value)}
                        placeholder="e.g., Stripe, Notion, Figma"
                        className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-3 text-surface-100 placeholder-surface-500 focus:border-primary-500 focus:outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && handleCompanySearch()}
                      />
                    </div>

                    <button
                      onClick={handleCompanySearch}
                      disabled={(!companySearchQuery.trim() && !companyDomainInput.trim()) || isSearchingCompanies}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-3 font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
                    >
                      {isSearchingCompanies ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Search size={18} />
                      )}
                      Find Employees
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Select Employees */}
            {addStep === 'employees' && (
              <>
                <div className="flex-1 overflow-auto">
                  {/* Filters */}
                  <div className="border-b border-surface-800 px-6 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 text-sm text-surface-500">
                        <Filter size={14} />
                        Filters:
                      </div>
                      <select
                        value={departmentFilter}
                        onChange={(e) => {
                          setDepartmentFilter(e.target.value);
                          if (selectedCompany) loadEmployees(selectedCompany);
                        }}
                        className="rounded-lg border border-surface-700 bg-surface-800 px-3 py-1.5 text-sm text-surface-300"
                      >
                        <option value="">All Departments</option>
                        {filterOptions?.departments.map((d) => (
                          <option key={d.value} value={d.value}>{d.label}</option>
                        ))}
                      </select>
                      <select
                        value={seniorityFilter}
                        onChange={(e) => {
                          setSeniorityFilter(e.target.value);
                          if (selectedCompany) loadEmployees(selectedCompany);
                        }}
                        className="rounded-lg border border-surface-700 bg-surface-800 px-3 py-1.5 text-sm text-surface-300"
                      >
                        <option value="">All Seniorities</option>
                        {filterOptions?.seniorities.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={titleFilter}
                        onChange={(e) => setTitleFilter(e.target.value)}
                        placeholder="Filter by title..."
                        className="rounded-lg border border-surface-700 bg-surface-800 px-3 py-1.5 text-sm text-surface-300 placeholder-surface-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && selectedCompany) {
                            loadEmployees(selectedCompany);
                          }
                        }}
                      />
                      <button
                        onClick={() => selectedCompany && loadEmployees(selectedCompany)}
                        className="rounded-lg bg-surface-800 px-3 py-1.5 text-sm text-surface-300 hover:bg-surface-700"
                      >
                        Apply
                      </button>
                    </div>
                  </div>

                  {/* Select All / Count */}
                  <div className="flex items-center justify-between border-b border-surface-800 px-6 py-2">
                    <button
                      onClick={toggleSelectAll}
                      className="flex items-center gap-2 text-sm text-surface-400 hover:text-surface-200"
                    >
                      {employees.every(e => e.selected) ? (
                        <CheckSquare size={16} className="text-primary-400" />
                      ) : (
                        <Square size={16} />
                      )}
                      {employees.every(e => e.selected) ? 'Deselect All' : 'Select All'}
                    </button>
                    <span className="text-sm text-surface-500">
                      {selectedCount} selected
                    </span>
                  </div>

                  {/* Employee List */}
                  <div className="p-6">
                    {isLoadingEmployees ? (
                      <div className="flex h-48 items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
                        <span className="ml-3 text-surface-500">Finding employees via BetterContact...</span>
                      </div>
                    ) : employeeError ? (
                      <div className="flex h-48 flex-col items-center justify-center">
                        <AlertCircle size={32} className="mb-2 text-red-400" />
                        <p className="text-center text-red-400">{employeeError}</p>
                        <button
                          onClick={() => setAddStep('search')}
                          className="mt-4 text-primary-400 hover:underline"
                        >
                          Go back and try with a LinkedIn URL
                        </button>
                      </div>
                    ) : employees.length === 0 ? (
                      <div className="flex h-48 flex-col items-center justify-center text-surface-500">
                        <Users size={32} className="mb-2 opacity-50" />
                        <p>No employees found</p>
                        <p className="text-sm">Try providing a company LinkedIn URL for better results</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {employees.map((employee) => (
                          <div
                            key={employee.id}
                            onClick={() => toggleEmployeeSelection(employee.id)}
                            className={`flex cursor-pointer items-center gap-4 rounded-lg border p-4 transition-colors ${
                              employee.selected
                                ? 'border-primary-500 bg-primary-500/10'
                                : 'border-surface-700 bg-surface-800 hover:border-surface-600'
                            }`}
                          >
                            <div className="flex h-5 w-5 items-center justify-center">
                              {employee.selected ? (
                                <CheckSquare size={20} className="text-primary-400" />
                              ) : (
                                <Square size={20} className="text-surface-500" />
                              )}
                            </div>
                            
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-700 text-sm font-medium text-surface-300">
                              {employee.firstName[0]}{employee.lastName[0]}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-surface-100 truncate">
                                {employee.fullName}
                              </p>
                              <p className="text-sm text-surface-500 truncate">
                                {employee.title || 'No title'}
                              </p>
                            </div>

                            <div className="flex items-center gap-4 text-sm">
                              {employee.email ? (
                                <span className="flex items-center gap-1 text-green-400">
                                  <Mail size={14} />
                                  <span className="hidden sm:inline">{employee.email}</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-surface-500">
                                  <Mail size={14} />
                                  <span className="hidden sm:inline">No email</span>
                                </span>
                              )}
                              {employee.phone ? (
                                <span className="flex items-center gap-1 text-green-400">
                                  <Phone size={14} />
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-surface-500">
                                  <Phone size={14} />
                                </span>
                              )}
                              {employee.linkedinUrl && (
                                <a
                                  href={employee.linkedinUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-blue-400 hover:text-blue-300"
                                >
                                  <ExternalLink size={14} />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Enrichment Options & Actions */}
                <div className="border-t border-surface-800 px-6 py-4">
                  <div className="mb-4 flex flex-wrap items-center gap-4">
                    <span className="text-sm font-medium text-surface-300">Enrich with:</span>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={enrichEmail}
                        onChange={(e) => setEnrichEmail(e.target.checked)}
                        className="h-4 w-4 rounded border-surface-600 bg-surface-800 text-primary-500 focus:ring-primary-500"
                      />
                      <Mail size={16} className="text-surface-400" />
                      <span className="text-sm text-surface-300">Email</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={enrichPhone}
                        onChange={(e) => setEnrichPhone(e.target.checked)}
                        className="h-4 w-4 rounded border-surface-600 bg-surface-800 text-primary-500 focus:ring-primary-500"
                      />
                      <Phone size={16} className="text-surface-400" />
                      <span className="text-sm text-surface-300">Phone</span>
                    </label>
                    {(enrichEmail || enrichPhone) && (
                      <span className="flex items-center gap-1 text-xs text-amber-400">
                        <Sparkles size={12} />
                        Enrichment will use BetterContact credits
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setAddStep('search')}
                      className="flex items-center gap-2 rounded-lg border border-surface-700 px-4 py-2 text-sm font-medium text-surface-300 transition-colors hover:bg-surface-800"
                    >
                      <ChevronLeft size={16} />
                      Back
                    </button>
                    <button
                      onClick={handleImport}
                      disabled={selectedCount === 0}
                      className="flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
                    >
                      <UserPlus size={16} />
                      Import {selectedCount} Contacts
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Step 3: Importing / Complete */}
            {addStep === 'importing' && (
              <div className="flex flex-1 flex-col items-center justify-center p-6">
                {isImporting ? (
                  <>
                    <Loader2 className="h-16 w-16 animate-spin text-primary-500" />
                    <h3 className="mt-4 text-lg font-semibold text-surface-100">
                      Importing Contacts
                    </h3>
                    <p className="mt-2 text-surface-500">
                      {enrichEmail || enrichPhone
                        ? 'Enriching and importing contacts...'
                        : 'Importing contacts...'}
                    </p>
                  </>
                ) : importResult ? (
                  <>
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
                      <Check size={32} className="text-green-400" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-surface-100">
                      Import Complete!
                    </h3>
                    <p className="mt-2 text-surface-500">
                      Successfully imported {importResult.imported} contacts
                      {importResult.skipped > 0 && ` (${importResult.skipped} skipped)`}
                    </p>
                    <div className="mt-6 flex gap-3">
                      <button
                        onClick={closeAddModal}
                        className="rounded-lg border border-surface-700 px-4 py-2 text-sm font-medium text-surface-300 hover:bg-surface-800"
                      >
                        Close
                      </button>
                      <button
                        onClick={() => {
                          closeAddModal();
                          // Navigate to contacts (could use router.push)
                        }}
                        className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                      >
                        View Contacts
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertCircle size={48} className="text-red-400" />
                    <h3 className="mt-4 text-lg font-semibold text-surface-100">
                      Import Failed
                    </h3>
                    <p className="mt-2 text-surface-500">
                      Something went wrong. Please try again.
                    </p>
                    <button
                      onClick={() => setAddStep('employees')}
                      className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                    >
                      Try Again
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Modal (keep original for editing) */}
      {editingCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-surface-700 bg-surface-900 shadow-xl">
            <div className="flex items-center justify-between border-b border-surface-800 px-6 py-4">
              <h2 className="text-lg font-semibold text-surface-100">
                Edit Company
              </h2>
              <button
                onClick={() => setEditingCompany(null)}
                className="text-surface-500 hover:text-surface-300"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 p-6">
              <div>
                <label className="mb-1 block text-sm font-medium text-surface-300">
                  Company Name *
                </label>
                <input
                  name="name"
                  required
                  defaultValue={editingCompany.name}
                  className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-surface-300">
                  Domain
                </label>
                <input
                  name="domain"
                  placeholder="example.com"
                  defaultValue={editingCompany.domain ?? ''}
                  className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-surface-300">
                  Website
                </label>
                <input
                  name="website"
                  type="url"
                  placeholder="https://example.com"
                  defaultValue={editingCompany.website ?? ''}
                  className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-surface-300">
                    Industry
                  </label>
                  <input
                    name="industry"
                    defaultValue={editingCompany.industry ?? ''}
                    className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-surface-300">
                    Size
                  </label>
                  <select
                    name="size"
                    defaultValue={editingCompany.size ?? ''}
                    className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                  >
                    <option value="">Select size</option>
                    <option value="1-10">1-10</option>
                    <option value="11-50">11-50</option>
                    <option value="51-200">51-200</option>
                    <option value="201-500">201-500</option>
                    <option value="501-1000">501-1000</option>
                    <option value="1001-5000">1001-5000</option>
                    <option value="5001+">5001+</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-surface-300">
                  LinkedIn URL
                </label>
                <input
                  name="linkedinUrl"
                  type="url"
                  defaultValue={editingCompany.linkedinUrl ?? ''}
                  className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingCompany(null)}
                  className="rounded-lg border border-surface-700 px-4 py-2 text-sm font-medium text-surface-300 transition-colors hover:bg-surface-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
                >
                  {updateMutation.isPending && (
                    <Loader2 size={16} className="animate-spin" />
                  )}
                  Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Company Modal - View contacts and find more employees */}
      {viewingCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex h-[90vh] w-full max-w-5xl flex-col rounded-xl border border-surface-700 bg-surface-900 shadow-xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-surface-800 px-6 py-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-800 text-lg font-bold text-surface-400">
                  {viewingCompany.logoUrl ? (
                    <img
                      src={viewingCompany.logoUrl}
                      alt=""
                      className="h-full w-full rounded-lg object-contain"
                    />
                  ) : (
                    viewingCompany.name[0].toUpperCase()
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-surface-100">
                    {viewingCompany.name}
                  </h2>
                  <p className="text-sm text-surface-400">
                    {viewingCompany.domain ?? 'No domain'} • {viewingCompany.contactCount} contacts
                  </p>
                </div>
              </div>
              <button
                onClick={closeViewCompanyModal}
                className="text-surface-500 hover:text-surface-300"
              >
                <X size={20} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-surface-800">
              <button
                onClick={() => setViewTab('contacts')}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                  viewTab === 'contacts'
                    ? 'border-b-2 border-primary-500 text-primary-400'
                    : 'text-surface-400 hover:text-surface-200'
                }`}
              >
                <Users size={16} />
                Existing Contacts ({companyContacts.length})
              </button>
              <button
                onClick={() => {
                  setViewTab('find');
                  if (employees.length === 0 && !isLoadingEmployees) {
                    handleFindMoreEmployees();
                  }
                }}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                  viewTab === 'find'
                    ? 'border-b-2 border-primary-500 text-primary-400'
                    : 'text-surface-400 hover:text-surface-200'
                }`}
              >
                <Search size={16} />
                Find More Employees
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-auto">
              {viewTab === 'contacts' && (
                <div className="p-6">
                  {isLoadingContacts ? (
                    <div className="flex h-48 items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
                    </div>
                  ) : companyContacts.length === 0 ? (
                    <div className="flex h-48 flex-col items-center justify-center text-surface-500">
                      <Users size={48} className="mb-4 opacity-50" />
                      <p>No contacts yet</p>
                      <button
                        onClick={() => {
                          setViewTab('find');
                          handleFindMoreEmployees();
                        }}
                        className="mt-4 text-primary-400 hover:underline"
                      >
                        Find employees to import
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-surface-800">
                      <table className="w-full">
                        <thead className="bg-surface-800/50">
                          <tr className="text-left text-xs font-medium uppercase tracking-wider text-surface-500">
                            <th className="px-4 py-3">Name</th>
                            <th className="px-4 py-3">Title</th>
                            <th className="px-4 py-3">Email</th>
                            <th className="px-4 py-3">Phone</th>
                            <th className="px-4 py-3">LinkedIn</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-800">
                          {companyContacts.map((contact) => (
                            <tr key={contact.id} className="hover:bg-surface-800/30">
                              <td className="px-4 py-3 text-sm text-surface-200">
                                {contact.firstName} {contact.lastName}
                              </td>
                              <td className="px-4 py-3 text-sm text-surface-400">
                                {contact.title ?? '—'}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {contact.email ? (
                                  <a href={`mailto:${contact.email}`} className="text-primary-400 hover:underline">
                                    {contact.email}
                                  </a>
                                ) : (
                                  <span className="text-surface-500">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {contact.phone ? (
                                  <a href={`tel:${contact.phone}`} className="text-primary-400 hover:underline">
                                    {contact.phone}
                                  </a>
                                ) : (
                                  <span className="text-surface-500">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {contact.linkedinUrl ? (
                                  <a
                                    href={contact.linkedinUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary-400 hover:text-primary-300"
                                  >
                                    <ExternalLink size={14} />
                                  </a>
                                ) : (
                                  <span className="text-surface-500">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {viewTab === 'find' && (
                <div className="flex h-full flex-col">
                  {/* Filters */}
                  <div className="border-b border-surface-800 px-6 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <Filter size={16} className="text-surface-500" />
                      <select
                        value={departmentFilter}
                        onChange={(e) => setDepartmentFilter(e.target.value)}
                        className="rounded-lg border border-surface-700 bg-surface-800 px-3 py-1.5 text-sm text-surface-300"
                      >
                        <option value="">All Departments</option>
                        {filterOptions?.departments.map((d) => (
                          <option key={d.value} value={d.value}>{d.label}</option>
                        ))}
                      </select>
                      <select
                        value={seniorityFilter}
                        onChange={(e) => setSeniorityFilter(e.target.value)}
                        className="rounded-lg border border-surface-700 bg-surface-800 px-3 py-1.5 text-sm text-surface-300"
                      >
                        <option value="">All Seniorities</option>
                        {filterOptions?.seniorities.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={titleFilter}
                        onChange={(e) => setTitleFilter(e.target.value)}
                        placeholder="Filter by title..."
                        className="rounded-lg border border-surface-700 bg-surface-800 px-3 py-1.5 text-sm text-surface-300 placeholder-surface-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleFindMoreEmployees();
                          }
                        }}
                      />
                      <button
                        onClick={handleFindMoreEmployees}
                        disabled={isLoadingEmployees}
                        className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                      >
                        {isLoadingEmployees ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Search size={14} />
                        )}
                        Search
                      </button>
                    </div>
                  </div>

                  {/* Employees List */}
                  <div className="flex-1 overflow-auto p-6">
                    {isLoadingEmployees ? (
                      <div className="flex h-48 flex-col items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
                        <p className="mt-4 text-sm text-surface-400">
                          Finding employees at {viewingCompany.name}...
                        </p>
                      </div>
                    ) : employeeError ? (
                      <div className="flex h-48 flex-col items-center justify-center text-center">
                        <AlertCircle size={48} className="mb-4 text-red-400 opacity-70" />
                        <p className="text-red-400">{employeeError}</p>
                        <button
                          onClick={handleFindMoreEmployees}
                          className="mt-4 text-primary-400 hover:underline"
                        >
                          Try again
                        </button>
                      </div>
                    ) : employees.length === 0 ? (
                      <div className="flex h-48 flex-col items-center justify-center text-surface-500">
                        <Search size={48} className="mb-4 opacity-50" />
                        <p>Click Search to find employees</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* Select All */}
                        <div className="flex items-center justify-between pb-2">
                          <button
                            onClick={() => {
                              const allSelected = employees.every(e => e.selected);
                              setEmployees(employees.map(e => ({ ...e, selected: !allSelected })));
                            }}
                            className="flex items-center gap-2 text-sm text-surface-400 hover:text-surface-200"
                          >
                            {employees.every(e => e.selected) ? (
                              <CheckSquare size={16} className="text-primary-400" />
                            ) : (
                              <Square size={16} />
                            )}
                            {employees.every(e => e.selected) ? 'Deselect All' : 'Select All'}
                          </button>
                          <span className="text-sm text-surface-500">
                            {employees.filter(e => e.selected).length} selected
                          </span>
                        </div>

                        {/* Employee Cards */}
                        <div className="grid gap-2 sm:grid-cols-2">
                          {employees.map((emp) => (
                            <div
                              key={emp.id}
                              onClick={() => {
                                setEmployees(employees.map(e =>
                                  e.id === emp.id ? { ...e, selected: !e.selected } : e
                                ));
                              }}
                              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                                emp.selected
                                  ? 'border-primary-500/50 bg-primary-500/10'
                                  : 'border-surface-700 bg-surface-800/50 hover:border-surface-600'
                              }`}
                            >
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-700 text-sm font-medium text-surface-300">
                                {emp.firstName[0]}{emp.lastName[0]}
                              </div>
                              <div className="flex-1 overflow-hidden">
                                <p className="truncate font-medium text-surface-200">
                                  {emp.fullName}
                                </p>
                                <p className="truncate text-xs text-surface-400">
                                  {emp.title ?? 'No title'}
                                </p>
                              </div>
                              {emp.selected ? (
                                <Check size={16} className="text-primary-400" />
                              ) : (
                                <Plus size={16} className="text-surface-500" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Import Options & Button */}
                  {employees.length > 0 && employees.some(e => e.selected) && (
                    <div className="border-t border-surface-800 px-6 py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 text-sm text-surface-300">
                            <input
                              type="checkbox"
                              checked={enrichEmail}
                              onChange={(e) => setEnrichEmail(e.target.checked)}
                              className="rounded border-surface-600 bg-surface-800 text-primary-500"
                            />
                            <Mail size={14} />
                            Enrich Emails
                          </label>
                          <label className="flex items-center gap-2 text-sm text-surface-300">
                            <input
                              type="checkbox"
                              checked={enrichPhone}
                              onChange={(e) => setEnrichPhone(e.target.checked)}
                              className="rounded border-surface-600 bg-surface-800 text-primary-500"
                            />
                            <Phone size={14} />
                            Enrich Phones
                          </label>
                        </div>
                        <button
                          onClick={handleImportForViewedCompany}
                          disabled={isImporting}
                          className="flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                        >
                          {isImporting ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              Importing...
                            </>
                          ) : (
                            <>
                              <UserPlus size={16} />
                              Import {employees.filter(e => e.selected).length} Contacts
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
