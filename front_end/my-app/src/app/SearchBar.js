'use client';

import { useState, useEffect, useRef } from 'react';
import { searchWells } from './utils/api';
import styles from './SearchBar.module.css';

export default function SearchBar({ onSelectWell }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef(null);
  const debounceTimer = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search function with debouncing
  const performSearch = async (query) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    
    try {
      const data = await searchWells(query);
      
      if (data.results) {
        setSearchResults(data.results);
        setShowResults(true);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle input change with debouncing
  const handleInputChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);

    // Clear existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Set new timer
    debounceTimer.current = setTimeout(() => {
      performSearch(value);
    }, 300); // Wait 300ms after user stops typing
  };

  // Handle result selection
  const handleSelectResult = (result) => {
    setSearchQuery(`${result.api} - ${result.leaseName}`);
    setShowResults(false);
    setSearchResults([]);
    
    if (onSelectWell) {
      onSelectWell(result);
    }
  };

  // Handle clear
  const handleClear = () => {
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
  };

  return (
    <div className={styles.searchContainer} ref={searchRef}>
      <div className={styles.searchBox}>
        <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="11" cy="11" r="8" strokeWidth="2"/>
          <path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          placeholder="Search by API #, Lease Name, Operator..."
          className={styles.searchInput}
          value={searchQuery}
          onChange={handleInputChange}
          onFocus={() => searchResults.length > 0 && setShowResults(true)}
        />
        {searchQuery && (
          <button className={styles.clearButton} onClick={handleClear} aria-label="Clear search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/>
            </svg>
          </button>
        )}
        {isSearching && (
          <div className={styles.spinner}>
            <svg className={styles.spinnerIcon} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.25"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
            </svg>
          </div>
        )}
      </div>

      {showResults && searchResults.length > 0 && (
        <div className={styles.resultsDropdown}>
          {searchResults.map((result) => (
            <button
              key={result.id}
              className={styles.resultItem}
              onClick={() => handleSelectResult(result)}
            >
              <div className={styles.resultMain}>
                <span className={styles.resultApi}>API {result.api}</span>
                <span className={styles.resultLease}>{result.leaseName}</span>
              </div>
              <div className={styles.resultDetails}>
                <span className={styles.resultOperator}>{result.operatorName}</span>
                <span className={styles.resultLocation}>{result.countyName} County</span>
              </div>
              <div className={styles.matchBadge}>{result.matchType}</div>
            </button>
          ))}
        </div>
      )}

      {showResults && searchResults.length === 0 && searchQuery.length >= 2 && !isSearching && (
        <div className={styles.resultsDropdown}>
          <div className={styles.noResults}>No wells found matching "{searchQuery}"</div>
        </div>
      )}
    </div>
  );
}