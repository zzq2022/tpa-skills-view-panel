/**
 * Authentication and Session Manager for Self-Hosted SkillHub (skillhubserver).
 *
 * Implements AgentWork-compatible Bearer JWT authentication:
 *  - POST /api/auth/login -> { data: { user, accessToken, refreshToken } }
 *  - POST /api/auth/refresh -> { data: { user, accessToken, refreshToken } }
 */

import { getProviderBase, providerFetchJson } from './provider-fetch.ts'

export interface SelfhostedUser {
  id: string
  username: string
  displayName?: string
  role?: string
}

export interface SelfhostedAuthStatus {
  loggedIn: boolean
  baseUrl: string
  user?: SelfhostedUser
}

class SelfhostedAuthManager {
  private user: SelfhostedUser | null = null
  private accessToken: string | null = null
  private refreshToken: string | null = null
  private configuredToken: string | null = null
  private configuredUser: string | null = null
  private configuredPass: string | null = null

  /** Initialize or update credentials from plugin config. */
  configure(options: {
    username?: string
    password?: string
    token?: string
  }): void {
    this.configuredToken = options.token?.trim() || null
    this.configuredUser = options.username?.trim() || null
    this.configuredPass = options.password?.trim() || null

    if (this.configuredToken) {
      this.accessToken = this.configuredToken
      this.user = {
        id: 'token-user',
        username: 'token-authenticated',
        displayName: 'Token User',
      }
    }
  }

  /** Retrieve the Authorization header (if authenticated). */
  getAuthHeaders(): Record<string, string> {
    const token = this.accessToken || this.configuredToken
    if (!token) return {}
    return {
      Authorization: `Bearer ${token}`,
    }
  }

  /** Check current authentication status. */
  getStatus(): SelfhostedAuthStatus {
    const baseUrl = getProviderBase('selfhosted')
    const hasToken = Boolean(this.accessToken || this.configuredToken)
    return {
      loggedIn: hasToken,
      baseUrl,
      user: this.user ?? undefined,
    }
  }

  /** Explicit login via username & password. */
  async login(username: string, password: string): Promise<SelfhostedUser> {
    const baseUrl = getProviderBase('selfhosted')
    const url = new URL('/api/auth/login', baseUrl)

    const resp = await providerFetchJson<{
      data?: {
        user?: SelfhostedUser
        accessToken?: string
        refreshToken?: string
      }
      code?: number
      message?: string
    }>('selfhosted', url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    })

    if (!resp.data?.accessToken) {
      throw new Error(resp.message || 'Login failed: missing access token')
    }

    this.accessToken = resp.data.accessToken
    this.refreshToken = resp.data.refreshToken || null
    this.user = resp.data.user || {
      id: username,
      username,
      displayName: username,
    }

    return this.user
  }

  /** Clear session and log out. */
  logout(): void {
    this.accessToken = null
    this.refreshToken = null
    this.user = null
    this.configuredToken = null
  }

  /** Opportunistically login if credentials were configured but no session exists yet. */
  async ensureSession(): Promise<void> {
    if (this.accessToken || this.configuredToken) {
      return
    }
    if (this.configuredUser && this.configuredPass) {
      try {
        await this.login(this.configuredUser, this.configuredPass)
      } catch {
        // Soft fail; will remain unauthenticated for public access.
      }
    }
  }
}

export const selfhostedAuth = new SelfhostedAuthManager()
