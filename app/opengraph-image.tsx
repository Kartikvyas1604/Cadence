import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", height: "100%", backgroundColor: "#0B0A08", padding: 80 }}>
        <p style={{ color: "#F0B441", fontSize: 18, fontFamily: "monospace", letterSpacing: 8, margin: 0 }}>SCARCE PER-EPOCH EXECUTION CAPACITY</p>
        <h1 style={{ color: "#EDE8DC", fontSize: 72, fontWeight: 400, margin: "24px 0 16px" }}>Cadence</h1>
        <p style={{ color: "#A39C8B", fontSize: 28, fontFamily: "monospace" }}>Buy a cadence slot. Swap against active depth. No slot, no fill.</p>
        <p style={{ color: "#F0B441", fontSize: 20, fontFamily: "monospace", marginTop: 40 }}>ERC-1155 capacity tickets · Uniswap v4 hook</p>
      </div>
    ),
    size,
  );
}
