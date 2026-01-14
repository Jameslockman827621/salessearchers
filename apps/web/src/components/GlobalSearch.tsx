'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, User, Building2, Briefcase, Calendar, CheckSquare, FileText, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  avatarUrl?: string | null;
  url: string;
}

const typeIcons: Record<string, React.ReactNode> = {
  contact: <User className="h-4 w-4" />,
  company: <Building2 className="h-4 w-4" />,
  deal: <Briefcase className="h-4 w-4" />,
  meeting: <Calendar className="h-4 w-4" />,
  task: <CheckSquare className="h-4 w-4" />,
  data_room: <FileText className="h-4 w-4" />,
  sequence: <FileText className="h-4 w-4" />,
};

const typeColors: Record<string, string> = {
  contact: 'text-blue-400 bg-blue-400/20',
  company: 'text-purple-400 bg-purple-400/20',
  deal: 'text-emerald-400 bg-emerald-400/20',
  meeting: 'text-amber-400 bg-amber-400/20',
  task: 'text-pink-400 bg-pink-400/20',
  data_room: 'text-cyan-400 bg-cyan-400/20',
  sequence: 'text-indigo-400 bg-indigo-400/20',
};

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const data = await api.globalSearch(query, undefined, 10);
        setResults(data.results);
        setSelectedIndex(0);
      } catch (err) {
        console.error('Search error:', err);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Open search with Cmd/Ctrl + K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }

      // Close with Escape
      if (e.key === 'Escape') {
        setIsOpen(false);
        setQuery('');
        setResults([]);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Navigation within results
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    }
  }, [results, selectedIndex]);

  const handleSelect = (result: SearchResult) => {
    router.push(result.url);
    setIsOpen(false);
    setQuery('');
    setResults([]);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 bg-gray-800/50 border border-gray-700 rounded-lg hover:bg-gray-800 hover:text-white transition-colors"
      >
        <Search className="h-4 w-4" />
        <span>Search...</span>
        <kbd className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono bg-gray-700 rounded">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={() => {
          setIsOpen(false);
          setQuery('');
          setResults([]);
        }}
      />

      {/* Search Modal */}
      <div className="fixed inset-x-4 top-[15%] mx-auto max-w-2xl bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
          <Search className="h-5 w-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search contacts, companies, deals, meetings..."
            className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-sm"
            autoFocus
          />
          {isLoading && <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />}
          <button
            onClick={() => {
              setIsOpen(false);
              setQuery('');
              setResults([]);
            }}
            className="p-1 text-gray-400 hover:text-white rounded"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {results.length > 0 ? (
            <div className="py-2">
              {results.map((result, idx) => (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleSelect(result)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800 transition-colors ${
                    idx === selectedIndex ? 'bg-gray-800' : ''
                  }`}
                >
                  {/* Avatar or Icon */}
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${typeColors[result.type] ?? 'text-gray-400 bg-gray-700'}`}>
                    {result.avatarUrl ? (
                      <img src={result.avatarUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    ) : (
                      typeIcons[result.type] ?? <FileText className="h-4 w-4" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{result.title}</p>
                    {result.subtitle && (
                      <p className="text-xs text-gray-400 truncate">{result.subtitle}</p>
                    )}
                  </div>

                  {/* Type Badge */}
                  <span className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400 capitalize">
                    {result.type.replace('_', ' ')}
                  </span>
                </button>
              ))}
            </div>
          ) : query.trim() && !isLoading ? (
            <div className="py-12 text-center">
              <Search className="h-10 w-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">No results found for &quot;{query}&quot;</p>
              <p className="text-gray-500 text-xs mt-1">Try a different search term</p>
            </div>
          ) : !query.trim() ? (
            <div className="py-8 px-4">
              <p className="text-gray-500 text-sm text-center mb-4">Search across all your data</p>
              <div className="grid grid-cols-3 gap-2">
                {['Contacts', 'Companies', 'Deals', 'Meetings', 'Tasks', 'Data Rooms'].map((type) => (
                  <button
                    key={type}
                    onClick={() => setQuery(type.toLowerCase())}
                    className="px-3 py-2 text-xs text-gray-400 bg-gray-800 rounded-lg hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-800 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">↑↓</kbd> Navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">↵</kbd> Select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">esc</kbd> Close
          </span>
        </div>
      </div>
    </>
  );
}

