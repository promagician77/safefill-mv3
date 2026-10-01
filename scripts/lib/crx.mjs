// CRX3 = "Cr24" + version (3) + header length + signed header + zip.
// We only need the zip; the header (store signatures) is skipped, not trusted.
export function zipFromCrx(buf) {
  if (buf.length < 12 || buf.toString('latin1', 0, 4) !== 'Cr24') throw new Error('not a CRX file');
  const version = buf.readUInt32LE(4);
  if (version !== 3) throw new Error(`unsupported CRX version ${version}`);
  const headerLen = buf.readUInt32LE(8);
  const start = 12 + headerLen;
  if (start >= buf.length) throw new Error('CRX header is truncated');
  return buf.subarray(start);
}

export function makeCrx(zip, header = Buffer.from('test-header')) {
  const head = Buffer.alloc(12);
  head.write('Cr24', 0, 'latin1');
  head.writeUInt32LE(3, 4);
  head.writeUInt32LE(header.length, 8);
  return Buffer.concat([head, header, zip]);
}
