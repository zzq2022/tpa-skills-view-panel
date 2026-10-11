/**
 * Self-Hosted SkillHub provider (skillhubserver)
 *
 * Connects to a self-hosted FastAPI instance running skillhubserver.
 * Integrates with /api/skillhub/* and /api/auth/* for public and private skills.
 */

import {
  getProviderBase,
  providerFetch,
  providerFetchJson,
  MarketHttpError,
} from './provider-fetch.ts'
import {
  detectMarketLanguage,
  MARKET_ERROR_CODES,
  MarketUpstreamError,
  skillId,
  type MarketProvider,
  type NormalizedSkill,
  type NormalizedSkillDetail,
  type ProviderFileEntry,
  type ProviderListPage,
} from './types.ts'
import { meaningfulChangelog, parseFrontmatter } from './clawhub-provider.ts'
import { selfhostedAuth } from './selfhosted-auth.ts'
import { extractZipArchive, type ExtractedZipFile } from './zip-utils.ts'

interface SelfhostedItemWire {
  id: string
  name: string
  description?: string
  slug: string
  registrySlug?: string
  authorName?: string
  category?: string
  downloadCount?: number
  starCount?: number
  viewCount?: number
  updatedAt?: string
  isStarred?: boolean
  featured?: boolean
  visibility?: 'private' | 'shared'
  version?: string | number
}

interface SelfhostedDetailWire {
  id: string
  name: string
  description?: string
  visibility?: 'private' | 'shared'
  ownerUserId?: string
  skillMd?: string | null
  skillMdAvailable?: boolean
  slug: string
  approvalStatus?: string | null
  authorName?: string
  category?: string
  starCount?: number
  downloadCount?: number
  viewCount?: number
  updatedAt?: string
  isStarred?: boolean
  featured?: boolean
  version?: string | number
}

// In-memory cache mapping skill slug/id to extracted zip files
const zipCache = new Map<string, { files: ExtractedZipFile[]; timestamp: number }>()
// In-memory mapping from slug to actual backend skill_id
const slugToIdMap = new Map<string, string>()

function normalizeSelfhostedItem(item: SelfhostedItemWire): NormalizedSkill {
  const resolvedSlug =
    item.slug ||
    (item.registrySlug ? item.registrySlug.split('/')[1] : '') ||
    item.name ||
    item.id
  slugToIdMap.set(resolvedSlug, item.id)
  slugToIdMap.set(item.id, item.id)
  const isPrivate = item.visibility === 'private'
  const tags: string[] = []
  if (item.category) tags.push(item.category)
  if (isPrivate) tags.push('私有')

  const parsedDate = item.updatedAt ? new Date(item.updatedAt).getTime() : Date.now()

  return {
    id: skillId('selfhosted', resolvedSlug),
    source: 'selfhosted',
    slug: resolvedSlug,
    name: item.name || resolvedSlug,
    summary: item.description || '',
    author: {
      handle: item.authorName || 'local',
      displayName: item.authorName || 'local',
    },
    stats: {
      downloads: Number(item.downloadCount) || 0,
      installs: Number(item.downloadCount) || 0,
      stars: Number(item.starCount) || 0,
    },
    tags,
    category: item.category || 'general',
    version: item.version ? String(item.version) : '1.0.0',
    updatedAt: Number.isFinite(parsedDate) ? parsedDate : Date.now(),
    securityStatus: 'verified',
    installState: 'installable',
    verified: true,
  }
}

/** Fetch zip archive from backend and cache extracted files in memory. */
async function loadZipForSkill(slugOrId: string): Promise<ExtractedZipFile[]> {
  const cached = zipCache.get(slugOrId)
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return cached.files
  }

  const backendId = slugToIdMap.get(slugOrId) || slugOrId
  const base = getProviderBase('selfhosted')
  const downloadUrl = new URL(`/api/skillhub/${encodeURIComponent(backendId)}/download`, base)

  const headers = selfhostedAuth.getAuthHeaders()
  const res = await providerFetch('selfhosted', downloadUrl.toString(), { headers })

  if (!res.ok) {
    throw new MarketHttpError(
      'selfhosted',
      res.status,
      res.status === 404 ? MARKET_ERROR_CODES.upstreamBadResponse : MARKET_ERROR_CODES.upstreamError,
      `Failed to download skill package from self-hosted server (${res.status})`,
    )
  }

  const arrayBuf = await res.arrayBuffer()
  const buffer = Buffer.from(arrayBuf)
  const files = extractZipArchive(buffer)

  zipCache.set(slugOrId, { files, timestamp: Date.now() })
  if (backendId !== slugOrId) {
    zipCache.set(backendId, { files, timestamp: Date.now() })
  }

  return files
}

export const selfhostedProvider: MarketProvider = {
  source: 'selfhosted',

  async list({ cursor, limit }): Promise<ProviderListPage> {
    await selfhostedAuth.ensureSession()
    const base = getProviderBase('selfhosted')
    const pageNum = cursor ? Math.max(1, Number.parseInt(cursor, 10) || 1) : 1
    const pageLimit = limit || 20

    const url = new URL('/api/skillhub/public', base)
    url.searchParams.set('page', String(pageNum))
    url.searchParams.set('limit', String(pageLimit))

    const headers = selfhostedAuth.getAuthHeaders()
    const resp = await providerFetchJson<{
      data?: {
        items?: SelfhostedItemWire[]
        total?: number
        page?: number
        pageSize?: number
      }
    }>('selfhosted', url.toString(), { headers })

    const rawItems = resp.data?.items || []
    const total = resp.data?.total ?? rawItems.length
    const items = rawItems.map(normalizeSelfhostedItem)

    // If authenticated on page 1, prepend private skills
    if (pageNum === 1 && selfhostedAuth.getStatus().loggedIn) {
      try {
        const privateUrl = new URL('/api/skillhub/private', base)
        const privateResp = await providerFetchJson<{ data?: SelfhostedItemWire[] }>(
          'selfhosted',
          privateUrl.toString(),
          { headers },
        )
        const privateItems = (privateResp.data || []).map((item) =>
          normalizeSelfhostedItem({ ...item, visibility: 'private' }),
        )
        // Deduplicate
        const seenSlugs = new Set(items.map((i) => i.slug))
        for (const p of privateItems) {
          if (!seenSlugs.has(p.slug)) {
            items.unshift(p)
          }
        }
      } catch {
        // Silently continue with public skills if private fetch fails
      }
    }

    const hasMore = pageNum * pageLimit < total

    return {
      items,
      nextCursor: hasMore ? String(pageNum + 1) : undefined,
      total,
    }
  },

  async search({ q, cursor, limit }): Promise<ProviderListPage> {
    await selfhostedAuth.ensureSession()
    const base = getProviderBase('selfhosted')
    const pageNum = cursor ? Math.max(1, Number.parseInt(cursor, 10) || 1) : 1
    const pageLimit = limit || 20

    const url = new URL('/api/skillhub/public/search', base)
    url.searchParams.set('q', q)
    url.searchParams.set('page', String(pageNum))
    url.searchParams.set('limit', String(pageLimit))

    const headers = selfhostedAuth.getAuthHeaders()
    const resp = await providerFetchJson<{
      data?: {
        items?: SelfhostedItemWire[]
        total?: number
      }
    }>('selfhosted', url.toString(), { headers })

    const rawItems = resp.data?.items || []
    const total = resp.data?.total ?? rawItems.length
    const items = rawItems.map(normalizeSelfhostedItem)
    const hasMore = pageNum * pageLimit < total

    return {
      items,
      nextCursor: hasMore ? String(pageNum + 1) : undefined,
      total,
    }
  },

  async detail(slug): Promise<NormalizedSkillDetail> {
    await selfhostedAuth.ensureSession()
    const base = getProviderBase('selfhosted')
    const backendId = slugToIdMap.get(slug) || slug

    const headers = selfhostedAuth.getAuthHeaders()
    let detailData: SelfhostedDetailWire | null = null

    // Try public detail first
    try {
      const publicUrl = new URL(`/api/skillhub/public/${encodeURIComponent(backendId)}`, base)
      const res = await providerFetchJson<{ data?: SelfhostedDetailWire }>('selfhosted', publicUrl.toString(), {
        headers,
      })
      detailData = res.data ?? null
    } catch {
      // Try private detail if logged in
      if (selfhostedAuth.getStatus().loggedIn) {
        try {
          const privUrl = new URL(`/api/skillhub/private/${encodeURIComponent(backendId)}`, base)
          const res = await providerFetchJson<{ data?: SelfhostedDetailWire }>('selfhosted', privUrl.toString(), {
            headers,
          })
          detailData = res.data ?? null
        } catch {
          detailData = null
        }
      }
    }

    if (!detailData) {
      throw new MarketUpstreamError(
        'selfhosted',
        MARKET_ERROR_CODES.upstreamBadResponse,
        `Skill not found on self-hosted server: ${slug}`,
      )
    }

    const item = normalizeSelfhostedItem(detailData)

    // Best-effort file listing
    let files: ProviderFileEntry[] = []
    try {
      files = await selfhostedProvider.listFiles(slug)
    } catch {
      if (detailData.skillMd) {
        files = [{ path: 'SKILL.md', size: Buffer.byteLength(detailData.skillMd, 'utf-8') }]
      }
    }

    let description = detailData.skillMd || item.summary || ''
    let descriptionFrontmatter: Record<string, unknown> | undefined
    if (description.startsWith('---')) {
      const parsed = parseFrontmatter(description)
      description = parsed.content
      descriptionFrontmatter = parsed.frontmatter
    }

    return {
      ...item,
      version: '1.0.0',
      author: {
        handle: detailData.authorName || item.author.handle,
        displayName: detailData.authorName || item.author.displayName,
      },
      securityStatus: 'verified',
      pageUrl: `${base}/skills/${encodeURIComponent(slug)}`,
      description,
      ...(descriptionFrontmatter ? { descriptionFrontmatter } : {}),
      files: files.map((file) => ({
        path: file.path,
        size: file.size,
        sha256: file.sha256,
        contentType: file.contentType,
        language: detectMarketLanguage(file.path),
        tooBig: false,
      })),
      totalSize: files.reduce((sum, file) => sum + file.size, 0),
    }
  },

  async listFiles(slug): Promise<ProviderFileEntry[]> {
    const files = await loadZipForSkill(slug)
    return files.map((f) => ({
      path: f.path,
      size: f.size,
      sha256: f.sha256,
    }))
  },

  async fetchFile(slug, filePath): Promise<{ content: string; size: number }> {
    const files = await loadZipForSkill(slug)
    const match = files.find((f) => f.path === filePath)
    if (!match) {
      throw new MarketHttpError(
        'selfhosted',
        404,
        MARKET_ERROR_CODES.upstreamBadResponse,
        `File ${filePath} not found in selfhosted package ${slug}`,
      )
    }
    return {
      content: match.content,
      size: match.size,
    }
  },
}
