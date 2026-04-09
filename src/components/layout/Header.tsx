import { useState, useEffect, useRef } from 'react';
import { Menu, Search, LayoutGrid, List, ArrowUpDown, ChevronDown } from 'lucide-react';

export type ViewMode = 'grid' | 'list';
export type SortField = 'name' | 'size' | 'created_at' | 'mime_type';
export type SortOrder = 'asc' | 'desc';

interface HeaderProps {
  onMenuClick: () => void;
  onSearch: (term: string) => void;
  title: string;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  sortField?: SortField;
  sortOrder?: SortOrder;
  onSortChange?: (field: SortField, order: SortOrder) => void;
}

export function Header({
  onMenuClick, onSearch, title,
  viewMode = 'grid', onViewModeChange,
  sortField = 'created_at', sortOrder = 'desc', onSortChange,
}: HeaderProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOpen, setSortOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearch(value), 300);
  };

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const sortOptions: { field: SortField; label: string }[] = [
    { field: 'name', label: 'Name' },
    { field: 'size', label: 'Size' },
    { field: 'created_at', label: 'Date' },
    { field: 'mime_type', label: 'Type' },
  ];

  const currentSortLabel = sortOptions.find(s => s.field === sortField)?.label || 'Date';

  return (
    <header className="bg-gray-900 border-b border-gray-800 px-4 lg:px-6 py-3 flex items-center gap-3">
      <button onClick={onMenuClick} className="lg:hidden text-gray-400 hover:text-white cursor-pointer">
        <Menu className="w-6 h-6" />
      </button>

      <h1 className="text-lg font-semibold text-white flex-shrink-0">{title}</h1>

      {/* Search */}
      <div className="flex-1 max-w-md ml-auto">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search files..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Sort dropdown */}
      {onSortChange && (
        <div className="relative hidden sm:block">
          <button
            onClick={() => setSortOpen(!sortOpen)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-300 hover:text-white hover:border-gray-600 transition-colors cursor-pointer"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>{currentSortLabel}</span>
            <ChevronDown className="w-3 h-3" />
          </button>

          {sortOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 w-40">
                {sortOptions.map((opt) => (
                  <button
                    key={opt.field}
                    onClick={() => {
                      if (sortField === opt.field) {
                        onSortChange(opt.field, sortOrder === 'asc' ? 'desc' : 'asc');
                      } else {
                        onSortChange(opt.field, opt.field === 'name' ? 'asc' : 'desc');
                      }
                      setSortOpen(false);
                    }}
                    className={`flex items-center justify-between w-full px-3 py-2 text-sm cursor-pointer ${
                      sortField === opt.field ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {opt.label}
                    {sortField === opt.field && (
                      <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* View toggle */}
      {onViewModeChange && (
        <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg p-0.5">
          <button
            onClick={() => onViewModeChange('grid')}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              viewMode === 'grid' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
            title="Grid view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewModeChange('list')}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              viewMode === 'list' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
            title="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      )}
    </header>
  );
}
