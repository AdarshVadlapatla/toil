'use client';

import { useState, useRef } from 'react';
import styles from './page.module.css';
import Map from './map';
import Filters from './filters';
import SearchBar from './SearchBar';
import { fetchWellDetails, fetchWellDetailsByApi } from './utils/api';

export default function MapWrapper() {
  const [activeFilters, setActiveFilters] = useState({
    counties: [],
    districts: [],
    wellType: 'all',
    completionDateStart: '',
    completionDateEnd: '',
    depthMin: '',
    depthMax: '',
    showWaterOverlay: false,
  });

  const mapRef = useRef(null);

  const handleApplyFilters = (filters) => {
    console.log('Filters applied:', filters);
    setActiveFilters(filters);
  };

  const handleSelectWell = async (result) => {
    console.log('Selected well:', result);

    try {
      let fullWell;

      if (result.hasLocation && result.id) {
        // Normal wells
        fullWell = await fetchWellDetails(result.id);
      } else {
        // API-only wells
        fullWell = await fetchWellDetailsByApi(result.api);
      }

      console.log('Full well data:', fullWell);

      if (mapRef.current) {
        mapRef.current.zoomToWell(fullWell);
      }
    } catch (error) {
      console.error('Failed to fetch well details:', error);
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