import styles from './page.module.css';
import Map from './map';
import Filters from './filters';

export const metadata = {
  title: 'TOIL - Oil & Gas Well Tracking',
  description: 'Data Dashboard for Texas Wells',
}

export default function Home() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <svg className={styles.logoIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 2L12 22M8 6L12 2L16 6M8 18L12 22L16 18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <h1 className={styles.logoText}>TOIL</h1>
        </div>
        <button className={styles.userIcon}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
        </button>
      </header>

      <div className={styles.main}>
        <aside className={styles.filterPanel}>
          <h2 className={styles.filterTitle}>Filter & Search Wells</h2>
          <Filters />
        </aside>

        <main className={styles.content}>
          <Map />
        </main>
      </div>
    </div>
  );
}