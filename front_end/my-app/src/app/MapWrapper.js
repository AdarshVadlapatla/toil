'use client';

import { useState, useRef } from 'react';
import styles from './page.module.css';
import Map from './map';
import Filters from './filters';
import SearchBar from './SearchBar';
import { fetchWellDetails, fetchWellDetailsByApi } from './utils/api';
import { useRouter } from 'next/navigation';

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

  const router = useRouter();
  const mapRef = useRef(null);

  const handleApplyFilters = (filters) => {
    console.log('Filters applied:', filters);
    setActiveFilters(filters);
  };

  const handleSelectWell = async (result) => {
    console.log('Selected well:', result);

    if (result.hasLocation && result.id) {
      router.push(`/wells/${result.id}`);
    } else {
      router.push(`/wells/by-api/${result.api}`);
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