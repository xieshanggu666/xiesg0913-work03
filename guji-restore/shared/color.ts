import type { LabColor } from './types.js';

/** RGB(0..255) → hex */
export function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** sRGB → CIE Lab（先过 XYZ，D65）。供纸/墨色样本比对。 */
export function hexToLab(hex: string): LabColor | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((v) => {
    const s = v / 255;
    return s > 0.04045 ? Math.pow((s + 0.055) / 1.055, 2.4) : s / 12.92;
  });
  // sRGB → XYZ (D65)
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}

/**
 * CIEDE2000 色差（Sharma et al. 实现）。
 * ΔE < 1 视觉几乎无差；1..2 微小差；2..5 可接受；>10 明显不同。
 * 选补纸时这是首要指标，但不是唯一指标（还要看纤维、厚度、帘纹）。
 */
export function deltaE2000(l1: LabColor, l2: LabColor): number {
  const { L: L1, a: a1, b: b1 } = l1;
  const { L: L2, a: a2, b: b2 } = l2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const avgC = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = hueAngle(b1, a1p);
  const h2p = hueAngle(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp: number;
  if (C1p * C2p === 0) dhp = 0;
  else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
  else if (h2p - h1p > 180) dhp = h2p - h1p - 360;
  else dhp = h2p - h1p + 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));

  const avgLp = (L1 + L2) / 2;
  const avgCp = (C1p + C2p) / 2;
  let avgHp: number;
  if (C1p * C2p === 0) avgHp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) avgHp = (h1p + h2p) / 2;
  else if (h1p + h2p < 360) avgHp = (h1p + h2p + 360) / 2;
  else avgHp = (h1p + h2p - 360) / 2;

  const T =
    1 -
    0.17 * Math.cos(rad(avgHp - 30)) +
    0.24 * Math.cos(rad(2 * avgHp)) +
    0.32 * Math.cos(rad(3 * avgHp + 6)) -
    0.2 * Math.cos(rad(4 * avgHp - 63));
  const dTheta = 30 * Math.exp(-sq((avgHp - 275) / 25));
  const Rc = 2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * sq(avgLp - 50)) / Math.sqrt(20 + sq(avgLp - 50));
  const Sc = 1 + 0.045 * avgCp;
  const Sh = 1 + 0.015 * avgCp * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
  const kL = 1;
  const kC = 1;
  const kH = 1;
  return Math.sqrt(
    sq(dLp / (kL * Sl)) +
      sq(dCp / (kC * Sc)) +
      sq(dHp / (kH * Sh)) +
      Rt * (dCp / (kC * Sc)) * (dHp / (kH * Sh))
  );
}

function hueAngle(b: number, ap: number): number {
  if (ap === 0 && b === 0) return 0;
  let h = (Math.atan2(b, ap) * 180) / Math.PI;
  if (h < 0) h += 360;
  return h;
}
function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}
function sq(v: number): number {
  return v * v;
}

/** ΔE2000 → 0..100 的色相符度分（ΔE≤1 满分，≥20 零分，线性映射） */
export function colorMatchScore(dE: number): number {
  const s = 100 - (Math.max(0, dE - 1) * 100) / 19;
  return Math.max(0, Math.min(100, s));
}
