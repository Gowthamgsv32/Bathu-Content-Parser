// Minimal ZIP writer (STORE method — no compression) so we can package a
// month's JSON into a .zip in the browser without a dependency.

function makeCrcTable() {
  const table = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
}

const CRC_TABLE = makeCrcTable()

function crc32(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date = new Date()) {
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() >> 1) & 0x1f)
  const dosDate =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0xf) << 5) |
    (date.getDate() & 0x1f)
  return { dosTime, dosDate }
}

export function createZip(files) {
  // files: [{ name: string, data: Uint8Array }]
  const encoder = new TextEncoder()
  const { dosTime, dosDate } = dosDateTime()

  const localParts = []
  const centralParts = []
  let offset = 0

  for (const file of files) {
    const nameBytes = encoder.encode(file.name)
    const data = file.data
    const crc = crc32(data)

    const localHeader = new DataView(new ArrayBuffer(30))
    localHeader.setUint32(0, 0x04034b50, true)
    localHeader.setUint16(4, 20, true)
    localHeader.setUint16(6, 0, true)
    localHeader.setUint16(8, 0, true)
    localHeader.setUint16(10, dosTime, true)
    localHeader.setUint16(12, dosDate, true)
    localHeader.setUint32(14, crc, true)
    localHeader.setUint32(18, data.length, true)
    localHeader.setUint32(22, data.length, true)
    localHeader.setUint16(26, nameBytes.length, true)
    localHeader.setUint16(28, 0, true)

    localParts.push(new Uint8Array(localHeader.buffer), nameBytes, data)

    const centralHeader = new DataView(new ArrayBuffer(46))
    centralHeader.setUint32(0, 0x02014b50, true)
    centralHeader.setUint16(4, 20, true)
    centralHeader.setUint16(6, 20, true)
    centralHeader.setUint16(8, 0, true)
    centralHeader.setUint16(10, 0, true)
    centralHeader.setUint16(12, dosTime, true)
    centralHeader.setUint16(14, dosDate, true)
    centralHeader.setUint32(16, crc, true)
    centralHeader.setUint32(20, data.length, true)
    centralHeader.setUint32(24, data.length, true)
    centralHeader.setUint16(28, nameBytes.length, true)
    centralHeader.setUint16(30, 0, true)
    centralHeader.setUint16(32, 0, true)
    centralHeader.setUint16(34, 0, true)
    centralHeader.setUint16(36, 0, true)
    centralHeader.setUint32(38, 0, true)
    centralHeader.setUint32(42, offset, true)

    centralParts.push(new Uint8Array(centralHeader.buffer), nameBytes)

    offset += localHeader.byteLength + nameBytes.length + data.length
  }

  const centralStart = offset
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)

  const endRecord = new DataView(new ArrayBuffer(22))
  endRecord.setUint32(0, 0x06054b50, true)
  endRecord.setUint16(4, 0, true)
  endRecord.setUint16(6, 0, true)
  endRecord.setUint16(8, files.length, true)
  endRecord.setUint16(10, files.length, true)
  endRecord.setUint32(12, centralSize, true)
  endRecord.setUint32(16, centralStart, true)
  endRecord.setUint16(20, 0, true)

  const allParts = [...localParts, ...centralParts, new Uint8Array(endRecord.buffer)]
  const totalLength = allParts.reduce((sum, part) => sum + part.length, 0)
  const result = new Uint8Array(totalLength)
  let pos = 0
  for (const part of allParts) {
    result.set(part, pos)
    pos += part.length
  }
  return result
}

export function bytesToBase64(bytes) {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}
