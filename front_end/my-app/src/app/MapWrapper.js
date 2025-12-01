'use client';

import { useState, useRef } from 'react';
import styles from './page.module.css';
import Map from './map';
import Filters from './filters';
import SearchBar from './SearchBar';

export default function MapWrapper() {
  const [activeFilters, setActiveFilters] = useState({
    counties: [],
    districts: [],
    wellType: 'all',
    completionDateStart: '',
    completionDateEnd: '',
    depthMin: '',
    depthMax: '',
  });

  const mapRef = useRef(null);

  const handleApplyFilters = (filters) => {
    console.log('Filters applied:', filters);
    setActiveFilters(filters);
  };

  const handleSelectWell = (well) => {
    console.log('Selected well:', well);
    // Pass the selected well to the Map component
    if (mapRef.current) {
      mapRef.current.zoomToWell(well);
    }
  };

  return (
    <div className={styles.main}>
      <aside className={styles.filterPanel}>
        <div className={styles.filterHeader}>
          <h2 className={styles.filterTitle}>Filters</h2>
        </div>
        <SearchBar onSelectWell={handleSelectWell} />
        <Filters onApplyFilters={handleApplyFilters} />
      </aside>

      <main className={styles.content}>
        <Map ref={mapRef} filters={activeFilters} />
      </main>
    </div>
  );
}