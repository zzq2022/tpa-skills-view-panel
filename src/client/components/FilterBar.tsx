import { useEffect, useState, useCallback } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarketFilters } from '../state.ts'
import { useT } from '../locale-context.tsx'
import { CloseIcon, SearchIcon } from '../icons.tsx'
import { fetchSelfhostedAuthStatus, logoutSelfhosted, type SelfhostedAuthStatusDto } from '../api.ts'
import { SelfhostedAuthDialog } from './SelfhostedAuthDialog.tsx'
import styles from './FilterBar.module.css'

/** Option order for each select; the values are the frozen filter unions. */
const SOURCE_OPTIONS: readonly MarketFilters['source'][] = ['all', 'clawhub', 'skillhub', 'selfhosted']
const SECURITY_OPTIONS: readonly MarketFilters['security'][] = ['all', 'verified', 'benign', 'unknown', 'flagged']
const INSTALLED_OPTIONS: readonly MarketFilters['installed'][] = ['all', 'installable']

/**
 * Search field plus the three catalogue filters.
 *
 * Native `<select>`s rather than a menu primitive: the DSH `Menu` is an
 * anchored popover that needs its own open state and focus return, and three
 * of them side by side would be three focus traps in a row. A `<select>` gets
 * platform keyboard behaviour, a real label association, and renders inside a
 * 720px panel without a portal.
 *
 * The search field is a draft: typing only edits local state, and the query is
 * submitted on Enter (or when the field is emptied/cleared). Enter during IME
 * composition confirms the candidate and must not submit.
 *
 * The result count is announced through a visually hidden live region instead
 * of being printed twice: the visible count lives in the home header, and a
 * screen reader still hears it change when a filter narrows the list.
 */
export function FilterBar(props: {
  filters: MarketFilters
  total: number
  disabled: boolean
  onChange: (patch: Partial<MarketFilters>) => void
}): JSX.Element {
  const { filters, total, disabled, onChange } = props
  const t = useT()
  const [draft, setDraft] = useState(filters.q)
  const [authStatus, setAuthStatus] = useState<SelfhostedAuthStatusDto | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const reloadAuth = useCallback(async () => {
    try {
      const res = await fetchSelfhostedAuthStatus()
      setAuthStatus(res)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    void reloadAuth()
  }, [reloadAuth])

  const handleLogout = async (): Promise<void> => {
    try {
      await logoutSelfhosted()
      await reloadAuth()
      onChange({ q: filters.q })
    } catch {
      // ignore
    }
  }

  // Follow external resets of the submitted query.
  useEffect(() => {
    setDraft(filters.q)
  }, [filters.q])

  const submit = (q: string): void => {
    if (q.trim() === filters.q.trim() && q === filters.q) return
    onChange({ q })
  }

  return (
    <div className={styles.bar}>
      <div className={styles.search}>
        <Input
          className={styles.searchInput}
          icon={<SearchIcon size={16} />}
          value={draft}
          disabled={disabled}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          enterKeyHint="search"
          onChange={(event) => {
            const next = event.currentTarget.value
            setDraft(next)
            // Emptying the field restores the full catalogue without another Enter.
            if (next === '' && filters.q !== '') submit('')
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
            event.preventDefault()
            submit(draft)
          }}
        />
        {draft !== '' && (
          <Button
            variant="ghost"
            size="sm"
            className={styles.clear}
            disabled={disabled}
            aria-label={t('clearSearch')}
            onClick={() => {
              setDraft('')
              submit('')
            }}
            icon={<CloseIcon size={14} />}
          />
        )}
      </div>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('filter.source')}</span>
        <select
          className={styles.select}
          value={filters.source}
          disabled={disabled}
          onChange={(event) => onChange({ source: event.currentTarget.value as MarketFilters['source'] })}
        >
          {SOURCE_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {t(`source.${value}`)}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('filter.security')}</span>
        <select
          className={styles.select}
          value={filters.security}
          disabled={disabled}
          onChange={(event) => onChange({ security: event.currentTarget.value as MarketFilters['security'] })}
        >
          {SECURITY_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {t(`security.${value}`)}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('filter.installed')}</span>
        <select
          className={styles.select}
          value={filters.installed}
          disabled={disabled}
          onChange={(event) => onChange({ installed: event.currentTarget.value as MarketFilters['installed'] })}
        >
          {INSTALLED_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {t(`installed.${value}`)}
            </option>
          ))}
        </select>
      </label>

      {filters.source === 'selfhosted' && authStatus && (
        <div className={styles.authBadge}>
          <span className={authStatus.loggedIn ? styles.authDot : styles.authDotOff} />
          <span>
            {authStatus.loggedIn
              ? `${authStatus.user?.displayName || authStatus.user?.username || '已登录'}`
              : t('selfhosted.unauthenticated')}
          </span>
          {authStatus.loggedIn ? (
            <button type="button" className={styles.authActionBtn} onClick={handleLogout}>
              {t('selfhosted.logout')}
            </button>
          ) : (
            <button type="button" className={styles.authActionBtn} onClick={() => setDialogOpen(true)}>
              {t('selfhosted.login')}
            </button>
          )}
        </div>
      )}

      <SelfhostedAuthDialog
        open={dialogOpen}
        baseUrl={authStatus?.baseUrl || 'http://127.0.0.1:3000'}
        onClose={() => setDialogOpen(false)}
        onSuccess={() => {
          void reloadAuth()
          onChange({ q: filters.q })
        }}
      />

      <p className={styles.srOnly} role="status" aria-live="polite">
        {t('count', { count: total })}
      </p>
    </div>
  )
}
