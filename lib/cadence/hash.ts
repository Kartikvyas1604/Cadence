/**
 * Demo stand-in for the onchain commitment:
 *   H = keccak256(abi.encode(size, epochId, salt))
 * Deterministic per (size, epochId, salt) so reveal verification in the
 * reducer mirrors the hook's check. Contracts use keccak256; this is UI-only.
 */
export function commitHash(size: number, epochId: number, salt: string): string {
  const input = `cadence-intent:${size.toFixed(6)}:${epochId}:${salt}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let s = h || 0x9e3779b9;
  let out = "0x";
  for (let i = 0; i < 32; i++) {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    out += ((s >>> 24) & 0xff).toString(16).padStart(2, "0");
  }
  return out;
}

export function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function shortHash(H: string): string {
  return `${H.slice(0, 10)}…${H.slice(-6)}`;
}
