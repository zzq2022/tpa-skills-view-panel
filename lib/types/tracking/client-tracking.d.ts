/**
 * Client instance tracking and session synchronization service.
 *
 * Automatically reports heartbeat to skillhubserver and synchronizes
 * local DSH chat sessions for admin management and auditing.
 */
export interface ClientTrackingOptions {
    heartbeatIntervalMs?: number;
    skillsRoot?: string | null;
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
    extraMetadata?: Record<string, unknown>;
}
export interface ChatSessionPayload {
    sessionId: string;
    title: string;
    workspacePath?: string;
    messageCount: number;
    sessionCreatedAt?: string;
    sessionUpdatedAt?: string;
    metadata?: Record<string, unknown>;
    messages?: Array<{
        role: string;
        content: string;
        timestamp?: string;
        model?: string;
    }>;
}
export declare class ClientTrackingService {
    private clientId;
    private heartbeatTimer;
    private options;
    private syncCachePath;
    private syncedSessionSignatures;
    private isSyncing;
    constructor(options?: ClientTrackingOptions);
    private loadOrCreateClientId;
    private loadSyncCache;
    private saveSyncCache;
    /** Count installed skills in configured or default DSH directory. */
    getInstalledSkillsCount(): number;
    getClientInfo(): ClientInstanceInfo;
    /** Start background heartbeat and session sync. */
    start(): void;
    /** Stop background timers. */
    stop(): void;
    /** Trigger an immediate heartbeat and sync cycle. */
    pulse(): Promise<void>;
    /** Send client heartbeat to skillhubserver. */
    sendHeartbeat(): Promise<boolean>;
    /** Scan and sync local DSH chat sessions to skillhubserver. */
    syncSessions(): Promise<number>;
    /** Collect modified sessions from ~/.dsh/storages/session_projcache.json */
    private collectPendingSessions;
}
export declare const clientTrackingService: ClientTrackingService;
