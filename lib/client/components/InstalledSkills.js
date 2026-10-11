import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
import { useEffect, useRef, useState } from 'react';
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { fetchInstalled, fetchMarketList, installSkill, isAbortError, removeInstalled, uploadInstalledSkillToSelfhosted, } from "../api.js";
import { useT } from "../locale-context.js";
import { DownloadIcon, FolderIcon, RefreshIcon, SearchIcon, TrashIcon, UploadIcon } from "../icons.js";
import { InstalledSkillDetail } from "./InstalledSkillDetail.js";
import { SkillAvatar } from "./SkillAvatar.js";
import { Chip } from "./SkillDetailShell.js";
import styles from './InstalledSkills.module.css';
/** Compare semver versions; returns true if remote is higher than local. */
export function isNewerVersion(remote, local) {
    if (!remote || !local)
        return false;
    if (remote === local)
        return false;
    const rParts = remote.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0);
    const lParts = local.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(rParts.length, lParts.length); i++) {
        const r = rParts[i] || 0;
        const l = lParts[i] || 0;
        if (r > l)
            return true;
        if (r < l)
            return false;
    }
    return false;
}
/** Reader-facing text for anything thrown by the client. */
function messageOf(reason) {
    return reason instanceof Error ? reason.message : String(reason);
}
export function InstalledSkills(props) {
    const t = useT();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [query, setQuery] = useState('');
    const [revision, setRevision] = useState(0);
    const [selectedKey, setSelectedKey] = useState(null);
    const [pending, setPending] = useState(null);
    const [busy, setBusy] = useState(false);
    const [uploadingKey, setUploadingKey] = useState(null);
    const [updatingKey, setUpdatingKey] = useState(null);
    const [notice, setNotice] = useState(null);
    const [returnFocusKey, setReturnFocusKey] = useState(null);
    const [remoteSkills, setRemoteSkills] = useState(new Map());
    /** Row buttons by skill key, so the detail page can hand focus back. */
    const rowButtons = useRef(new Map());
    const handleUpload = async (target) => {
        if (uploadingKey !== null)
            return;
        setUploadingKey(target.key);
        setError(null);
        setNotice(null);
        try {
            await uploadInstalledSkillToSelfhosted(target.key);
            setNotice(t('uploadSuccessNotice'));
            props.onChanged();
            setRevision((r) => r + 1);
        }
        catch (reason) {
            setError(messageOf(reason));
        }
        finally {
            setUploadingKey(null);
        }
    };
    const handleUpdate = async (item, remoteId, remoteOwner) => {
        if (updatingKey !== null)
            return;
        setUpdatingKey(item.key);
        setError(null);
        setNotice(null);
        try {
            await installSkill(remoteId, remoteOwner);
            setNotice(`技能「${item.name}」已成功更新到最新版本！`);
            props.onChanged();
            setRevision((r) => r + 1);
        }
        catch (reason) {
            setError(messageOf(reason));
        }
        finally {
            setUpdatingKey(null);
        }
    };
    useEffect(() => {
        const abort = new AbortController();
        setLoading(true);
        setError(null);
        void fetchInstalled(abort.signal)
            .then((result) => {
            if (!abort.signal.aborted)
                setItems(result);
        })
            .catch((reason) => {
            if (!abort.signal.aborted && !isAbortError(reason))
                setError(messageOf(reason));
        })
            .finally(() => {
            if (!abort.signal.aborted)
                setLoading(false);
        });
        void fetchMarketList({ source: 'selfhosted', security: 'all', installed: 'all', scope: 'market' }, abort.signal)
            .then((res) => {
            if (abort.signal.aborted)
                return;
            const map = new Map();
            for (const mItem of res.items) {
                map.set(mItem.slug.toLowerCase(), {
                    version: mItem.version,
                    id: mItem.id,
                    owner: mItem.author?.displayName || mItem.author?.handle,
                });
            }
            setRemoteSkills(map);
        })
            .catch(() => undefined);
        return () => abort.abort();
    }, [revision]);
    const uninstall = async (target) => {
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            await removeInstalled(target.key);
            setItems((current) => current.filter((item) => item.key !== target.key));
            setSelectedKey((current) => (current === target.key ? null : current));
            setPending(null);
            props.onChanged();
        }
        catch (reason) {
            setError(messageOf(reason));
            setPending(null);
        }
        finally {
            setBusy(false);
        }
    };
    // Resolved against the current rows, not captured when the row was clicked.
    const selected = selectedKey === null ? null : items.find((item) => item.key === selectedKey) ?? null;
    // Returning to the list is a page switch back, so the keyboard cursor goes
    // back to the row that opened the page instead of to the top of the document.
    useEffect(() => {
        if (returnFocusKey === null)
            return;
        rowButtons.current.get(returnFocusKey)?.focus();
        setReturnFocusKey(null);
    }, [returnFocusKey]);
    const needle = query.trim().toLocaleLowerCase();
    const visible = items.filter((item) => `${item.name} ${item.summary ?? ''} ${item.dirPath}`.toLocaleLowerCase().includes(needle));
    return (_jsxs(_Fragment, { children: [selected !== null ? (_jsx(InstalledSkillDetail, { item: selected, remoteInfo: remoteSkills.get(selected.slug.toLowerCase()) ||
                    remoteSkills.get(selected.name.toLowerCase()), onBack: () => {
                    setReturnFocusKey(selected.key);
                    setSelectedKey(null);
                }, onUninstall: setPending, onOpenMarket: props.onOpenMarket, onUpdate: handleUpdate }, selected.key)) : (_jsxs("section", { className: styles.root, children: [_jsxs("div", { className: styles.top, children: [_jsxs("header", { className: styles.header, children: [_jsxs("div", { children: [_jsx("h1", { className: styles.title, children: t('installedTitle') }), _jsx("p", { className: styles.subtitle, children: t('installedScope') })] }), _jsxs("button", { type: "button", className: styles.secondaryButton, disabled: loading, onClick: () => setRevision((value) => value + 1), children: [_jsx(RefreshIcon, { size: 14 }), t('refreshInstalled')] })] }), _jsxs("label", { className: styles.searchField, children: [_jsx(SearchIcon, { size: 16 }), _jsx("input", { className: styles.search, type: "search", "aria-label": t('installedSearch'), placeholder: t('installedSearch'), value: query, onChange: (event) => setQuery(event.target.value) })] })] }), _jsxs("div", { className: styles.canvas, children: [error !== null && (_jsx("p", { role: "alert", className: styles.error, children: error })), notice !== null && (_jsx("p", { role: "status", className: styles.notice, children: notice })), loading ? (_jsx("div", { role: "status", "aria-label": t('loading'), className: styles.list, children: Array.from({ length: 5 }, (_, index) => (_jsx("div", { className: styles.skeleton }, index))) })) : (_jsxs(_Fragment, { children: [_jsx("p", { className: styles.count, children: t('count', { count: visible.length }) }), visible.length === 0 ? (_jsx("p", { className: styles.empty, children: t(items.length === 0 ? 'installedEmpty' : 'emptySearch') })) : (_jsx("div", { className: styles.list, children: visible.map((item) => {
                                            const remoteInfo = remoteSkills.get(item.slug.toLowerCase()) ||
                                                remoteSkills.get(item.dirName.toLowerCase());
                                            const hasUpdate = Boolean(remoteInfo &&
                                                remoteInfo.version &&
                                                isNewerVersion(remoteInfo.version, item.version));
                                            const isFromSelfhosted = item.source === 'selfhosted' || Boolean(remoteInfo);
                                            return (_jsxs("article", { className: styles.card, children: [_jsx(SkillAvatar, { name: item.name, source: isFromSelfhosted ? 'selfhosted' : item.source, size: 44 }), _jsxs("div", { className: styles.info, children: [_jsxs("div", { className: styles.nameRow, children: [_jsx("button", { type: "button", className: styles.name, ref: (node) => {
                                                                            if (node === null)
                                                                                rowButtons.current.delete(item.key);
                                                                            else
                                                                                rowButtons.current.set(item.key, node);
                                                                        }, onClick: () => setSelectedKey(item.key), children: item.name }), item.version !== undefined && item.version !== '' && (_jsxs("span", { className: styles.version, children: ["v", item.version] }))] }), _jsxs("div", { className: styles.chips, children: [_jsx(Chip, { tone: isFromSelfhosted ? 'blue' : 'plain', children: isFromSelfhosted
                                                                            ? 'SkillHub Server'
                                                                            : item.source === 'local'
                                                                                ? t('localSkill')
                                                                                : t(`source.${item.source}`) }), item.linked && _jsx(Chip, { children: t('linkedSkill') })] }), item.summary !== undefined && item.summary !== '' && (_jsx("p", { className: styles.summary, children: item.summary })), _jsxs("p", { className: styles.path, children: [_jsx(FolderIcon, { size: 13 }), _jsx("span", { children: item.dirPath })] })] }), _jsxs("div", { className: styles.actions, children: [_jsx("button", { type: "button", className: styles.secondaryButton, onClick: () => setSelectedKey(item.key), children: t('viewInstalled') }), hasUpdate && remoteInfo ? (_jsxs("button", { type: "button", className: styles.secondaryButton, style: {
                                                                    color: 'var(--dsw-alias-brand-primary, #4d6bfe)',
                                                                    borderColor: 'var(--dsw-alias-brand-primary, #4d6bfe)',
                                                                    fontWeight: 600,
                                                                }, disabled: updatingKey === item.key, onClick: () => handleUpdate(item, remoteInfo.id, remoteInfo.owner), children: [_jsx(DownloadIcon, { size: 14 }), updatingKey === item.key
                                                                        ? t('updatingToVersion')
                                                                        : t('updateToVersion', { version: remoteInfo.version })] })) : isFromSelfhosted ? (_jsx("button", { type: "button", className: styles.secondaryButton, onClick: () => props.onOpenMarket(remoteInfo ? remoteInfo.id : item.id, item.owner || remoteInfo?.owner), children: t('openInMarket') })) : (_jsxs("button", { type: "button", className: styles.secondaryButton, disabled: uploadingKey === item.key, title: t('uploadToSelfhosted'), onClick: () => handleUpload(item), children: [_jsx(UploadIcon, { size: 14 }), uploadingKey === item.key
                                                                        ? t('uploadingToSelfhosted')
                                                                        : t('uploadToSelfhosted')] })), _jsxs("button", { type: "button", className: styles.secondaryButton, disabled: !item.removable, title: item.removable ? undefined : t('uninstallDisabled'), onClick: () => setPending(item), children: [_jsx(TrashIcon, { size: 14 }), t('uninstall')] })] })] }, item.key));
                                        }) }))] }))] })] })), pending !== null && (_jsx(Modal, { open: true, title: t('uninstallTitle', { name: pending.name }), closeLabel: t('close'), description: t(pending.linked ? 'unlinkDescription' : 'localUninstallDescription'), onClose: () => {
                    if (!busy)
                        setPending(null);
                }, footer: _jsxs("div", { className: styles.dialogActions, children: [_jsx(Button, { variant: "outline", size: "md", disabled: busy, onClick: () => setPending(null), children: t('cancel') }), _jsx(Button, { variant: "primary", size: "md", disabled: busy, onClick: () => void uninstall(pending), children: t(busy ? 'uninstalling' : 'uninstallConfirm') })] }), children: _jsx("p", { className: styles.dialogPath, children: pending.dirPath }) }))] }));
}
