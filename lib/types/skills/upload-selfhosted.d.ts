/**
 * Upload an installed skill from local disk to self-hosted SkillHub (skillhubserver).
 */
import type { InstalledSkillRecord } from './installed.ts';
export declare class UploadSelfhostedError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message: string);
}
export declare function uploadInstalledSkillToSelfhosted(item: InstalledSkillRecord): Promise<{
    ok: boolean;
    data: unknown;
}>;
