import { useId, useState } from 'react';
import { Button } from '@arco-design/web-react';
import { IconFilter } from '@arco-design/web-react/icon';
import styles from './ListToolbar.module.css';

export default function ListToolbar({ children, actions, activeFilterCount = 0 }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const filtersId = useId();

  return (
    <div className={styles.toolbar}>
      <Button
        icon={<IconFilter />}
        className={styles.toggle}
        aria-expanded={isExpanded}
        aria-controls={filtersId}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? '收起筛选' : '筛选'}
        {activeFilterCount ? `（${activeFilterCount}）` : ''}
      </Button>
      <div id={filtersId} className={styles.filters} data-expanded={isExpanded}>
        {children}
      </div>
      <div className={styles.actions}>{actions}</div>
    </div>
  );
}
