const sharp = require('sharp');

const svg = `
<svg width="512" height="512" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Top Outer Arc looping into Top of S -->
  <path d="M 16 52 C 16 32 32 16 52 16 C 68 16 82 26 86 40" 
        stroke="#ffffff" stroke-width="8" stroke-linecap="round" />
  
  <!-- Bottom Outer Arc looping into Bottom of S -->
  <path d="M 84 48 C 84 68 68 84 48 84 C 32 84 18 74 14 60" 
        stroke="#ffffff" stroke-width="8" stroke-linecap="round" />

  <!-- Center S Shape -->
  <path d="M 32 38 C 32 28 42 26 52 26 C 64 26 72 32 72 40 C 72 49 62 50 50 50 L 36 50 C 26 50 18 56 18 64 C 18 74 28 78 44 78 C 56 78 68 72 68 62" 
        stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
</svg>
`;

async function makeLogo() {
  await sharp(Buffer.from(svg))
    .png()
    .toFile('public/images/logo-saladin.png');
  console.log('Logo generated perfectly!');
}
makeLogo();
