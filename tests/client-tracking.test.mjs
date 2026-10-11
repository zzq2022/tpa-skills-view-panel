import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const LIB_FILE = join(ROOT, 'lib', 'tracking', 'client-tracking.js')

test('ClientTrackingService collects client info correctly', async (t) => {
  if (!existsSync(LIB_FILE)) {
    t.skip('lib/tracking/client-tracking.js not built yet')
    return
  }

  const { ClientTrackingService } = await import(pathToFileURL(LIB_FILE).href)
  const service = new ClientTrackingService()
  const info = service.getClientInfo()

  assert.ok(info.clientId, 'clientId must be non-empty')
  assert.ok(info.hostname, 'hostname must be present')
  assert.ok(info.platform, 'platform must be present')
  assert.ok(info.arch, 'arch must be present')
  assert.equal(info.appVersion, 'DeepSeek Harness')
  assert.equal(info.pluginVersion, '0.0.1')
  assert.equal(typeof info.installedSkillsCount, 'number')
})
