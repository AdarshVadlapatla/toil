import styles from './page.module.css';
import Map from './map';
import Filters from './filters';

export const metadata = {
  title: 'TOIL - Oil & Gas Well Tracking',
  description: 'Data Dashboard for Texas Wells',
}

// // Supabase client
// const supabaseUrl = 'https://cybbfiogqisodsytxlnx.supabase.co';
// const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5YmJmaW9ncWlzb2RzeXR4bG54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1ODU5MTksImV4cCI6MjA3NzE2MTkxOX0.qVeVI8geTuaO7ovJNV7EVY_ySHkHR7yvL8Oeyv6P4E0';

export default function Home() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <img className={styles.logoIcon} src="/ToilLogo.png" alt="TOIL Logo"></img>
          <h1 className={styles.logoText}>TOIL</h1>
        </div>
        <button className={styles.helpButton} aria-label="Help">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
          </svg>
        </button>
      </header>

      <div className={styles.main}>
        <aside className={styles.filterPanel}>
          <div className={styles.filterHeader}>
            <h2 className={styles.filterTitle}>Filters</h2>
            <button className={styles.menuButton} aria-label="Menu">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
          </div>
          <Filters />
        </aside>

        <main className={styles.content}>
          <Map />
        </main>
      </div>
    </div>
  );
}