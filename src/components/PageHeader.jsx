import styles from '@/styles/workspace.module.css';

export default function PageHeader({ title, description, children }) {
  return (
    <div className={styles.pageHeading}>
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </div>
  );
}
