import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Avatar, Button, Drawer, Menu } from '@arco-design/web-react';
import { IconExport, IconMenu, IconMenuFold, IconMenuUnfold } from '@arco-design/web-react/icon';
import { site } from '@/config/site';
import SiteBrand from './SiteBrand';
import { LayoutPreferencesContext } from './LayoutPreferencesProvider';
import useMediaQuery from './useMediaQuery';
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
  const contentRef = useRef(null);
  const menuButtonRef = useRef(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
  const { isSidebarCollapsed, setIsSidebarCollapsed } = useContext(LayoutPreferencesContext);
  const isCollapsed = isSidebarCollapsed ?? isTablet;
  // The drawer portal mounts after Arco's initial autofocus effect.
  const focusNavigation = useCallback((element) => element?.focus({ preventScroll: true }), []);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, left: 0 });
  }, [router.pathname]);

  useEffect(() => {
    const closeMenu = () => setIsMenuOpen(false);
    const desktop = window.matchMedia('(min-width: 768px)');
    router.events.on('routeChangeComplete', closeMenu);
    desktop.addEventListener('change', closeMenu);
    return () => {
      router.events.off('routeChangeComplete', closeMenu);
      desktop.removeEventListener('change', closeMenu);
    };
  }, [router.events]);

  function renderMenu(collapse = false) {
    return (
      <Menu
        collapse={collapse}
        selectedKeys={[router.pathname]}
        onClickMenuItem={async (path) => {
          if (path !== router.pathname) await router.push(path);
          setIsMenuOpen(false);
        }}
      >
        {navigation.map(({ path, label, icon: Icon }) => (
          <Menu.Item key={path}>
            <Icon />
            {label}
          </Menu.Item>
        ))}
      </Menu>
    );
  }

  return (
    <div className={styles.layout}>
      <a href="#main-content" className={styles.skipLink}>
        跳到主要内容
      </a>
      <aside
        id="desktop-navigation"
        className={styles.sidebar}
        data-collapsed={isCollapsed}
        aria-label="主导航"
      >
        <Link href={homePath} className={styles.brand} aria-label={site.name}>
          <SiteBrand iconClassName={styles.brandIcon} />
        </Link>
        <div className={styles.menuScroll}>{renderMenu(isCollapsed)}</div>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <Button
              ref={menuButtonRef}
              type="text"
              className={styles.menuButton}
              aria-label={isMobile ? '打开导航菜单' : isCollapsed ? '展开导航菜单' : '收起导航菜单'}
              aria-expanded={isMobile ? isMenuOpen : !isCollapsed}
              aria-controls={isMobile ? 'mobile-navigation' : 'desktop-navigation'}
              icon={isMobile ? <IconMenu /> : isCollapsed ? <IconMenuUnfold /> : <IconMenuFold />}
              onClick={() => (isMobile ? setIsMenuOpen(true) : setIsSidebarCollapsed(!isCollapsed))}
            />
            <span className={styles.workspaceLabel}>{title}</span>
          </div>
          <div className={styles.account}>
            <Avatar
              size={30}
              style={{ backgroundColor: 'var(--app-accent-soft)', color: 'var(--app-accent)' }}
            >
              {user.username.slice(0, 1).toUpperCase()}
            </Avatar>
            <span className={styles.username} title={user.displayName || user.username}>
              {user.displayName || user.username}
            </span>
            <Button type="text" icon={<IconExport />} loading={isLoggingOut} onClick={onLogout}>
              退出
            </Button>
          </div>
        </header>
        <main ref={contentRef} id="main-content" tabIndex={-1} className={styles.content}>
          <div className={styles.contentInner}>{children}</div>
        </main>
      </div>
      <Drawer
        title={
          <span className={styles.drawerBrand}>
            <SiteBrand iconClassName={styles.brandIcon} />
          </span>
        }
        placement="left"
        width="min(288px, calc(100vw - 48px))"
        visible={isMobile && isMenuOpen}
        footer={null}
        focusLock
        autoFocus
        unmountOnExit
        onCancel={() => setIsMenuOpen(false)}
        afterClose={() => menuButtonRef.current?.focus()}
        bodyStyle={{ padding: '12px', overscrollBehavior: 'contain' }}
        className={styles.drawer}
      >
        <nav id="mobile-navigation" ref={focusNavigation} tabIndex={-1} aria-label="主导航">
          {renderMenu()}
        </nav>
      </Drawer>
    </div>
  );
}
