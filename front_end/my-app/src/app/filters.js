'use client';

import { useState, useEffect } from 'react';
import styles from './filters.module.css';

export default function Filters({ onApplyFilters }) {
  const [filters, setFilters] = useState({
    counties: [],
    districts: [],
    wellType: 'all',
    completionDateStart: '',
    completionDateEnd: '',
    depthMin: '',
    depthMax: '',
  });

  const [options, setOptions] = useState({
    counties: [],
    districts: [],
  });

  const [loading, setLoading] = useState(true);

  const [expandedSections, setExpandedSections] = useState({
    location: true,
    attributes: false,
    counties: false,
    districts: false,
  });

  // Fetch filter options from server
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        setLoading(true);
        const response = await fetch('http://localhost:3001/api/filter-options');
        const data = await response.json();
        
        setOptions({
          counties: data.counties || [],
          districts: data.districts || [],
        });
      } catch (error) {
        console.error('Error fetching filter options:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOptions();
  }, []);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleCheckboxChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter(v => v !== value)
        : [...prev[field], value]
    }));
  };

  const handleInputChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleReset = () => {
    setFilters({
      counties: [],
      districts: [],
      wellType: 'all',
      completionDateStart: '',
      completionDateEnd: '',
      depthMin: '',
      depthMax: '',
    });
    
    // Clear filters on map
    if (onApplyFilters) {
      onApplyFilters({
        counties: [],
        districts: [],
        wellType: 'all',
        completionDateStart: '',
        completionDateEnd: '',
        depthMin: '',
        depthMax: '',
      });
    }
  };

  const handleApply = () => {
    console.log('Applying filters:', filters);
    if (onApplyFilters) {
      onApplyFilters(filters);
    }
  };

  return (
    <div className={styles.filtersContainer}>
      <div className={styles.searchBox}>
        <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="11" cy="11" r="8" strokeWidth="2"/>
          <path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          placeholder="Search by API #, Lease Name, Operator..."
          className={styles.searchInput}
        />
      </div>

      {/* Location Filters */}
      <section className={styles.section}>
        <button 
          className={styles.sectionHeader}
          onClick={() => toggleSection('location')}
        >
          <h3 className={styles.sectionTitle}>Location Filters</h3>
          <svg 
            className={`${styles.chevron} ${expandedSections.location ? styles.chevronUp : ''}`}
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor"
          >
            <path d="M6 9l6 6 6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        
        {expandedSections.location && (
          <div className={styles.sectionContent}>
            {loading ? (
              <div className={styles.loadingText}>Loading options...</div>
            ) : (
              <>
                {/* County Filter */}
                <div className={styles.field}>
                  <button 
                    className={styles.dropdownToggle}
                    onClick={() => setExpandedSections(prev => ({...prev, counties: !prev.counties}))}
                    type="button"
                  >
                    <span className={styles.dropdownLabel}>
                      County ({filters.counties.length} selected)
                    </span>
                    <svg 
                      className={`${styles.dropdownChevron} ${expandedSections.counties ? styles.chevronUp : ''}`}
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor"
                    >
                      <path d="M6 9l6 6 6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  {expandedSections.counties && (
                    <div className={styles.checkboxScrollContainer}>
                      {options.counties.map(county => (
                        <label key={county} className={styles.checkbox}>
                          <input
                            type="checkbox"
                            checked={filters.counties.includes(county)}
                            onChange={() => handleCheckboxChange('counties', county)}
                          />
                          {county}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* District Filter */}
                <div className={styles.field}>
                  <button 
                    className={styles.dropdownToggle}
                    onClick={() => setExpandedSections(prev => ({...prev, districts: !prev.districts}))}
                    type="button"
                  >
                    <span className={styles.dropdownLabel}>
                      District ({filters.districts.length} selected)
                    </span>
                    <svg 
                      className={`${styles.dropdownChevron} ${expandedSections.districts ? styles.chevronUp : ''}`}
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor"
                    >
                      <path d="M6 9l6 6 6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  {expandedSections.districts && (
                    <div className={styles.checkboxScrollContainer}>
                      {options.districts.map(district => (
                        <label key={district} className={styles.checkbox}>
                          <input
                            type="checkbox"
                            checked={filters.districts.includes(district)}
                            onChange={() => handleCheckboxChange('districts', district)}
                          />
                          District {district}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* Well Attributes */}
      <section className={styles.section}>
        <button 
          className={styles.sectionHeader}
          onClick={() => toggleSection('attributes')}
        >
          <h3 className={styles.sectionTitle}>Well Attributes</h3>
          <svg 
            className={`${styles.chevron} ${expandedSections.attributes ? styles.chevronUp : ''}`}
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor"
          >
            <path d="M6 9l6 6 6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        
        {expandedSections.attributes && (
          <div className={styles.sectionContent}>
            {/* Well Type Filter */}
            <div className={styles.field}>
              <label className={styles.label}>Well Type</label>
              <div className={styles.radioGroup}>
                <label className={styles.radio}>
                  <input
                    type="radio"
                    name="wellType"
                    value="all"
                    checked={filters.wellType === 'all'}
                    onChange={(e) => handleInputChange('wellType', e.target.value)}
                  />
                  All
                </label>
                <label className={styles.radio}>
                  <input
                    type="radio"
                    name="wellType"
                    value="O"
                    checked={filters.wellType === 'O'}
                    onChange={(e) => handleInputChange('wellType', e.target.value)}
                  />
                  Oil
                </label>
                <label className={styles.radio}>
                  <input
                    type="radio"
                    name="wellType"
                    value="G"
                    checked={filters.wellType === 'G'}
                    onChange={(e) => handleInputChange('wellType', e.target.value)}
                  />
                  Gas
                </label>
              </div>
            </div>

            {/* Completion Date Range */}
            <div className={styles.field}>
              <label className={styles.label}>Completion Date Range</label>
              <div className={styles.dateInputs}>
                <input
                  type="date"
                  className={styles.input}
                  value={filters.completionDateStart}
                  onChange={(e) => handleInputChange('completionDateStart', e.target.value)}
                  placeholder="Start Date"
                />
                <span className={styles.rangeSeparator}>to</span>
                <input
                  type="date"
                  className={styles.input}
                  value={filters.completionDateEnd}
                  onChange={(e) => handleInputChange('completionDateEnd', e.target.value)}
                  placeholder="End Date"
                />
              </div>
            </div>

            {/* Well Depth Range */}
            <div className={styles.field}>
              <label className={styles.label}>Well Depth (ft)</label>
              <div className={styles.rangeInputs}>
                <input
                  type="number"
                  placeholder="Min"
                  className={styles.input}
                  value={filters.depthMin}
                  onChange={(e) => handleInputChange('depthMin', e.target.value)}
                />
                <span className={styles.rangeSeparator}>to</span>
                <input
                  type="number"
                  placeholder="Max"
                  className={styles.input}
                  value={filters.depthMax}
                  onChange={(e) => handleInputChange('depthMax', e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Action Buttons */}
      <div className={styles.actions}>
        <button className={styles.applyButton} onClick={handleApply}>
          Apply Filters
        </button>
        <button className={styles.resetButton} onClick={handleReset}>
          Clear All
        </button>
      </div>
    </div>
  );
}