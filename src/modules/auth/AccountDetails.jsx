import { Descriptions } from '@arco-design/web-react';
import styles from '@/styles/workspace.module.css';

export default function AccountDetails({ user, roleLabel }) {
  return (
    <section className={styles.panel} aria-label="账号信息">
      <Descriptions
        className={styles.accountDetails}
        column={1}
        data={[
          { label: '用户名', value: user.username },
          { label: '显示名称', value: user.displayName },
          { label: '账号角色', value: roleLabel },
        ]}
      />
    </section>
  );
}
