'use client';

import { useState } from 'react';
import styles from './page.module.css';
import Map from './map';
import Filters from './filters';

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

  const handleApplyFilters = (filters) => {
    console.log('Filters applied:', filters);
    setActiveFilters(filters);
  };

  return (
    <div className={styles.main}>
      <aside className={styles.filterPanel}>
        <div className={styles.filterHeader}>
          <h2 className={styles.filterTitle}>Filters</h2>
        </div>
        <Filters onApplyFilters={handleApplyFilters} />
      </aside>

      <main className={styles.content}>
        <Map filters={activeFilters} />
      </main>
    </div>
  );
}