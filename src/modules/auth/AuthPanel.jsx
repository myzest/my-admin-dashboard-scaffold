import SiteBrand from '@/components/SiteBrand';
import styles from './AuthPanel.module.css';

export default function AuthPanel({ title, children }) {
  return (
    <main className={styles.page}>
      <div className={styles.brand}>
        <SiteBrand iconClassName={styles.brandIcon} />
      </div>
      <section className={styles.panel} aria-labelledby="auth-title">
        <h1 id="auth-title" className={styles.heading}>
          {title}
        </h1>
        {children}
      </section>
    </main>
  );
}
