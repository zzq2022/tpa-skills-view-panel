import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { useT } from "../locale-context.js";
import { loginSelfhosted } from "../api.js";
import styles from './SelfhostedAuthDialog.module.css';
export function SelfhostedAuthDialog(props) {
    const { open, baseUrl, onClose, onSuccess } = props;
    const t = useT();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    if (!open)
        return null;
    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!username.trim() || !password)
            return;
        setBusy(true);
        setErrorMsg('');
        try {
            const resp = await loginSelfhosted(username.trim(), password);
            if (resp.ok) {
                onSuccess(resp.user);
                onClose();
            }
            else {
                setErrorMsg(t('selfhosted.loginFailed'));
            }
        }
        catch (err) {
            const msg = String(err?.message || '');
            if (msg.includes('401') || msg.includes('invalid_credentials')) {
                setErrorMsg(t('selfhosted.loginFailed'));
            }
            else {
                setErrorMsg(msg || t('selfhosted.loginFailed'));
            }
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsx(Modal, { open: open, onClose: busy ? () => { } : onClose, title: t('selfhosted.dialogTitle'), description: baseUrl, closeLabel: t('dismiss'), footer: _jsxs("div", { className: styles.actions, children: [_jsx("button", { type: "button", className: styles.secondary, disabled: busy, onClick: onClose, children: t('selfhosted.cancel') }), _jsx("button", { type: "button", className: styles.primary, disabled: busy || !username.trim() || !password, onClick: handleSubmit, children: busy ? '...' : t('selfhosted.submit') })] }), children: _jsxs("form", { className: styles.body, onSubmit: handleSubmit, children: [_jsx("p", { className: styles.tip, children: t('selfhosted.unauthenticated') }), errorMsg && _jsx("p", { className: styles.error, children: errorMsg }), _jsxs("label", { className: styles.field, children: [_jsx("span", { className: styles.label, children: t('selfhosted.username') }), _jsx(Input, { className: styles.input, value: username, disabled: busy, autoFocus: true, onChange: (e) => setUsername(e.currentTarget.value) })] }), _jsxs("label", { className: styles.field, children: [_jsx("span", { className: styles.label, children: t('selfhosted.password') }), _jsx(Input, { className: styles.input, type: "password", value: password, disabled: busy, onChange: (e) => setPassword(e.currentTarget.value) })] })] }) }));
}
