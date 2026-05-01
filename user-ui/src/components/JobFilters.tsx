/**
 * Job Filters Component
 * Sidebar with filtering options
 */

'use client';

import React, { useState } from 'react';

const TECH_OPTIONS = [
  'Kubernetes',
  'AWS',
  'Google Cloud',
  'Azure',
  'Docker',
  'Terraform',
  'Go',
  'Rust',
  'Python',
  'Java',
  'JavaScript',
  'DevOps',
  'SRE',
  'Infrastructure',
];

const LOCATION_OPTIONS = [
  'Remote',
  'France',
  'Germany',
  'Netherlands',
  'UK',
  'EU',
  'Canada',
  'US',
];

const SENIORITY_OPTIONS = [
  'Junior',
  'Mid',
  'Senior',
  'Lead',
];

interface JobFiltersProps {
  filters: {
    location: string;
    company: string;
    tech: string[];
    minScore: number;
    search: string;
    sortBy: 'posted_at' | 'relevance_score' | 'title' | 'company_name';
    order: 'ASC' | 'DESC';
  };
  onFilterChange: (filters: any) => void;
}

export default function JobFilters({ filters, onFilterChange }: JobFiltersProps) {
  const [expandedSections, setExpandedSections] = useState({
    search: true,
    location: true,
    tech: true,
    score: true,
    sort: false,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({ ...filters, search: e.target.value });
  };

  const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({ ...filters, location: e.target.value });
  };

  const handleCompanyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({ ...filters, company: e.target.value });
  };

  const handleTechToggle = (tech: string) => {
    const newTechs = filters.tech.includes(tech)
      ? filters.tech.filter((t) => t !== tech)
      : [...filters.tech, tech];
    onFilterChange({ ...filters, tech: newTechs });
  };

  const handleScoreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({ ...filters, minScore: parseInt(e.target.value, 10) });
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFilterChange({ ...filters, sortBy: e.target.value as any });
  };

  const handleOrderChange = (order: 'ASC' | 'DESC') => {
    onFilterChange({ ...filters, order });
  };

  const handleClearFilters = () => {
    onFilterChange({
      location: '',
      company: '',
      tech: [],
      minScore: 0,
      search: '',
      sortBy: 'posted_at',
      order: 'DESC',
    });
  };

  const activeFilterCount =
    (filters.search ? 1 : 0) +
    (filters.location ? 1 : 0) +
    (filters.company ? 1 : 0) +
    (filters.tech.length > 0 ? 1 : 0) +
    (filters.minScore > 0 ? 1 : 0);

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center justify-between">
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-2 inline-flex items-center justify-center w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full">
              {activeFilterCount}
            </span>
          )}
        </h2>
        {activeFilterCount > 0 && (
          <button
            onClick={handleClearFilters}
            className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Search */}
        <FilterSection
          title="Search"
          expanded={expandedSections.search}
          onToggle={() => toggleSection('search')}
        >
          <input
            type="text"
            placeholder="Search jobs..."
            value={filters.search}
            onChange={handleSearchChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </FilterSection>

        {/* Location */}
        <FilterSection
          title="Location"
          expanded={expandedSections.location}
          onToggle={() => toggleSection('location')}
        >
          <input
            type="text"
            placeholder="Search location..."
            value={filters.location}
            onChange={handleLocationChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 mb-3"
          />
          <div className="space-y-2">
            {LOCATION_OPTIONS.map((location) => (
              <button
                key={location}
                onClick={() => onFilterChange({ ...filters, location })}
                className={`block w-full text-left px-3 py-2 rounded text-sm ${
                  filters.location === location
                    ? 'bg-blue-100 text-blue-900 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {location}
              </button>
            ))}
          </div>
        </FilterSection>

        {/* Company */}
        <FilterSection
          title="Company"
          expanded={expandedSections.tech}
          onToggle={() => toggleSection('tech')}
        >
          <input
            type="text"
            placeholder="Filter by company..."
            value={filters.company}
            onChange={handleCompanyChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </FilterSection>

        {/* Tech Stack */}
        <FilterSection
          title="Tech Stack"
          expanded={expandedSections.tech}
          onToggle={() => toggleSection('tech')}
        >
          <div className="space-y-2">
            {TECH_OPTIONS.map((tech) => (
              <label key={tech} className="flex items-center text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.tech.includes(tech)}
                  onChange={() => handleTechToggle(tech)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-600"
                />
                <span className="ml-2 text-gray-700">{tech}</span>
              </label>
            ))}
          </div>
        </FilterSection>

        {/* Relevance Score */}
        <FilterSection
          title={`Min. Relevance: ${filters.minScore}%`}
          expanded={expandedSections.score}
          onToggle={() => toggleSection('score')}
        >
          <input
            type="range"
            min="0"
            max="100"
            value={filters.minScore}
            onChange={handleScoreChange}
            className="w-full"
          />
        </FilterSection>

        {/* Sorting */}
        <FilterSection
          title="Sort"
          expanded={expandedSections.sort}
          onToggle={() => toggleSection('sort')}
        >
          <select
            value={filters.sortBy}
            onChange={handleSortChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 mb-3"
          >
            <option value="posted_at">Most Recent</option>
            <option value="relevance_score">Highest Relevance</option>
            <option value="title">Title</option>
            <option value="company_name">Company</option>
          </select>

          <div className="flex gap-2">
            <button
              onClick={() => handleOrderChange('DESC')}
              className={`flex-1 px-3 py-2 rounded text-sm font-medium ${
                filters.order === 'DESC'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Descending
            </button>
            <button
              onClick={() => handleOrderChange('ASC')}
              className={`flex-1 px-3 py-2 rounded text-sm font-medium ${
                filters.order === 'ASC'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Ascending
            </button>
          </div>
        </FilterSection>
      </div>
    </div>
  );
}

/**
 * Collapsible filter section
 */
function FilterSection({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-2 text-sm font-medium text-gray-900 hover:text-gray-700"
      >
        {title}
        <svg
          className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </button>
      {expanded && <div className="mt-2">{children}</div>}
    </div>
  );
}
