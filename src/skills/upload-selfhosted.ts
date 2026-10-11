/**
 * Upload an installed skill from local disk to self-hosted SkillHub (skillhubserver).
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createZipArchive } from '../market/zip-utils.ts'
import { selfhostedAuth } from '../market/selfhosted-auth.ts'
import { getProviderBase } from '../market/provider-fetch.ts'
import { marketCache } from '../market/cache.ts'
import { listEntryFiles } from './management.ts'
import type { InstalledSkillRecord } from './installed.ts'

export class UploadSelfhostedError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'UploadSelfhostedError'
    this.status = status
    this.code = code
  }
}

export async function uploadInstalledSkillToSelfhosted(
  item: InstalledSkillRecord,
): Promise<{ ok: boolean; data: unknown }> {
  // 1. Check authentication status
  const authHeaders = selfhostedAuth.getAuthHeaders()
  if (!authHeaders.Authorization) {
    throw new UploadSelfhostedError(401, 'UNAUTHORIZED', '请先在技能市场中连接并登录自建技能库')
  }

  // 2. Collect files from disk
  const stats = await fs.stat(item.dirPath)
  const isDir = stats.isDirectory()
  const rawFiles = await listEntryFiles(item)
  if (rawFiles.length === 0) {
    throw new UploadSelfhostedError(400, 'EMPTY_SKILL', '该技能目录为空，无法上传')
  }

  const entries: { path: string; data: Buffer }[] = []
  let hasSkillMd = false

  for (const file of rawFiles) {
    const filePath = isDir ? path.join(item.dirPath, file.path) : item.dirPath
    const arcPath = isDir ? file.path.replace(/\\+/g, '/') : 'SKILL.md'
    if (arcPath.toLowerCase() === 'skill.md') {
      hasSkillMd = true
    }
    const data = await fs.readFile(filePath)
    entries.push({ path: arcPath, data })
  }

  if (!hasSkillMd) {
    // Generate minimal SKILL.md if absent
    const fallbackMd = Buffer.from(
      `---\nname: ${item.name}\ndescription: ${item.summary || item.name}\n---\n\n# ${item.name}\n\n${item.summary || ''}\n`,
      'utf-8',
    )
    entries.push({ path: 'SKILL.md', data: fallbackMd })
  }

  // 3. Create zip package and encode as base64
  const zipBuffer = createZipArchive(entries)
  const packageBase64 = zipBuffer.toString('base64')

  // Extract version from SKILL.md frontmatter or fallback to record/1.0.0
  let resolvedVersion = item.version || '1.0.0'
  const skillMdEntry = entries.find((e) => e.path.toLowerCase() === 'skill.md')
  if (skillMdEntry) {
    const text = skillMdEntry.data.toString('utf-8')
    const match = text.match(/^version:\s*['"]?([a-zA-Z0-9._-]+)['"]?/m)
    if (match && match[1]) {
      resolvedVersion = match[1].trim()
    }
  }

  // 4. Prepare payload for /api/skillhub/review-submissions
  const authStatus = selfhostedAuth.getStatus()
  const authorName = item.owner || authStatus.user?.username || 'user'
  const payload = {
    fileName: `${item.slug || item.name || 'skill'}.zip`,
    packageBase64,
    name: item.name,
    description: item.summary || '',
    category: 'other',
    author: authorName,
    version: resolvedVersion,
  }

  const baseUrl = getProviderBase('selfhosted').replace(/\/+$/, '')
  const url = `${baseUrl}/api/skillhub/review-submissions`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(payload),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new UploadSelfhostedError(502, 'UPSTREAM_CONNECT_FAILED', `连接自建服务器失败: ${msg}`)
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    let msg = `上传失败 (HTTP ${response.status})`
    try {
      const parsed = JSON.parse(errorText)
      if (parsed.detail) {
        msg = typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail)
      } else if (parsed.message) {
        msg = parsed.message
      }
    } catch {}
    throw new UploadSelfhostedError(response.status, 'UPSTREAM_ERROR', msg)
  }

  marketCache.clear()
  const json = (await response.json()) as { data?: unknown }
  return { ok: true, data: json.data }
}
