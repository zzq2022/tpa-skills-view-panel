/**
 * Installed skills: the local inventory and its reading page.
 *
 * Two views, one component. The detail page replaces the list *inside* this
 * component rather than in `MarketPage`, so the list is never unmounted: the
 * search query, the loaded rows and the scroll position are all still there when
 * the reader comes back. That is also why the selected row is stored as a key
 * and resolved against the current rows — a refresh that drops the entry closes
 * the page instead of leaving it pointing at something that no longer exists.
 *
 * Removal stays a confirmation modal on purpose: it is a short yes/no about a
 * destructive action, which is exactly what the primitive's dialog is for. The
 * skill's *content* is not, which is why it moved to a page.
 */

import { useEffect, useRef, useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  fetchInstalled,
  fetchMarketList,
  installSkill,
  isAbortError,
  removeInstalled,
  uploadInstalledSkillToSelfhosted,
  type InstalledSkillRecord,
} from '../api.ts'
import { useT } from '../locale-context.tsx'
import { DownloadIcon, FolderIcon, RefreshIcon, SearchIcon, TrashIcon, UploadIcon } from '../icons.tsx'
import { InstalledSkillDetail } from './InstalledSkillDetail.tsx'
import { SkillAvatar } from './SkillAvatar.tsx'
import { Chip } from './SkillDetailShell.tsx'
import styles from './InstalledSkills.module.css'

/** Compare semver versions; returns true if remote is higher than local. */
export function isNewerVersion(remote?: string, local?: string): boolean {
  if (!remote || !local) return false
  if (remote === local) return false
  const rParts = remote.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0)
  const lParts = local.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(rParts.length, lParts.length); i++) {
    const r = rParts[i] || 0
    const l = lParts[i] || 0
    if (r > l) return true
    if (r < l) return false
  }
  return false
}

export interface RemoteSkillInfo {
  id: string
  version?: string
  owner?: string
}

/** Reader-facing text for anything thrown by the client. */
function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

export function InstalledSkills(props: {
  /** A removal changed the local inventory; the market half refreshes too. */
  onChanged: () => void
  /** Open the market page of a skill that came from a market. */
  onOpenMarket: (id: string, owner?: string) => void
}): JSX.Element {
  const t = useT()
  const [items, setItems] = useState<InstalledSkillRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [revision, setRevision] = useState(0)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [pending, setPending] = useState<InstalledSkillRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [updatingKey, setUpdatingKey] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [returnFocusKey, setReturnFocusKey] = useState<string | null>(null)
  const [remoteSkills, setRemoteSkills] = useState<Map<string, { version?: string; id: string; owner?: string }>>(new Map())
  /** Row buttons by skill key, so the detail page can hand focus back. */
  const rowButtons = useRef(new Map<string, HTMLButtonElement>())

  const handleUpload = async (target: InstalledSkillRecord): Promise<void> => {
    if (uploadingKey !== null) return
    setUploadingKey(target.key)
    setError(null)
    setNotice(null)
    try {
      await uploadInstalledSkillToSelfhosted(target.key)
      setNotice(t('uploadSuccessNotice'))
      props.onChanged()
      setRevision((r) => r + 1)
    } catch (reason: unknown) {
      setError(messageOf(reason))
    } finally {
      setUploadingKey(null)
    }
  }

  const handleUpdate = async (item: InstalledSkillRecord, remoteId: string, remoteOwner?: string): Promise<void> => {
    if (updatingKey !== null) return
    setUpdatingKey(item.key)
    setError(null)
    setNotice(null)
    try {
      await installSkill(remoteId, remoteOwner)
      setNotice(`技能「${item.name}」已成功更新到最新版本！`)
      props.onChanged()
      setRevision((r) => r + 1)
    } catch (reason: unknown) {
      setError(messageOf(reason))
    } finally {
      setUpdatingKey(null)
    }
  }

  useEffect(() => {
    const abort = new AbortController()
    setLoading(true)
    setError(null)
    void fetchInstalled(abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) setItems(result)
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted && !isAbortError(reason)) setError(messageOf(reason))
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false)
      })

    void fetchMarketList({ source: 'selfhosted', security: 'all', installed: 'all', scope: 'market' }, abort.signal)
      .then((res) => {
        if (abort.signal.aborted) return
        const map = new Map<string, { version?: string; id: string; owner?: string }>()
        for (const mItem of res.items) {
          map.set(mItem.slug.toLowerCase(), {
            version: mItem.version,
            id: mItem.id,
            owner: mItem.author?.displayName || mItem.author?.handle,
          })
        }
        setRemoteSkills(map)
      })
      .catch(() => undefined)

    return () => abort.abort()
  }, [revision])

  const uninstall = async (target: InstalledSkillRecord): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await removeInstalled(target.key)
      setItems((current) => current.filter((item) => item.key !== target.key))
      setSelectedKey((current) => (current === target.key ? null : current))
      setPending(null)
      props.onChanged()
    } catch (reason) {
      setError(messageOf(reason))
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  // Resolved against the current rows, not captured when the row was clicked.
  const selected = selectedKey === null ? null : items.find((item) => item.key === selectedKey) ?? null

  // Returning to the list is a page switch back, so the keyboard cursor goes
  // back to the row that opened the page instead of to the top of the document.
  useEffect(() => {
    if (returnFocusKey === null) return
    rowButtons.current.get(returnFocusKey)?.focus()
    setReturnFocusKey(null)
  }, [returnFocusKey])

  const needle = query.trim().toLocaleLowerCase()
  const visible = items.filter((item) =>
    `${item.name} ${item.slug ?? ''} ${item.dirName ?? ''} ${item.summary ?? ''} ${item.dirPath}`.toLocaleLowerCase().includes(needle),
  )

  return (
    <>
      {selected !== null ? (
        <InstalledSkillDetail
          key={selected.key}
          item={selected}
          remoteInfo={
            remoteSkills.get(selected.slug.toLowerCase()) ||
            remoteSkills.get(selected.name.toLowerCase())
          }
          onBack={() => {
            setReturnFocusKey(selected.key)
            setSelectedKey(null)
          }}
          onUninstall={setPending}
          onOpenMarket={props.onOpenMarket}
          onUpdate={handleUpdate}
        />
      ) : (
        <section className={styles.root}>
          <div className={styles.top}>
            <header className={styles.header}>
              <div>
                <h1 className={styles.title}>{t('installedTitle')}</h1>
                <p className={styles.subtitle}>{t('installedScope')}</p>
              </div>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={loading}
                onClick={() => setRevision((value) => value + 1)}
              >
                <RefreshIcon size={14} />
                {t('refreshInstalled')}
              </button>
            </header>

            <label className={styles.searchField}>
              <SearchIcon size={16} />
              <input
                className={styles.search}
                type="search"
                aria-label={t('installedSearch')}
                placeholder={t('installedSearch')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>

          <div className={styles.canvas}>
            {error !== null && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            {notice !== null && (
              <p role="status" className={styles.notice}>
                {notice}
              </p>
            )}

            {loading ? (
              <div role="status" aria-label={t('loading')} className={styles.list}>
                {Array.from({ length: 5 }, (_, index) => (
                  <div key={index} className={styles.skeleton} />
                ))}
              </div>
            ) : (
              <>
                <p className={styles.count}>{t('count', { count: visible.length })}</p>
                {visible.length === 0 ? (
                  <p className={styles.empty}>{t(items.length === 0 ? 'installedEmpty' : 'emptySearch')}</p>
                ) : (
                  <div className={styles.list}>
                    {visible.map((item) => {
                      const remoteInfo =
                        remoteSkills.get(item.slug.toLowerCase()) ||
                        remoteSkills.get(item.dirName.toLowerCase())
                      const hasUpdate = Boolean(
                        remoteInfo &&
                        remoteInfo.version &&
                        isNewerVersion(remoteInfo.version, item.version)
                      )
                      const isFromSelfhosted = item.source === 'selfhosted' || Boolean(remoteInfo)

                      return (
                        <article key={item.key} className={styles.card}>
                          <SkillAvatar
                            name={item.name}
                            source={isFromSelfhosted ? 'selfhosted' : item.source}
                            size={44}
                          />
                          <div className={styles.info}>
                            <div className={styles.nameRow}>
                              <button
                                type="button"
                                className={styles.name}
                                ref={(node) => {
                                  if (node === null) rowButtons.current.delete(item.key)
                                  else rowButtons.current.set(item.key, node)
                                }}
                                onClick={() => setSelectedKey(item.key)}
                              >
                                {item.name}
                              </button>
                              {item.slug && item.slug.toLowerCase() !== item.name.toLowerCase() && (
                                <span
                                  style={{
                                    fontSize: 12,
                                    color: 'var(--dsw-alias-label-secondary, #888)',
                                    background: 'var(--dsw-alias-bg-subtle, rgba(125, 125, 125, 0.1))',
                                    padding: '1px 6px',
                                    borderRadius: 4,
                                    marginLeft: 6,
                                    fontFamily: 'monospace',
                                  }}
                                  title={`Slug: ${item.slug}`}
                                >
                                  {item.slug}
                                </span>
                              )}
                              {item.version !== undefined && item.version !== '' && (
                                <span className={styles.version}>v{item.version}</span>
                              )}
                            </div>
                            <div className={styles.chips}>
                              <Chip tone={isFromSelfhosted ? 'blue' : 'plain'}>
                                {isFromSelfhosted
                                  ? 'SkillHub Server'
                                  : item.source === 'local'
                                  ? t('localSkill')
                                  : t(`source.${item.source}`)}
                              </Chip>
                              {item.linked && <Chip>{t('linkedSkill')}</Chip>}
                            </div>
                            {item.summary !== undefined && item.summary !== '' && (
                              <p className={styles.summary}>{item.summary}</p>
                            )}
                            <p className={styles.path}>
                              <FolderIcon size={13} />
                              <span>{item.dirPath}</span>
                            </p>
                          </div>
                          <div className={styles.actions}>
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={() => setSelectedKey(item.key)}
                            >
                              {t('viewInstalled')}
                            </button>

                            {hasUpdate && remoteInfo ? (
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                style={{
                                  color: 'var(--dsw-alias-brand-primary, #4d6bfe)',
                                  borderColor: 'var(--dsw-alias-brand-primary, #4d6bfe)',
                                  fontWeight: 600,
                                }}
                                disabled={updatingKey === item.key}
                                onClick={() => handleUpdate(item, remoteInfo.id, remoteInfo.owner)}
                              >
                                <DownloadIcon size={14} />
                                {updatingKey === item.key
                                  ? t('updatingToVersion')
                                  : t('updateToVersion', { version: remoteInfo.version })}
                              </button>
                            ) : isFromSelfhosted ? (
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                onClick={() =>
                                  props.onOpenMarket(
                                    remoteInfo ? remoteInfo.id : item.id,
                                    item.owner || remoteInfo?.owner
                                  )
                                }
                              >
                                {t('openInMarket')}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                disabled={uploadingKey === item.key}
                                title={t('uploadToSelfhosted')}
                                onClick={() => handleUpload(item)}
                              >
                                <UploadIcon size={14} />
                                {uploadingKey === item.key
                                  ? t('uploadingToSelfhosted')
                                  : t('uploadToSelfhosted')}
                              </button>
                            )}

                            <button
                              type="button"
                              className={styles.secondaryButton}
                              disabled={!item.removable}
                              title={item.removable ? undefined : t('uninstallDisabled')}
                              onClick={() => setPending(item)}
                            >
                              <TrashIcon size={14} />
                              {t('uninstall')}
                            </button>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* Rendered by both views: the detail page's own uninstall button opens the
          same confirmation, and a dialog that only exists in one branch is a
          button that silently does nothing in the other. */}
      {pending !== null && (
        <Modal
          open
          title={t('uninstallTitle', { name: pending.name })}
          closeLabel={t('close')}
          description={t(pending.linked ? 'unlinkDescription' : 'localUninstallDescription')}
          onClose={() => {
            if (!busy) setPending(null)
          }}
          footer={
            <div className={styles.dialogActions}>
              <Button variant="outline" size="md" disabled={busy} onClick={() => setPending(null)}>
                {t('cancel')}
              </Button>
              <Button variant="primary" size="md" disabled={busy} onClick={() => void uninstall(pending)}>
                {t(busy ? 'uninstalling' : 'uninstallConfirm')}
              </Button>
            </div>
          }
        >
          <p className={styles.dialogPath}>{pending.dirPath}</p>
        </Modal>
      )}
    </>
  )
}
