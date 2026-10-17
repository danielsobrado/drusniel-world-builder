/** Convert authored sRGB pigment to the renderer's linear working space. */
export function linearColor(hex) {
  const packed = Number.parseInt(hex.slice(1), 16);
  return [16, 8, 0].map(shift => {
    const value = ((packed >>> shift) & 255) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
}
