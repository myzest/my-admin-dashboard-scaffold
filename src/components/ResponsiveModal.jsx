import { Modal } from '@arco-design/web-react';
import styles from './ResponsiveModal.module.css';

export default function ResponsiveModal({ className, wrapClassName, style, ...props }) {
  return (
    <Modal
      focusLock
      autoFocus
      getChildrenPopupContainer={() => document.body}
      {...props}
      alignCenter={false}
      className={[styles.modal, className].filter(Boolean).join(' ')}
      wrapClassName={[styles.overlay, wrapClassName].filter(Boolean).join(' ')}
      style={{ width: 'min(480px, calc(100vw - 32px))', ...style }}
    />
  );
}
