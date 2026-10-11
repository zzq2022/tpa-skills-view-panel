import { createHash } from 'node:crypto'
import { inflateRawSync, deflateRawSync, crc32 } from 'node:zlib'

export interface ExtractedZipFile {
  path: string
  content: string
  size: number
  sha256: string
}

/** Reject unsafe or path-traversing file paths in ZIP archive. */
function sanitizeZipEntryPath(rawPath: string): string | null {
  if (!rawPath || rawPath.length > 512) return null
  if (rawPath.includes('\0') || rawPath.includes('\\')) return null
  const normalized = rawPath.replace(/\\+/g, '/').replace(/^\/+/, '')
  if (normalized.startsWith('..') || normalized.includes('/../')) return null
  const parts = normalized.split('/').filter(Boolean)
  if (parts.some((p) => p === '.' || p === '..')) return null
  return parts.join('/')
}

/**
 * Pure TypeScript ZIP parser with zero external runtime dependencies.
 * Reads ZIP local file headers / central directory and inflates entries.
 */
export function extractZipArchive(buffer: Buffer): ExtractedZipFile[] {
  const results: ExtractedZipFile[] = []
  let offset = 0

  while (offset + 30 <= buffer.length) {
    // Check Local File Header signature: PK\x03\x04 (0x04034b50)
    const sig = buffer.readUInt32LE(offset)
    if (sig !== 0x04034b50) {
      break
    }

    const compressionMethod = buffer.readUInt16LE(offset + 8)
    const compressedSize = buffer.readUInt32LE(offset + 18)
    const uncompressedSize = buffer.readUInt32LE(offset + 22)
    const fileNameLength = buffer.readUInt16LE(offset + 26)
    const extraFieldLength = buffer.readUInt16LE(offset + 28)

    const fileNameStart = offset + 30
    const fileName = buffer.toString('utf-8', fileNameStart, fileNameStart + fileNameLength)
    const dataStart = fileNameStart + fileNameLength + extraFieldLength

    // Directory entry (ends with / or size == 0 and has slash)
    const isDir = fileName.endsWith('/')

    if (!isDir && dataStart + compressedSize <= buffer.length) {
      const compressedData = buffer.subarray(dataStart, dataStart + compressedSize)
      let uncompressedData: Buffer

      if (compressionMethod === 0) {
        // Stored (no compression)
        uncompressedData = compressedData
      } else if (compressionMethod === 8) {
        // Deflated
        try {
          uncompressedData = inflateRawSync(compressedData)
        } catch {
          uncompressedData = Buffer.alloc(0)
        }
      } else {
        uncompressedData = Buffer.alloc(0)
      }

      const safePath = sanitizeZipEntryPath(fileName)
      if (safePath) {
        const content = uncompressedData.toString('utf-8')
        const sha256 = createHash('sha256').update(content, 'utf-8').digest('hex')
        results.push({
          path: safePath,
          content,
          size: uncompressedData.length || uncompressedSize,
          sha256,
        })
      }
    }

    offset = dataStart + compressedSize
  }

  return results
}

/**
 * Pure TypeScript ZIP archive generator with zero runtime dependencies.
 * Creates standard PKzip compressed archive with Deflate.
 */
export function createZipArchive(entries: { path: string; data: Buffer }[]): Buffer {
  const localChunks: Buffer[] = []
  const centralChunks: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const rawPath = entry.path.replace(/\\+/g, '/').replace(/^\/+/, '')
    const pathBuffer = Buffer.from(rawPath, 'utf-8')
    const uncompressedData = entry.data
    const uncompressedSize = uncompressedData.length
    const compressedData = deflateRawSync(uncompressedData)
    const compressedSize = compressedData.length
    const checksum = crc32(uncompressedData)

    // Local file header: 30 bytes
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4) // version needed
    localHeader.writeUInt16LE(0, 6) // bit flag
    localHeader.writeUInt16LE(8, 8) // deflate
    localHeader.writeUInt16LE(0, 10) // mod time
    localHeader.writeUInt16LE(0, 12) // mod date
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(compressedSize, 18)
    localHeader.writeUInt32LE(uncompressedSize, 22)
    localHeader.writeUInt16LE(pathBuffer.length, 26)
    localHeader.writeUInt16LE(0, 28) // extra len

    localChunks.push(localHeader, pathBuffer, compressedData)

    // Central directory header: 46 bytes
    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4) // version made by
    centralHeader.writeUInt16LE(20, 6) // version needed
    centralHeader.writeUInt16LE(0, 8) // bit flag
    centralHeader.writeUInt16LE(8, 10) // deflate
    centralHeader.writeUInt16LE(0, 12) // mod time
    centralHeader.writeUInt16LE(0, 14) // mod date
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(compressedSize, 20)
    centralHeader.writeUInt32LE(uncompressedSize, 24)
    centralHeader.writeUInt16LE(pathBuffer.length, 28)
    centralHeader.writeUInt16LE(0, 30) // extra len
    centralHeader.writeUInt16LE(0, 32) // comment len
    centralHeader.writeUInt16LE(0, 34) // disk num start
    centralHeader.writeUInt16LE(0, 36) // internal attr
    centralHeader.writeUInt32LE(0, 38) // external attr
    centralHeader.writeUInt32LE(offset, 42) // relative offset

    centralChunks.push(centralHeader, pathBuffer)

    offset += 30 + pathBuffer.length + compressedSize
  }

  const centralOffset = offset
  const centralBuffer = Buffer.concat(centralChunks)
  const centralSize = centralBuffer.length

  // End of central directory record: 22 bytes
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4) // disk num
  eocd.writeUInt16LE(0, 6) // disk with CD
  eocd.writeUInt16LE(entries.length, 8) // entries this disk
  eocd.writeUInt16LE(entries.length, 10) // total entries
  eocd.writeUInt32LE(centralSize, 12) // CD size
  eocd.writeUInt32LE(centralOffset, 16) // CD offset
  eocd.writeUInt16LE(0, 20) // comment len

  return Buffer.concat([...localChunks, centralBuffer, eocd])
}

