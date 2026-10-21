import SiteBrand from '@/components/SiteBrand';
import styles from './AuthPanel.module.css';

export default function AuthPanel({ title, description, children }) {
  return (
    <main className={styles.page}>
      <div className={styles.brand}>
        <SiteBrand iconClassName={styles.brandIcon} />
      </div>
      <section className={styles.panel} aria-labelledby="auth-title">
        <div className={styles.heading}>
          <h1 id="auth-title">{title}</h1>
          <p>{description}</p>
        </div>
        {children}
      </section>
    </main>
  );
}
