'use client';

import { useState, useEffect } from 'react';
import styles from './filters.module.css';

export default function Filters({ onApplyFilters }) {
  const [filters, setFilters] = useState({
    counties: [],
    districts: [],
    operators: [],
    fields: [],
    wellType: 'all',
    completionDateStart: '',
    completionDateEnd: '',
    depthMin: '',
    depthMax: '',
    productionTotalMin: '',
    productionTotalMax: '',
    productionAvgMin: '',
    productionAvgMax: '',
    productionMaxMin: '',
    productionMaxMax: '',
  });

  const [options, setOptions] = useState({
    counties: [],
    districts: [],
    operators: [],
    fields: [],
  });

  const [loading, setLoading] = useState(true);

  const [searchTerms, setSearchTerms] = useState({
    county: '',
    operator: '',
    field: '',
  });

  const [expandedSections, setExpandedSections] = useState({
    location: true,
    attributes: false,
    production: false,
    counties: false,
    districts: false,
    operators: false,
    fields: false,
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
          operators: data.operators || [],
          fields: data.fields || [],
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

  const handleSearchChange = (field, value) => {
    setSearchTerms(prev => ({ ...prev, [field]: value }));
  };

  const clearSearch = (field) => {
    setSearchTerms(prev => ({ ...prev, [field]: '' }));
  };

  const handleReset = () => {
    setFilters({
      counties: [],
      districts: [],
      operators: [],
      fields: [],
      wellType: 'all',
      completionDateStart: '',
      completionDateEnd: '',
      depthMin: '',
      depthMax: '',
      productionTotalMin: '',
      productionTotalMax: '',
      productionAvgMin: '',
      productionAvgMax: '',
      productionMaxMin: '',
      productionMaxMax: '',
    });
    
    setSearchTerms({
      county: '',
      operator: '',
      field: '',
    });
    
    // Clear filters on map
    if (onApplyFilters) {
      onApplyFilters({
        counties: [],
        districts: [],
        operators: [],
        fields: [],
        wellType: 'all',
        completionDateStart: '',
        completionDateEnd: '',
        depthMin: '',
        depthMax: '',
        productionTotalMin: '',
        productionTotalMax: '',
        productionAvgMin: '',
        productionAvgMax: '',
        productionMaxMin: '',
        productionMaxMax: '',
      });
    }
  };

  const handleApply = () => {
    console.log('Applying filters:', filters);
    if (onApplyFilters) {
      onApplyFilters(filters);
    }
  };

  // Filter options based on search terms
  const filteredCounties = options.counties.filter(county =>
    county.toLowerCase().includes(searchTerms.county.toLowerCase())
  );

  const filteredOperators = options.operators.filter(operator =>
    operator.toLowerCase().includes(searchTerms.operator.toLowerCase())
  );

  const filteredFields = options.fields.filter(field =>
    field.toLowerCase().includes(searchTerms.field.toLowerCase())
  );

  return (
    <div className={styles.filtersContainer}>
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
                {/* County Filter - Now Searchable */}
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
                      {/* Search Input */}
                      <div className={styles.searchInputWrapper}>
                        <svg className={styles.searchInputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <circle cx="11" cy="11" r="8" strokeWidth="2"/>
                          <path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                        <input
                          type="text"
                          placeholder="Search counties..."
                          className={styles.searchInput}
                          value={searchTerms.county}
                          onChange={(e) => handleSearchChange('county', e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        {searchTerms.county && (
                          <button 
                            className={styles.searchClearButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              clearSearch('county');
                            }}
                            type="button"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/>
                            </svg>
                          </button>
                        )}
                      </div>
                      {/* Checkbox List */}
                      <div className={styles.checkboxList}>
                        {filteredCounties.length > 0 ? (
                          filteredCounties.map(county => (
                            <label key={county} className={styles.checkbox}>
                              <input
                                type="checkbox"
                                checked={filters.counties.includes(county)}
                                onChange={() => handleCheckboxChange('counties', county)}
                              />
                              {county}
                            </label>
                          ))
                        ) : (
                          <div className={styles.noResults}>No counties found</div>
                        )}
                      </div>
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
            {/* Operator Filter - New Searchable */}
            <div className={styles.field}>
              <button 
                className={styles.dropdownToggle}
                onClick={() => setExpandedSections(prev => ({...prev, operators: !prev.operators}))}
                type="button"
              >
                <span className={styles.dropdownLabel}>
                  Operator ({filters.operators.length} selected)
                </span>
                <svg 
                  className={`${styles.dropdownChevron} ${expandedSections.operators ? styles.chevronUp : ''}`}
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor"
                >
                  <path d="M6 9l6 6 6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {expandedSections.operators && (
                <div className={styles.checkboxScrollContainer}>
                  {/* Search Input */}
                  <div className={styles.searchInputWrapper}>
                    <svg className={styles.searchInputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle cx="11" cy="11" r="8" strokeWidth="2"/>
                      <path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <input
                      type="text"
                      placeholder="Search operators..."
                      className={styles.searchInput}
                      value={searchTerms.operator}
                      onChange={(e) => handleSearchChange('operator', e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    {searchTerms.operator && (
                      <button 
                        className={styles.searchClearButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          clearSearch('operator');
                        }}
                        type="button"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/>
                        </svg>
                      </button>
                    )}
                  </div>
                  {/* Checkbox List */}
                  <div className={styles.checkboxList}>
                    {filteredOperators.length > 0 ? (
                      filteredOperators.map(operator => (
                        <label key={operator} className={styles.checkbox}>
                          <input
                            type="checkbox"
                            checked={filters.operators.includes(operator)}
                            onChange={() => handleCheckboxChange('operators', operator)}
                          />
                          {operator}
                        </label>
                      ))
                    ) : (
                      <div className={styles.noResults}>No operators found</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Field Filter - New Searchable */}
            <div className={styles.field}>
              <button 
                className={styles.dropdownToggle}
                onClick={() => setExpandedSections(prev => ({...prev, fields: !prev.fields}))}
                type="button"
              >
                <span className={styles.dropdownLabel}>
                  Field ({filters.fields.length} selected)
                </span>
                <svg 
                  className={`${styles.dropdownChevron} ${expandedSections.fields ? styles.chevronUp : ''}`}
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor"
                >
                  <path d="M6 9l6 6 6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {expandedSections.fields && (
                <div className={styles.checkboxScrollContainer}>
                  {/* Search Input */}
                  <div className={styles.searchInputWrapper}>
                    <svg className={styles.searchInputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle cx="11" cy="11" r="8" strokeWidth="2"/>
                      <path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <input
                      type="text"
                      placeholder="Search fields..."
                      className={styles.searchInput}
                      value={searchTerms.field}
                      onChange={(e) => handleSearchChange('field', e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    {searchTerms.field && (
                      <button 
                        className={styles.searchClearButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          clearSearch('field');
                        }}
                        type="button"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/>
                        </svg>
                      </button>
                    )}
                  </div>
                  {/* Checkbox List */}
                  <div className={styles.checkboxList}>
                    {filteredFields.length > 0 ? (
                      filteredFields.map(field => (
                        <label key={field} className={styles.checkbox}>
                          <input
                            type="checkbox"
                            checked={filters.fields.includes(field)}
                            onChange={() => handleCheckboxChange('fields', field)}
                          />
                          {field}
                        </label>
                      ))
                    ) : (
                      <div className={styles.noResults}>No fields found</div>
                    )}
                  </div>
                </div>
              )}
            </div>

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

      {/* Production Filters */}
        <section className={styles.section}>
          <button 
            className={styles.sectionHeader}
            onClick={() => toggleSection('production')}
          >
            <h3 className={styles.sectionTitle}>Production Filters</h3>
            <svg 
              className={`${styles.chevron} ${expandedSections.production ? styles.chevronUp : ''}`}
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor"
            >
              <path d="M6 9l6 6 6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          
          {expandedSections.production && (
            <div className={styles.sectionContent}>
              <div className={styles.productionNote}>
                <svg className={styles.noteIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="12" r="10" strokeWidth="2"/>
                  <path d="M12 16v-4m0-4h.01" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <p>Production data is only available for gas wells at this time. Data covers the past 14 months.</p>
              </div>

              {/* Total Production Range */}
              <div className={styles.field}>
                <label className={styles.label}>Total Production (MCF) - Last 14 Months</label>
                <div className={styles.rangeInputs}>
                  <input
                    type="number"
                    placeholder="Min"
                    className={styles.input}
                    value={filters.productionTotalMin}
                    onChange={(e) => handleInputChange('productionTotalMin', e.target.value)}
                  />
                  <span className={styles.rangeSeparator}>to</span>
                  <input
                    type="number"
                    placeholder="Max"
                    className={styles.input}
                    value={filters.productionTotalMax}
                    onChange={(e) => handleInputChange('productionTotalMax', e.target.value)}
                  />
                </div>
              </div>

              {/* Average Monthly Production Range */}
              <div className={styles.field}>
                <label className={styles.label}>Average Monthly Production (MCF)</label>
                <div className={styles.rangeInputs}>
                  <input
                    type="number"
                    placeholder="Min"
                    className={styles.input}
                    value={filters.productionAvgMin}
                    onChange={(e) => handleInputChange('productionAvgMin', e.target.value)}
                  />
                  <span className={styles.rangeSeparator}>to</span>
                  <input
                    type="number"
                    placeholder="Max"
                    className={styles.input}
                    value={filters.productionAvgMax}
                    onChange={(e) => handleInputChange('productionAvgMax', e.target.value)}
                  />
                </div>
              </div>

              {/* Peak Monthly Production Range */}
              <div className={styles.field}>
                <label className={styles.label}>Peak Monthly Production (MCF)</label>
                <div className={styles.rangeInputs}>
                  <input
                    type="number"
                    placeholder="Min"
                    className={styles.input}
                    value={filters.productionMaxMin}
                    onChange={(e) => handleInputChange('productionMaxMin', e.target.value)}
                  />
                  <span className={styles.rangeSeparator}>to</span>
                  <input
                    type="number"
                    placeholder="Max"
                    className={styles.input}
                    value={filters.productionMaxMax}
                    onChange={(e) => handleInputChange('productionMaxMax', e.target.value)}
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