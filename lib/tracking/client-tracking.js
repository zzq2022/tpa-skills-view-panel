/**
 * Client instance tracking and session synchronization service.
 *
 * Automatically reports heartbeat to skillhubserver and synchronizes
 * local DSH chat sessions for admin management and auditing.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getProviderBase, providerFetchJson } from "../market/provider-fetch.js";
import { selfhostedAuth } from "../market/selfhosted-auth.js";
export class ClientTrackingService {
    clientId;
    heartbeatTimer = null;
    options;
    syncCachePath;
    syncedSessionSignatures = {};
    isSyncing = false;
    constructor(options = {}) {
        this.options = {
            heartbeatIntervalMs: 60_000,
            ...options,
        };
        const dshDir = path.join(os.homedir(), '.dsh');
        this.syncCachePath = path.join(dshDir, 'skills-hub-sync-state.json');
        this.clientId = this.loadOrCreateClientId(dshDir);
        this.loadSyncCache();
    }
    loadOrCreateClientId(dshDir) {
        const idPath = path.join(dshDir, 'skills-hub-client.json');
        try {
            if (fs.existsSync(idPath)) {
                const raw = JSON.parse(fs.readFileSync(idPath, 'utf8'));
                if (typeof raw.clientId === 'string' && raw.clientId.trim().length > 0) {
                    return raw.clientId.trim();
                }
            }
        }
        catch {
            // ignore
        }
        const newId = crypto.randomUUID();
        try {
            if (!fs.existsSync(dshDir)) {
                fs.mkdirSync(dshDir, { recursive: true });
            }
            fs.writeFileSync(idPath, JSON.stringify({ clientId: newId, createdAt: new Date().toISOString() }, null, 2), 'utf8');
        }
        catch {
            // soft fail
        }
        return newId;
    }
    loadSyncCache() {
        try {
            if (fs.existsSync(this.syncCachePath)) {
                const raw = JSON.parse(fs.readFileSync(this.syncCachePath, 'utf8'));
                this.syncedSessionSignatures = raw || {};
            }
        }
        catch {
            this.syncedSessionSignatures = {};
        }
    }
    saveSyncCache() {
        try {
            fs.writeFileSync(this.syncCachePath, JSON.stringify(this.syncedSessionSignatures, null, 2), 'utf8');
        }
        catch {
            // ignore
        }
    }
    /** Count installed skills in configured or default DSH directory. */
    getInstalledSkillsCount() {
        const dir = this.options.skillsRoot || path.join(os.homedir(), '.dsh', 'skills');
        try {
            if (fs.existsSync(dir)) {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                return entries.filter((e) => e.isDirectory()).length;
            }
        }
        catch {
            // ignore
        }
        return 0;
    }
    getClientInfo() {
        return {
            clientId: this.clientId,
            clientName: `${os.userInfo().username}@${os.hostname()}`,
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            appVersion: 'DeepSeek Harness',
            pluginVersion: '0.0.1',
            installedSkillsCount: this.getInstalledSkillsCount(),
            extraMetadata: {
                nodeVersion: process.version,
                user: os.userInfo().username,
            },
        };
    }
    /** Start background heartbeat and session sync. */
    start() {
        if (this.heartbeatTimer)
            return;
        // Immediately execute first cycle asynchronously
        void this.pulse();
        this.heartbeatTimer = setInterval(() => {
            void this.pulse();
        }, this.options.heartbeatIntervalMs);
    }
    /** Stop background timers. */
    stop() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
    /** Trigger an immediate heartbeat and sync cycle. */
    async pulse() {
        await this.sendHeartbeat().catch(() => undefined);
        await this.syncSessions().catch(() => undefined);
    }
    /** Send client heartbeat to skillhubserver. */
    async sendHeartbeat() {
        const baseUrl = getProviderBase('selfhosted');
        const url = new URL('/api/v1/client/heartbeat', baseUrl);
        const payload = this.getClientInfo();
        const authHeaders = selfhostedAuth.getAuthHeaders();
        try {
            const resp = await providerFetchJson('selfhosted', url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders,
                },
                body: JSON.stringify(payload),
            });
            return resp.data?.success ?? true;
        }
        catch {
            return false;
        }
    }
    /** Scan and sync local DSH chat sessions to skillhubserver. */
    async syncSessions() {
        if (this.isSyncing)
            return 0;
        this.isSyncing = true;
        try {
            const baseUrl = getProviderBase('selfhosted');
            const url = new URL('/api/v1/client/sessions/sync', baseUrl);
            const authHeaders = selfhostedAuth.getAuthHeaders();
            const sessionsToSync = this.collectPendingSessions();
            if (sessionsToSync.length === 0) {
                return 0;
            }
            await providerFetchJson('selfhosted', url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders,
                },
                body: JSON.stringify({
                    clientId: this.clientId,
                    sessions: sessionsToSync,
                }),
            });
            // Update sync signatures on success
            for (const s of sessionsToSync) {
                this.syncedSessionSignatures[s.sessionId] = `${s.sessionUpdatedAt || ''}_${s.messageCount}`;
            }
            this.saveSyncCache();
            return sessionsToSync.length;
        }
        catch {
            return 0;
        }
        finally {
            this.isSyncing = false;
        }
    }
    /** Collect modified sessions from ~/.dsh/storages/session_projcache.json */
    collectPendingSessions() {
        const dshDir = path.join(os.homedir(), '.dsh');
        const projcachePath = path.join(dshDir, 'storages', 'session_projcache.json');
        const results = [];
        try {
            if (fs.existsSync(projcachePath)) {
                const raw = JSON.parse(fs.readFileSync(projcachePath, 'utf8'));
                const sessionsTable = raw.tables?.sessions || {};
                for (const [id, s] of Object.entries(sessionsTable)) {
                    const createdAtMs = s.identity?.createdAt || Date.now();
                    const lastPromptAt = s.rows?.sessionListMetadata?.val?.lastPromptAt || createdAtMs;
                    const turns = s.rows?.sessionStats?.val?.turns || 1;
                    const signature = `${new Date(lastPromptAt).toISOString()}_${turns}`;
                    if (this.syncedSessionSignatures[id] === signature) {
                        continue;
                    }
                    results.push({
                        sessionId: id,
                        title: s.rows?.title?.val || '未命名会话',
                        workspacePath: s.identity?.cwd,
                        messageCount: turns,
                        sessionCreatedAt: new Date(createdAtMs).toISOString(),
                        sessionUpdatedAt: new Date(lastPromptAt).toISOString(),
                        metadata: {
                            cwd: s.identity?.cwd,
                            sessionStats: s.rows?.sessionStats?.val,
                            todos: s.rows?.todos?.val,
                            tokenUsage: s.rows?.tokenUsage?.val,
                        },
                    });
                }
            }
        }
        catch {
            // ignore
        }
        return results;
    }
}
export const clientTrackingService = new ClientTrackingService();
