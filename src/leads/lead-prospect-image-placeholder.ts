import sharp from 'sharp';

/**
 * Placeholder sin <text>: en Docker `bookworm-slim` no hay fuentes tipográficas
 * y Sharp/librsvg renderiza cada glifo como tofu (cuadritos blancos).
 */
export async function buildProspectImagePlaceholder(
  brandColor: string,
): Promise<Buffer> {
  const safeColor = /^#[0-9A-Fa-f]{6}$/.test(brandColor.trim())
    ? brandColor.trim()
    : '#a31621';

  const svg = `
    <svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${safeColor}" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="#1c1917" stop-opacity="0.92"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill="url(#g)"/>
      <circle cx="600" cy="420" r="78" fill="#faf6f0" fill-opacity="0.12"/>
      <circle cx="600" cy="420" r="52" fill="none" stroke="#faf6f0" stroke-opacity="0.55" stroke-width="3"/>
      <rect x="560" y="392" width="80" height="14" rx="3" fill="#faf6f0" fill-opacity="0.85"/>
      <rect x="575" y="416" width="50" height="10" rx="2" fill="#faf6f0" fill-opacity="0.45"/>
      <rect x="480" y="540" width="240" height="8" rx="4" fill="#faf6f0" fill-opacity="0.28"/>
    </svg>`;

  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}
