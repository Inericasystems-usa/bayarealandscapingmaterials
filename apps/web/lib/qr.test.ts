import { describe, it, expect } from "vitest";
import { encodeQr, qrPath } from "./qr";

/**
 * The enrolment QR code. The fixture below was checked module for module
 * against an independent encoder (the `qrcode` npm package, same level M and
 * mask) and read back by a decoder (jsQR) when this encoder was written.
 */

const URI = "otpauth://totp/BALM:a%40b.co?secret=JBSWY3DPEHPK3PXP&issuer=BALM";
const FIXTURE = [
  "#######.##.###.#.#.#####.#....#######",
  "#.....#...#.#..##.#.##.#.#..#.#.....#",
  "#.###.#.#...#..###.####..###..#.###.#",
  "#.###.#..#......###..#.#..#...#.###.#",
  "#.###.#...#....##....##..###..#.###.#",
  "#.....#.##....#.###......#..#.#.....#",
  "#######.#.#.#.#.#.#.#.#.#.#.#.#######",
  "...........#####.#.#..#....##........",
  "#.#...##.#..#.#..#.#####..#.#..#..#.#",
  ".##..#...##.........###...####.#.#.##",
  "...##.##.#.###.#.#..#..#.###...##.#.#",
  "...###.#..##.......##.....#.###.##...",
  ".####.#.#.###..#..#....#.#.#####.##.#",
  "...###.###..#..#..####.#.#.#..#......",
  "#...######.###.#.###...###.#####.##.#",
  "##..##.#....#.#...##.#..#.#.....##...",
  "#.##..#....#..#.####.#.###.#.##.##.##",
  "###.........###.###.....##.##.##..###",
  "#.##..#.....###.##.#..#.##.#...####.#",
  "...#.#..##.#...##.#...###..#.##..#.##",
  "#...#.###.#..#...#.##....#.#..#...#..",
  ".#...#..####..#.##.##..#...####....#.",
  "..##..##.#.#..##...#.###..###.###.#.#",
  ".##.##.#...#######..#.#.#...#.#.##...",
  ".##...#.##.###.#.#.#######.#..#.#...#",
  ".....#...####.#..#..###..#.##.##....#",
  "##.####..####.##..#.#..#.#.#..#..##.#",
  "..#......#...#.....##.#.#.##.....#...",
  "##.######...####.#..#.#.#.###########",
  "........###.....#..#####..###...##...",
  "#######.#.#..###.###...#.##.#.#.#.#.#",
  "#.....#..##.#.##..##.#....###...##.##",
  "#.###.#..####..#####.#.###.######..##",
  "#.###.#...##..#.#.#..#..##.###..#.#..",
  "#.###.#.#..##.#.#.##...##.#..#..#...#",
  "#.....#........##.....#.#..##.#......",
  "#######.#..##....#.#....#...#.#.#...#",
];

const rows = (m: boolean[][]) => m.map((r) => r.map((v) => (v ? "#" : ".")).join(""));

describe("QR encoder", () => {
  it("matches the independently checked fixture", () => {
    expect(rows(encodeQr(URI))).toEqual(FIXTURE);
  });

  it("picks the smallest version that holds the text", () => {
    expect(encodeQr("A")).toHaveLength(21); // version 1
    // A real enrolment link (about 190 bytes) fits version 10 at level M.
    const real =
      "otpauth://totp/Bay%20Area%20Landscaping%20Materials:owner%40balm.local?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" +
      "&issuer=Bay%20Area%20Landscaping%20Materials&algorithm=SHA1&digits=6&period=30";
    expect(encodeQr(real)).toHaveLength(10 * 4 + 17);
    expect(() => encodeQr("x".repeat(3000))).toThrow(/too long/);
  });

  it("draws the three finder patterns", () => {
    const m = rows(encodeQr(URI));
    const finder = ["#######", "#.....#", "#.###.#", "#.###.#", "#.###.#", "#.....#", "#######"];
    const n = m.length;
    for (const [x, y] of [[0, 0], [n - 7, 0], [0, n - 7]] as const)
      expect(m.slice(y, y + 7).map((r) => r.slice(x, x + 7))).toEqual(finder);
  });

  it("turns the matrix into one SVG path with a quiet zone", () => {
    expect(qrPath([[true, false], [false, true]], 4)).toBe("M4 4h1v1h-1zM5 5h1v1h-1z");
  });
});
