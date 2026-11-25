import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

function escapeXml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Builds a clean multi-panel review contact sheet JPEG from labeled image tiles.
 * Never mutates the original source images.
 */
export async function buildContactSheet({
  title,
  subtitle = '',
  tiles,
  columns = 4,
  tileWidth = 480,
  tileHeight = 270,
  outPath,
}) {
  const valid = tiles.filter((t) => t?.path);
  if (valid.length === 0) return null;
  const cols = Math.min(columns, valid.length);
  const rows = Math.ceil(valid.length / cols);
  const headerH = subtitle ? 64 : 44;
  const labelH = 26;
  const pad = 10;
  const width = cols * (tileWidth + pad) + pad;
  const height = headerH + rows * (tileHeight + labelH + pad) + pad;

  const composites = [];
  const headerSvg = `<svg width="${width}" height="${headerH}">
    <rect width="${width}" height="${headerH}" fill="#11161c"/>
    <text x="16" y="28" fill="#f0f4f8" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="700">${escapeXml(title)}</text>
    ${subtitle ? `<text x="16" y="50" fill="#9fb0c2" font-family="Segoe UI, Arial, sans-serif" font-size="13">${escapeXml(subtitle)}</text>` : ''}
  </svg>`;
  composites.push({ input: Buffer.from(headerSvg), left: 0, top: 0 });

  for (let i = 0; i < valid.length; i += 1) {
    const item = valid[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = pad + col * (tileWidth + pad);
    const top = headerH + pad + row * (tileHeight + labelH + pad);
    let tileBuffer = await sharp(item.path)
      .resize(tileWidth, tileHeight, { fit: 'cover' })
      .png()
      .toBuffer();

    // Optional non-destructive defect callout overlay (used by Gallery H).
    if (Array.isArray(item.callouts) && item.callouts.length > 0) {
      const shapes = item.callouts.map((box) => {
        const bx = Math.round(box.x * tileWidth);
        const by = Math.round(box.y * tileHeight);
        const bw = Math.round(box.w * tileWidth);
        const bh = Math.round(box.h * tileHeight);
        const stroke = box.severity === 'critical' ? '#ff3b30' : (box.severity === 'high' ? '#ff9f0a' : '#ffd60a');
        return `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="none" stroke="${stroke}" stroke-width="3" rx="4"/>
          <rect x="${bx}" y="${Math.max(2, by - 18)}" width="${Math.max(44, (box.id?.length ?? 4) * 9 + 12)}" height="18" fill="${stroke}" rx="2"/>
          <text x="${bx + 5}" y="${Math.max(15, by - 5)}" fill="#111" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="700">${escapeXml(box.id ?? '')}</text>`;
      }).join('');
      const overlaySvg = Buffer.from(`<svg width="${tileWidth}" height="${tileHeight}">${shapes}</svg>`);
      tileBuffer = await sharp(tileBuffer).composite([{ input: overlaySvg, left: 0, top: 0 }]).png().toBuffer();
    }

    const badgeColor = item.badgeColor ?? '#1e2730';
    const labelSvg = Buffer.from(`<svg width="${tileWidth}" height="${labelH}">
      <rect width="${tileWidth}" height="${labelH}" fill="${badgeColor}"/>
      <text x="8" y="17" fill="#e6edf3" font-family="Segoe UI, Arial, sans-serif" font-size="12" font-weight="600">${escapeXml(item.label)}</text>
    </svg>`);
    composites.push({ input: labelSvg, left, top });
    composites.push({ input: tileBuffer, left, top: top + labelH });
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await sharp({
    create: { width, height, channels: 3, background: '#0c1015' },
  })
    .composite(composites)
    .jpeg({ quality: 88 })
    .toFile(outPath);

  return outPath;
}
