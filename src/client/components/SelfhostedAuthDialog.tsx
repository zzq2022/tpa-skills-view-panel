import { useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { useT } from '../locale-context.tsx'
import { loginSelfhosted } from '../api.ts'
import styles from './SelfhostedAuthDialog.module.css'

export interface SelfhostedAuthDialogProps {
  open: boolean
  baseUrl: string
  onClose: () => void
  onSuccess: (user: any) => void
}

export function SelfhostedAuthDialog(props: SelfhostedAuthDialogProps): JSX.Element | null {
  const { open, baseUrl, onClose, onSuccess } = props
  const t = useT()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  if (!open) return null

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (!username.trim() || !password) return

    setBusy(true)
    setErrorMsg('')
    try {
      const resp = await loginSelfhosted(username.trim(), password)
      if (resp.ok) {
        onSuccess(resp.user)
        onClose()
      } else {
        setErrorMsg(t('selfhosted.loginFailed'))
      }
    } catch (err: any) {
      const msg = String(err?.message || '')
      if (msg.includes('401') || msg.includes('invalid_credentials')) {
        setErrorMsg(t('selfhosted.loginFailed'))
      } else {
        setErrorMsg(msg || t('selfhosted.loginFailed'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={t('selfhosted.dialogTitle')}
      description={baseUrl}
      closeLabel={t('dismiss')}
      footer={
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} disabled={busy} onClick={onClose}>
            {t('selfhosted.cancel')}
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={busy || !username.trim() || !password}
            onClick={handleSubmit}
          >
            {busy ? '...' : t('selfhosted.submit')}
          </button>
        </div>
      }
    >
      <form className={styles.body} onSubmit={handleSubmit}>
        <p className={styles.tip}>{t('selfhosted.unauthenticated')}</p>

        {errorMsg && <p className={styles.error}>{errorMsg}</p>}

        <label className={styles.field}>
          <span className={styles.label}>{t('selfhosted.username')}</span>
          <Input
            className={styles.input}
            value={username}
            disabled={busy}
            autoFocus
            onChange={(e) => setUsername(e.currentTarget.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{t('selfhosted.password')}</span>
          <Input
            className={styles.input}
            type="password"
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
        </label>
      </form>
    </Modal>
  )
}
