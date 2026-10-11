import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { fetchSelfhostedAuthStatus, logoutSelfhosted } from "../api.js";
import { SelfhostedAuthDialog } from "./SelfhostedAuthDialog.js";
import { LogOutIcon, SettingsIcon, UserIcon } from "../icons.js";
import styles from './WorkBuddyAccountMenu.module.css';
/**
 * WorkBuddy-styled bottom-left launcher combining user account & system settings.
 *
 * Left: User avatar & Login / Username (Click to log in to SkillHub Server or manage session)
 * Right: Gear icon (Click to open DSH system settings)
 */
export function WorkBuddyAccountMenu(props) {
    const { wide = true, openSettings } = props;
    const [authStatus, setAuthStatus] = useState(null);
    const [authDialogOpen, setAuthDialogOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const containerRef = useRef(null);
    const reloadAuth = async () => {
        try {
            const res = await fetchSelfhostedAuthStatus();
            setAuthStatus(res);
        }
        catch {
            // ignore
        }
    };
    useEffect(() => {
        void reloadAuth();
        const handleAuthChange = () => {
            void reloadAuth();
        };
        window.addEventListener('skills-hub:auth-changed', handleAuthChange);
        return () => window.removeEventListener('skills-hub:auth-changed', handleAuthChange);
    }, []);
    // Close menu when clicking outside
    useEffect(() => {
        if (!menuOpen)
            return;
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setMenuOpen(false);
            }
        };
        window.addEventListener('mousedown', handleClickOutside);
        return () => window.removeEventListener('mousedown', handleClickOutside);
    }, [menuOpen]);
    const handleUserClick = () => {
        if (authStatus?.loggedIn) {
            setMenuOpen((v) => !v);
        }
        else {
            setAuthDialogOpen(true);
        }
    };
    const handleLogout = async () => {
        setMenuOpen(false);
        try {
            await logoutSelfhosted();
            await reloadAuth();
            window.dispatchEvent(new Event('skills-hub:auth-changed'));
        }
        catch {
            // ignore
        }
    };
    const loggedIn = authStatus?.loggedIn ?? false;
    const user = authStatus?.user;
    const displayName = user?.displayName || user?.username || '用户';
    const initial = (user?.username || 'U')[0]?.toUpperCase();
    return (_jsxs("div", { ref: containerRef, className: styles.container, "data-wide": wide ? 'true' : 'false', children: [_jsxs("button", { type: "button", className: styles.userBtn, onClick: handleUserClick, title: loggedIn ? `${displayName} (SkillHub Server)` : '登录 SkillHub Server', "aria-label": loggedIn ? displayName : '登录', children: [_jsx("div", { className: `${styles.avatar} ${loggedIn ? styles.avatarLoggedIn : ''}`, children: loggedIn ? (_jsx("span", { children: initial })) : (_jsx(UserIcon, { size: 14 })) }), wide && (_jsx("span", { className: styles.userName, children: loggedIn ? displayName : '登录' }))] }), _jsx("button", { type: "button", className: styles.settingsBtn, onClick: () => openSettings?.(), title: "\u8BBE\u7F6E", "aria-label": "\u8BBE\u7F6E", children: _jsx(SettingsIcon, { size: 16 }) }), menuOpen && loggedIn && (_jsxs("div", { className: styles.userMenu, children: [_jsxs("div", { className: styles.menuHeader, children: [_jsx("div", { className: styles.menuUser, children: displayName }), _jsx("div", { className: styles.menuSource, children: "SkillHub Server" })] }), _jsxs("button", { type: "button", className: `${styles.menuItem} ${styles.menuItemDanger}`, onClick: handleLogout, children: [_jsx(LogOutIcon, { size: 14 }), _jsx("span", { children: "\u9000\u51FA\u767B\u5F55" })] })] })), _jsx(SelfhostedAuthDialog, { open: authDialogOpen, baseUrl: authStatus?.baseUrl || 'http://127.0.0.1:3000', onClose: () => setAuthDialogOpen(false), onSuccess: () => {
                    void reloadAuth();
                    window.dispatchEvent(new Event('skills-hub:auth-changed'));
                } })] }));
}
