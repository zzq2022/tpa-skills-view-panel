export interface WorkBuddyAccountMenuProps {
    wide?: boolean;
    settingsOpen?: boolean;
    openSettings?: () => void;
    settingsShortcut?: {
        keys: string[];
        aria: string;
    };
}
/**
 * WorkBuddy-styled bottom-left launcher combining user account & system settings.
 *
 * Left: User avatar & Login / Username (Click to log in to SkillHub Server or manage session)
 * Right: Gear icon (Click to open DSH system settings)
 */
export declare function WorkBuddyAccountMenu(props: WorkBuddyAccountMenuProps): JSX.Element;
