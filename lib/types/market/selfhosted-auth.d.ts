/**
 * Authentication and Session Manager for Self-Hosted SkillHub (skillhubserver).
 *
 * Implements AgentWork-compatible Bearer JWT authentication:
 *  - POST /api/auth/login -> { data: { user, accessToken, refreshToken } }
 *  - POST /api/auth/refresh -> { data: { user, accessToken, refreshToken } }
 */
export interface SelfhostedUser {
    id: string;
    username: string;
    displayName?: string;
    role?: string;
}
export interface SelfhostedAuthStatus {
    loggedIn: boolean;
    baseUrl: string;
    user?: SelfhostedUser;
}
declare class SelfhostedAuthManager {
    private user;
    private accessToken;
    private refreshToken;
    private configuredToken;
    private configuredUser;
    private configuredPass;
    /** Initialize or update credentials from plugin config. */
    configure(options: {
        username?: string;
        password?: string;
        token?: string;
    }): void;
    /** Retrieve the Authorization header (if authenticated). */
    getAuthHeaders(): Record<string, string>;
    /** Check current authentication status. */
    getStatus(): SelfhostedAuthStatus;
    /** Explicit login via username & password. */
    login(username: string, password: string): Promise<SelfhostedUser>;
    /** Clear session and log out. */
    logout(): void;
    /** Opportunistically login if credentials were configured but no session exists yet. */
    ensureSession(): Promise<void>;
}
export declare const selfhostedAuth: SelfhostedAuthManager;
export {};
