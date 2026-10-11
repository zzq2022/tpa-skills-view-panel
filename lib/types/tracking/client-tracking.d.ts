/**
 * Client instance tracking and session export service.
 *
 * Designed according to user-selected Passive Probe Model:
 *  - Client does NOT run periodic heartbeat timers in background (zero background requests).
 *  - Client registers itself once on startup or login with its local endpoint URL.
 *  - Server / Admin dashboard actively probes GET /ping and GET /sessions/export.
 */
export interface ClientTrackingOptions {
    skillsRoot?: string | null;
    port?: number;
}
export interface ClientInstanceInfo {
    clientId: string;
    clientName: string;
    hostname: string;
    platform: string;
    arch: string;
    appVersion: string;
    pluginVersion: string;
    installedSkillsCount: number;
    endpointUrl: string;
    extraMetadata?: Record<string, unknown>;
}
export interface ChatSessionExportItem {
    sessionKey: string;
    instanceId: string;
    title: string;
    workspaceName?: string;
    workspacePath?: string;
    totalTokens: number;
    messageCount: number;
    sessionCreatedAt?: string;
    sessionUpdatedAt?: string;
    messages?: Array<{
        role: string;
        content: string;
        timestamp?: string;
        model?: string;
    }>;
}
export declare class ClientTrackingService {
    private clientId;
    private options;
    private localPort;
    constructor(options?: ClientTrackingOptions);
    setPort(port: number): void;
    private loadOrCreateClientId;
    /** Count installed skills in configured or default DSH directory. */
    getInstalledSkillsCount(): number;
    getClientInfo(): ClientInstanceInfo;
    /**
     * One-time registration / heartbeat on startup or login.
     * Does NOT start any background timer.
     */
    registerInstance(): Promise<boolean>;
    /**
     * Start hook: triggers one-time register, NO intervals.
     */
    start(): void;
    stop(): void;
    /**
     * Export all local chat sessions from ~/.dsh/storages/session_projcache.json
     * for server pull.
     */
    exportAllSessions(): ChatSessionExportItem[];
}
export declare const clientTrackingService: ClientTrackingService;
