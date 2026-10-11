import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Panel-local locale context.
 *
 * The framework hands the translate seat (`t: TranslateNS<NS>`) to the *slot
 * component* only — `PropsLocale<N>` in
 * `@deepseek-ai/dsh-client-ui-slots/lib/types/index.d.ts` adds it exactly when a
 * registration declares `locale: NS`, and nothing propagates it further down the
 * tree. The presentational components are deliberately prop-shaped (contract
 * §5.4 gives them no `t`), so `MarketPage` — the one component the slot
 * machinery calls — publishes its seat here and every descendant reads it.
 *
 * A context (rather than prop drilling or a module singleton) is what keeps the
 * components pure and testable: a test can render any of them under its own
 * provider without touching the DSH runtime.
 */
import { createContext, useContext } from 'react';
import { zh, en } from "./locales.js";
const LocaleContext = createContext(null);
/** Publish the slot-injected translate seat to the panel's descendants. */
export function LocaleProvider(props) {
    return _jsx(LocaleContext.Provider, { value: props.t, children: props.children });
}
/**
 * Read the panel's translate seat, or gracefully fallback to default dictionary
 * when called outside the panel root (e.g. sidebar slots).
 */
export function useT() {
    const t = useContext(LocaleContext);
    if (t !== null)
        return t;
    return (key, params) => {
        let text = zh[key] ?? en[key] ?? key;
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
            }
        }
        return text;
    };
}
