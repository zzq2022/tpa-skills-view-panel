import { useEffect, useRef, useState } from 'react'
import { fetchSelfhostedAuthStatus, logoutSelfhosted, type SelfhostedAuthStatusDto } from '../api.ts'
import { SelfhostedAuthDialog } from './SelfhostedAuthDialog.tsx'
import { LogOutIcon, SettingsIcon, UserIcon } from '../icons.tsx'
import styles from './WorkBuddyAccountMenu.module.css'

export interface WorkBuddyAccountMenuProps {
  wide?: boolean
  settingsOpen?: boolean
  openSettings?: () => void
  settingsShortcut?: { keys: string[]; aria: string }
}

/**
 * WorkBuddy-styled bottom-left launcher combining user account & system settings.
 *
 * Left: User avatar & Login / Username (Click to log in to SkillHub Server or manage session)
 * Right: Gear icon (Click to open DSH system settings)
 */
export function WorkBuddyAccountMenu(props: WorkBuddyAccountMenuProps): JSX.Element {
  const { wide = true, openSettings } = props
  const [authStatus, setAuthStatus] = useState<SelfhostedAuthStatusDto | null>(null)
  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const reloadAuth = async (): Promise<void> => {
    try {
      const res = await fetchSelfhostedAuthStatus()
      setAuthStatus(res)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void reloadAuth()
    const handleAuthChange = (): void => {
      void reloadAuth()
    }
    window.addEventListener('skills-hub:auth-changed', handleAuthChange)
    return () => window.removeEventListener('skills-hub:auth-changed', handleAuthChange)
  }, [])

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const handleUserClick = (): void => {
    if (authStatus?.loggedIn) {
      setMenuOpen((v) => !v)
    } else {
      setAuthDialogOpen(true)
    }
  }

  const handleLogout = async (): Promise<void> => {
    setMenuOpen(false)
    try {
      await logoutSelfhosted()
      await reloadAuth()
      window.dispatchEvent(new Event('skills-hub:auth-changed'))
    } catch {
      // ignore
    }
  }

  const loggedIn = authStatus?.loggedIn ?? false
  const user = authStatus?.user
  const displayName = user?.displayName || user?.username || '用户'
  const initial = (user?.username || 'U')[0]?.toUpperCase()

  return (
    <div ref={containerRef} className={styles.container} data-wide={wide ? 'true' : 'false'}>
      {/* 1. Account / Login Button */}
      <button
        type="button"
        className={styles.userBtn}
        onClick={handleUserClick}
        title={loggedIn ? `${displayName} (SkillHub Server)` : '登录 SkillHub Server'}
        aria-label={loggedIn ? displayName : '登录'}
      >
        <div className={`${styles.avatar} ${loggedIn ? styles.avatarLoggedIn : ''}`}>
          {loggedIn ? (
            <span>{initial}</span>
          ) : (
            <UserIcon size={14} />
          )}
        </div>
        {wide && (
          <span className={styles.userName}>
            {loggedIn ? displayName : '登录'}
          </span>
        )}
      </button>

      {/* 2. System Settings Gear Button */}
      <button
        type="button"
        className={styles.settingsBtn}
        onClick={() => openSettings?.()}
        title="设置"
        aria-label="设置"
      >
        <SettingsIcon size={16} />
      </button>

      {/* User Popover Menu when logged in */}
      {menuOpen && loggedIn && (
        <div className={styles.userMenu}>
          <div className={styles.menuHeader}>
            <div className={styles.menuUser}>{displayName}</div>
            <div className={styles.menuSource}>SkillHub Server</div>
          </div>
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            onClick={handleLogout}
          >
            <LogOutIcon size={14} />
            <span>退出登录</span>
          </button>
        </div>
      )}

      {/* Auth Dialog */}
      <SelfhostedAuthDialog
        open={authDialogOpen}
        baseUrl={authStatus?.baseUrl || 'http://127.0.0.1:3000'}
        onClose={() => setAuthDialogOpen(false)}
        onSuccess={() => {
          void reloadAuth()
          window.dispatchEvent(new Event('skills-hub:auth-changed'))
        }}
      />
    </div>
  )
}
