import { Popover } from '@arco-design/web-react';
import styles from './ExpandableText.module.css';

export default function ExpandableText({ children }) {
  if (children === null || children === undefined || children === '') return '—';
  return (
    <Popover
      title="完整内容"
      trigger="click"
      triggerProps={{ containerScrollToClose: true, escToClose: true }}
      content={<div className={styles.content}>{children}</div>}
    >
      <button
        type="button"
        className={styles.trigger}
        title="点击查看完整内容"
        // Safari does not focus buttons on click; focus lets Arco receive Escape.
        onClick={(event) => event.currentTarget.focus({ preventScroll: true })}
      >
        {children}
      </button>
    </Popover>
  );
}
