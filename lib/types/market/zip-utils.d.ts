export interface ExtractedZipFile {
    path: string;
    content: string;
    size: number;
    sha256: string;
}
/**
 * Pure TypeScript ZIP parser with zero external runtime dependencies.
 * Reads ZIP local file headers / central directory and inflates entries.
 */
export declare function extractZipArchive(buffer: Buffer): ExtractedZipFile[];
/**
 * Pure TypeScript ZIP archive generator with zero runtime dependencies.
 * Creates standard PKzip compressed archive with Deflate.
 */
export declare function createZipArchive(entries: {
    path: string;
    data: Buffer;
}[]): Buffer;
