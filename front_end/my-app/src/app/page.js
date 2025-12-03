import styles from './page.module.css';
import MapWrapper from './MapWrapper';
import HelpModal from './HelpModal';

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
        <HelpModal />
      </header>

      <MapWrapper />
    </div>
  );
}