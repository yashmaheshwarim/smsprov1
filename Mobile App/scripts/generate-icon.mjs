import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';

const SIZE = 1024;
const CENTER = SIZE / 2;

// ─── Main App Icon (1024×1024 with background) ──────────────────────────────

const iconSvg = `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#4f46e5"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="12" flood-color="#1e1b4b" flood-opacity="0.3"/>
    </filter>
  </defs>
  <rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="220" ry="220" fill="url(#bg)"/>
  <ellipse cx="${CENTER}" cy="120" rx="300" ry="200" fill="rgba(255,255,255,0.08)"/>
  <text x="${CENTER}" y="${CENTER + 80}" text-anchor="middle"
        font-family="system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
        font-size="560" font-weight="800" fill="#ffffff" filter="url(#shadow)" letter-spacing="-8">A</text>
  <circle cx="${CENTER + 280}" cy="${CENTER - 260}" r="32" fill="#818cf8" opacity="0.9"/>
  <circle cx="${CENTER + 315}" cy="${CENTER - 295}" r="16" fill="#a5b4fc" opacity="0.7"/>
  <rect x="${CENTER - 120}" y="${CENTER + 200}" width="240" height="12" rx="6" fill="rgba(255,255,255,0.25)"/>
</svg>`;

// ─── Android Adaptive Icon Foreground (transparent bg, icon only) ────────────

const foregroundSvg = `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="12" flood-color="#1e1b4b" flood-opacity="0.3"/>
    </filter>
  </defs>
  <text x="${CENTER}" y="${CENTER + 80}" text-anchor="middle"
        font-family="system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
        font-size="600" font-weight="800" fill="#4f46e5" filter="url(#shadow)" letter-spacing="-8">A</text>
  <circle cx="${CENTER + 280}" cy="${CENTER - 270}" r="36" fill="#818cf8" opacity="0.85"/>
  <circle cx="${CENTER + 320}" cy="${CENTER - 310}" r="18" fill="#a5b4fc" opacity="0.65"/>
</svg>`;

// ─── Generate PNGs ──────────────────────────────────────────────────────────

mkdirSync('src/assets', { recursive: true });

const iconBuffer = await sharp(Buffer.from(iconSvg))
  .resize(SIZE, SIZE)
  .png()
  .toBuffer();
writeFileSync('src/assets/icon.png', iconBuffer);
console.log(`✅ icon.png: ${(iconBuffer.length / 1024).toFixed(1)} KB`);

const fgBuffer = await sharp(Buffer.from(foregroundSvg))
  .resize(SIZE, SIZE)
  .png()
  .toBuffer();
writeFileSync('src/assets/adaptive-icon-foreground.png', fgBuffer);
console.log(`✅ adaptive-icon-foreground.png: ${(fgBuffer.length / 1024).toFixed(1)} KB`);
