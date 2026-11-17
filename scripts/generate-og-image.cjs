const sharp = require('sharp');
const path = require('path');

async function generateOgImage() {
  const width = 1200;
  const height = 630;

  // Background SVG with rich navy gradient and centered layout
  const bgSvg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#051329"/>
          <stop offset="35%" stop-color="#0a2144"/>
          <stop offset="70%" stop-color="#0f346c"/>
          <stop offset="100%" stop-color="#051329"/>
        </linearGradient>
        <radialGradient id="glow1" cx="50%" cy="35%" r="50%">
          <stop offset="0%" stop-color="#2563eb" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#2563eb" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="glow2" cx="80%" cy="80%" r="45%">
          <stop offset="0%" stop-color="#0284c7" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#0284c7" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      <rect width="${width}" height="${height}" fill="url(#glow1)"/>
      <rect width="${width}" height="${height}" fill="url(#glow2)"/>
      
      <!-- Subtle outer tech border -->
      <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="20" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1.5"/>
      
      <!-- Main Title (Line 1) -->
      <text x="600" y="335" text-anchor="middle" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif" font-size="40" font-weight="700" fill="#ffffff" letter-spacing="0.5">
        HỆ THỐNG QUẢN LÝ HOẠT ĐỘNG
      </text>

      <!-- Main Title (Line 2) -->
      <text x="600" y="395" text-anchor="middle" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif" font-size="40" font-weight="700" fill="#fde047" letter-spacing="0.5">
        VÀ XÉT THI ĐUA - KHEN THƯỞNG
      </text>
      
      <!-- Domain pill badge -->
      <g transform="translate(435, 460)">
        <rect width="330" height="46" rx="23" fill="rgba(255,255,255,0.06)" stroke="rgba(96,165,250,0.35)" stroke-width="1.5"/>
        <text x="165" y="30" text-anchor="middle" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif" font-size="19" font-weight="600" fill="#93c5fd" letter-spacing="0.5">
          thidua.tuoitrefetiuh.com
        </text>
      </g>
    </svg>
  `;

  // Resize logotrang.png to 620px width and place centered at top
  const logoBuffer = await sharp('public/logotrang.png')
    .resize({ width: 620, fit: 'inside' })
    .toBuffer();

  const logoMetadata = await sharp(logoBuffer).metadata();
  const logoLeft = Math.round((width - logoMetadata.width) / 2);
  const logoTop = 150;

  const ogImage = await sharp(Buffer.from(bgSvg))
    .composite([
      {
        input: logoBuffer,
        top: logoTop,
        left: logoLeft,
      }
    ])
    .png()
    .toFile('public/og-image.png');

  console.log('OG image created successfully:', ogImage);
}

generateOgImage().catch(console.error);
