/**
 * Client instance tracking and session export service.
 *
 * Designed according to user-selected Passive Probe Model:
 *  - Client does NOT run periodic heartbeat timers in background (zero background requests).
 *  - Client registers itself once on startup or login with its local endpoint URL.
 *  - Server / Admin dashboard actively probes GET /ping and GET /sessions/export.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getProviderBase, providerFetchJson } from "../market/provider-fetch.js";
import { selfhostedAuth } from "../market/selfhosted-auth.js";
export class ClientTrackingService {
    clientId;
    options;
    localPort = 3001;
    constructor(options = {}) {
        this.options = { ...options };
        if (options.port) {
            this.localPort = options.port;
        }
        const dshDir = path.join(os.homedir(), '.dsh');
        this.clientId = this.loadOrCreateClientId(dshDir);
    }
    setPort(port) {
        if (port > 0) {
            this.localPort = port;
        }
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
            endpointUrl: `http://127.0.0.1:${this.localPort}/api/skills-hub`,
            extraMetadata: {
                nodeVersion: process.version,
                user: os.userInfo().username,
            },
        };
    }
    /**
     * One-time registration / heartbeat on startup or login.
     * Does NOT start any background timer.
     */
    async registerInstance() {
        const baseUrl = getProviderBase('selfhosted');
        const url = new URL('/api/client/heartbeat', baseUrl);
        const clientInfo = this.getClientInfo();
        const payload = {
            instanceId: clientInfo.clientId,
            machineName: clientInfo.clientName,
            osPlatform: clientInfo.platform,
            appVersion: clientInfo.appVersion,
            hostVersion: clientInfo.pluginVersion,
            endpointUrl: clientInfo.endpointUrl,
        };
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
            return resp.data?.status === 'ok';
        }
        catch {
            return false;
        }
    }
    /**
     * Start hook: triggers one-time register, NO intervals.
     */
    start() {
        void this.registerInstance().catch(() => undefined);
    }
    stop() {
        // No background timer to clean up
    }
    /**
     * Export all local chat sessions from ~/.dsh/storages/session_projcache.json
     * for server pull.
     */
    exportAllSessions() {
        const dshDir = path.join(os.homedir(), '.dsh');
        const projcachePath = path.join(dshDir, 'storages', 'session_projcache.json');
        const results = [];
        try {
            if (!fs.existsSync(projcachePath)) {
                return results;
            }
            const raw = JSON.parse(fs.readFileSync(projcachePath, 'utf8'));
            const sessionsTable = raw.tables?.sessions || {};
            for (const [id, s] of Object.entries(sessionsTable)) {
                const createdAtMs = s.identity?.createdAt || Date.now();
                const lastPromptAt = s.rows?.sessionListMetadata?.val?.lastPromptAt || createdAtMs;
                const turns = s.rows?.sessionStats?.val?.turns || 1;
                const decodeTokens = s.rows?.sessionStats?.val?.decodeTokens || 0;
                const totalTokens = s.rows?.tokenUsage?.val?.totalTokens || decodeTokens || 0;
                const cwd = s.identity?.cwd || '';
                const wsName = cwd ? path.basename(cwd) : '默认工作区';
                results.push({
                    sessionKey: id,
                    instanceId: this.clientId,
                    title: s.rows?.title?.val || '未命名会话',
                    workspaceName: wsName,
                    workspacePath: cwd,
                    totalTokens: typeof totalTokens === 'number' ? totalTokens : 0,
                    messageCount: typeof turns === 'number' ? turns : 1,
                    sessionCreatedAt: new Date(createdAtMs).toISOString(),
                    sessionUpdatedAt: new Date(lastPromptAt).toISOString(),
                });
            }
        }
        catch {
            // Return whatever could be extracted
        }
        return results;
    }
}
export const clientTrackingService = new ClientTrackingService();
