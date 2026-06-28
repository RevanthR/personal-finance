import sharp from "sharp";
import { mkdirSync } from "fs";

mkdirSync("public/icons", { recursive: true });

// Indian Rupee symbol SVG paths (from Lucide)
// Viewbox 24x24, strokes are white on zinc-900 background
function makeSvg(size) {
  const pad = Math.round(size * 0.18);        // ~18% padding
  const r = Math.round(size * 0.22);          // rounded corner radius
  const iconSize = size - pad * 2;
  const strokeWidth = Math.max(1.5, size / 64); // scale stroke with icon size

  // The rupee icon paths scaled to iconSize, centered in the SVG
  // Original lucide viewBox: 0 0 24 24
  const scale = iconSize / 24;
  const tx = pad;
  const ty = pad;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#18181b"/>
  <!-- Rupee icon (Lucide IndianRupee, scaled) -->
  <g transform="translate(${tx}, ${ty}) scale(${scale})" stroke="white" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M6 3h12"/>
    <path d="M6 8h12"/>
    <path d="m6 13 8.5 8"/>
    <path d="M6 13h3"/>
    <path d="M9 13c6.667 0 6.667-10 0-10"/>
  </g>
</svg>`;
}

const sizes = [
  { name: "icon-192.png",     size: 192 },
  { name: "icon-512.png",     size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "favicon-32.png",   size: 32 },
  { name: "favicon-16.png",   size: 16 },
];

for (const { name, size } of sizes) {
  const svg = Buffer.from(makeSvg(size));
  await sharp(svg).png().toFile(`public/icons/${name}`);
  console.log(`✓ public/icons/${name}`);
}

// Also write the main favicon.ico equivalent as a 32x32 PNG at root
const svg32 = Buffer.from(makeSvg(32));
await sharp(svg32).png().toFile("public/favicon.png");
console.log("✓ public/favicon.png");

console.log("\nDone. All icons generated.");
