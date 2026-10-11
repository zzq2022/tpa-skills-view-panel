export interface SelfhostedAuthDialogProps {
    open: boolean;
    baseUrl: string;
    onClose: () => void;
    onSuccess: (user: any) => void;
}
export declare function SelfhostedAuthDialog(props: SelfhostedAuthDialogProps): JSX.Element | null;
