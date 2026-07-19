import sharp from 'sharp';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconPath = resolve(__dirname, '../src/assets/icon.png');

async function resizeIcon() {
  const metadata = await sharp(iconPath).metadata();
  console.log(`Current dimensions: ${metadata.width}x${metadata.height}`);
  
  // Make it square: use the largest dimension as the square size, then resize to 1024x1024
  const maxDim = Math.max(metadata.width, metadata.height);
  const size = Math.min(maxDim, 1024);
  
  // Create a square canvas with white background, center the image
  const buffer = await sharp(iconPath)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 },
      position: 'center'
    })
    .png()
    .toBuffer();
  
  writeFileSync(iconPath, buffer);
  const newMeta = await sharp(iconPath).metadata();
  console.log(`New dimensions: ${newMeta.width}x${newMeta.height}`);
  console.log('Icon resized successfully!');
}

resizeIcon().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
