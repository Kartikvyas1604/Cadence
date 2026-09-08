import { keccak256, encodeAbiParameters, parseUnits } from "viem";

/**
 * Real commitment hash — must match CadenceSlots.commitHash exactly:
 *   H = keccak256(abi.encode(size, epochId, salt))
 * `sizeEth` is converted to wei so the client-side H equals the contract's.
 */
export function commitHash(sizeEth: number, epochId: number, salt: `0x${string}`): `0x${string}` {
  const sizeWei = parseUnits(String(sizeEth), 18);
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "bytes32" }],
      [sizeWei, BigInt(epochId), salt],
    ),
  );
}

export function randomSalt(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
}

export function shortHash(H: string): string {
  return `${H.slice(0, 10)}…${H.slice(-6)}`;
}
