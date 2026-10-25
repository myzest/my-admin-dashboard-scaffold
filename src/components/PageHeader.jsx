import styles from '@/styles/workspace.module.css';

export default function PageHeader({ title, children }) {
  return (
    <div className={styles.pageHeading}>
      <h1>{title}</h1>
      {children}
    </div>
  );
}
