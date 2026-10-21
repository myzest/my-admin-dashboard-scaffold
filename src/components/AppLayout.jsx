import Link from 'next/link';
import { useRouter } from 'next/router';
import { Avatar, Button, Menu } from '@arco-design/web-react';
import { IconExport } from '@arco-design/web-react/icon';
import SiteBrand from './SiteBrand';
import styles from './AppLayout.module.css';

export default function AppLayout({
  user,
  navigation,
  title,
  homePath,
  onLogout,
  isLoggingOut,
  children,
}) {
  const router = useRouter();

  return (
    <div className={styles.layout}>
      <a href="#main-content" className={styles.skipLink}>
        跳到主要内容
      </a>
      <aside className={styles.sidebar} aria-label="主导航">
        <Link href={homePath} className={styles.brand}>
          <SiteBrand iconClassName={styles.brandIcon} />
        </Link>
        <Menu selectedKeys={[router.pathname]} onClickMenuItem={(path) => router.push(path)}>
          {navigation.map(({ path, label, icon: Icon }) => (
            <Menu.Item key={path}>
              <Icon />
              {label}
            </Menu.Item>
          ))}
        </Menu>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.header}>
          <span className={styles.workspaceLabel}>{title}</span>
          <div className={styles.account}>
            <Avatar
              size={30}
              style={{ backgroundColor: 'var(--app-accent-soft)', color: 'var(--app-accent)' }}
            >
              {user.username.slice(0, 1).toUpperCase()}
            </Avatar>
            <span className={styles.username}>{user.displayName || user.username}</span>
            <Button type="text" icon={<IconExport />} loading={isLoggingOut} onClick={onLogout}>
              退出
            </Button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
