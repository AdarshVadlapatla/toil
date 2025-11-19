'use client';

import { useState } from 'react';
import styles from './filters.module.css';

export default function Filters() {
  const [filters, setFilters] = useState({
    county: '',
    fieldClassification: '',
    region: '',
    wellType: 'all',
    wellDepth: { min: '', max: '' },
    formation: '',
    dateRange: { start: '', end: '' },
    productionRange: { min: '', max: '' },
    performanceTier: [],
    productionThreshold: '',
    operatorName: '',
    organization: '',
  });

  const [expandedSections, setExpandedSections] = useState({
    location: true,
    attributes: false,
    production: false,
    operator: false,
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleInputChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleNestedChange = (parent, field, value) => {
    setFilters(prev => ({
      ...prev,
      [parent]: { ...prev[parent], [field]: value }
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

  const handleReset = () => {
    setFilters({
      county: '',
      fieldClassification: '',
      region: '',
      wellType: 'all',
      wellDepth: { min: '', max: '' },
      formation: '',
      dateRange: { start: '', end: '' },
      productionRange: { min: '', max: '' },
      performanceTier: [],
      productionThreshold: '',
      operatorName: '',
      organization: '',
    });
  };

  const handleApply = () => {
    console.log('Applying filters:', filters);
    // Filter logic will go here
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
            <div className={styles.field}>
              <label className={styles.label}>County</label>
              <select
                className={styles.select}
                value={filters.county}
                onChange={(e) => handleInputChange('county', e.target.value)}
              >
                <option value="">All Counties</option>
                <option value="andrews">Andrews</option>
                <option value="martin">Martin</option>
                <option value="midland">Midland</option>
                <option value="reagan">Reagan</option>
                <option value="upton">Upton</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Field Classification</label>
              <select
                className={styles.select}
                value={filters.fieldClassification}
                onChange={(e) => handleInputChange('fieldClassification', e.target.value)}
              >
                <option value="">All Fields</option>
                <option value="permian">Permian Basin</option>
                <option value="eagle-ford">Eagle Ford</option>
                <option value="haynesville">Haynesville</option>
                <option value="barnett">Barnett</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Geographic Region</label>
              <select
                className={styles.select}
                value={filters.region}
                onChange={(e) => handleInputChange('region', e.target.value)}
              >
                <option value="">All Regions</option>
                <option value="west-texas">West Texas</option>
                <option value="south-texas">South Texas</option>
                <option value="north-texas">North Texas</option>
                <option value="east-texas">East Texas</option>
              </select>
            </div>
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
                    value="oil"
                    checked={filters.wellType === 'oil'}
                    onChange={(e) => handleInputChange('wellType', e.target.value)}
                  />
                  Oil
                </label>
                <label className={styles.radio}>
                  <input
                    type="radio"
                    name="wellType"
                    value="gas"
                    checked={filters.wellType === 'gas'}
                    onChange={(e) => handleInputChange('wellType', e.target.value)}
                  />
                  Gas
                </label>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Well Depth (ft)</label>
              <div className={styles.rangeInputs}>
                <input
                  type="number"
                  placeholder="Min"
                  className={styles.input}
                  value={filters.wellDepth.min}
                  onChange={(e) => handleNestedChange('wellDepth', 'min', e.target.value)}
                />
                <span className={styles.rangeSeparator}>to</span>
                <input
                  type="number"
                  placeholder="Max"
                  className={styles.input}
                  value={filters.wellDepth.max}
                  onChange={(e) => handleNestedChange('wellDepth', 'max', e.target.value)}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Formation</label>
              <select
                className={styles.select}
                value={filters.formation}
                onChange={(e) => handleInputChange('formation', e.target.value)}
              >
                <option value="">All Formations</option>
                <option value="wolfcamp">Wolfcamp</option>
                <option value="bone-spring">Bone Spring</option>
                <option value="spraberry">Spraberry</option>
                <option value="delaware">Delaware</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Completion Date Range</label>
              <div className={styles.dateInputs}>
                <input
                  type="date"
                  className={styles.input}
                  value={filters.dateRange.start}
                  onChange={(e) => handleNestedChange('dateRange', 'start', e.target.value)}
                />
                <span className={styles.rangeSeparator}>to</span>
                <input
                  type="date"
                  className={styles.input}
                  value={filters.dateRange.end}
                  onChange={(e) => handleNestedChange('dateRange', 'end', e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Production Metrics */}
      <section className={styles.section}>
        <button 
          className={styles.sectionHeader}
          onClick={() => toggleSection('production')}
        >
          <h3 className={styles.sectionTitle}>Production Metrics</h3>
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
            <div className={styles.field}>
              <label className={styles.label}>Production Level (BBL/month)</label>
              <div className={styles.rangeInputs}>
                <input
                  type="number"
                  placeholder="Min"
                  className={styles.input}
                  value={filters.productionRange.min}
                  onChange={(e) => handleNestedChange('productionRange', 'min', e.target.value)}
                />
                <span className={styles.rangeSeparator}>to</span>
                <input
                  type="number"
                  placeholder="Max"
                  className={styles.input}
                  value={filters.productionRange.max}
                  onChange={(e) => handleNestedChange('productionRange', 'max', e.target.value)}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Performance Tier</label>
              <div className={styles.checkboxGroup}>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={filters.performanceTier.includes('high')}
                    onChange={() => handleCheckboxChange('performanceTier', 'high')}
                  />
                  High Performers
                </label>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={filters.performanceTier.includes('medium')}
                    onChange={() => handleCheckboxChange('performanceTier', 'medium')}
                  />
                  Medium Performers
                </label>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={filters.performanceTier.includes('low')}
                    onChange={() => handleCheckboxChange('performanceTier', 'low')}
                  />
                  Low Performers
                </label>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Historical Production Threshold</label>
              <select
                className={styles.select}
                value={filters.productionThreshold}
                onChange={(e) => handleInputChange('productionThreshold', e.target.value)}
              >
                <option value="">No Threshold</option>
                <option value="10000">Above 10,000 BBL</option>
                <option value="50000">Above 50,000 BBL</option>
                <option value="100000">Above 100,000 BBL</option>
                <option value="500000">Above 500,000 BBL</option>
              </select>
            </div>
          </div>
        )}
      </section>

      {/* Operator Information */}
      <section className={styles.section}>
        <button 
          className={styles.sectionHeader}
          onClick={() => toggleSection('operator')}
        >
          <h3 className={styles.sectionTitle}>Operator Information</h3>
          <svg 
            className={`${styles.chevron} ${expandedSections.operator ? styles.chevronUp : ''}`}
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor"
          >
            <path d="M6 9l6 6 6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        
        {expandedSections.operator && (
          <div className={styles.sectionContent}>
            <div className={styles.field}>
              <label className={styles.label}>Organization/Company</label>
              <select
                className={styles.select}
                value={filters.organization}
                onChange={(e) => handleInputChange('organization', e.target.value)}
              >
                <option value="">All Companies</option>
                <option value="exxon">ExxonMobil</option>
                <option value="chevron">Chevron</option>
                <option value="conocophillips">ConocoPhillips</option>
                <option value="pioneer">Pioneer Natural Resources</option>
                <option value="devon">Devon Energy</option>
              </select>
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