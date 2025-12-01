import styles from './page.module.css';
import MapWrapper from './MapWrapper';

export const metadata = {
  title: 'TOIL - Oil & Gas Well Tracking',
  description: 'Data Dashboard for Texas Wells',
}

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

      <MapWrapper />
    </div>
  );
}