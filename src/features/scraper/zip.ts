export type ZipEntry = { name: string; bytes: Uint8Array };

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;

export const isZip = (bytes: Uint8Array): boolean =>
  bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

const findEocd = (view: DataView): number => {
  const stop = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let i = view.byteLength - 22; i >= stop; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) return i;
  }
  throw new Error('ZIP: end of central directory not found');
};

const decodeName = (bytes: Uint8Array, flags: number): string => {
  if (flags & 0x800) return new TextDecoder('utf-8').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('shift_jis').decode(bytes);
  }
};

const inflateRaw = async (data: Uint8Array): Promise<Uint8Array> => {
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

export const extractZip = async (input: Uint8Array): Promise<ZipEntry[]> => {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const eocd = findEocd(view);
  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const base = input.byteOffset;
  const out: ZipEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (view.getUint32(ptr, true) !== SIG_CENTRAL) throw new Error('ZIP: corrupt central directory');
    const flags = view.getUint16(ptr + 8, true);
    const method = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = decodeName(new Uint8Array(input.buffer, base + ptr + 46, nameLen), flags);

    const next = ptr + 46 + nameLen + extraLen + commentLen;
    if (compressedSize === 0xffffffff || localOffset === 0xffffffff) throw new Error('ZIP: zip64 archives are not supported');

    if (!name.endsWith('/')) {
      const localNameLen = view.getUint16(localOffset + 26, true);
      const localExtraLen = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLen + localExtraLen;
      const raw = new Uint8Array(input.buffer, base + start, compressedSize);
      const bytes = method === 0 ? new Uint8Array(raw) : method === 8 ? await inflateRaw(raw) : null;
      if (!bytes) throw new Error(`ZIP: unsupported compression method ${method} for ${name}`);
      out.push({ name, bytes });
    }
    ptr = next;
  }
  return out;
};