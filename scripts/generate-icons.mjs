// Renders the app icon SVG to the PNG sizes needed for Android/iOS install.
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const mark = (bg, fg, pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" ${pad ? "" : 'rx="112"'} fill="${bg}"/>
  <g transform="translate(${pad ? 96 : 56} ${pad ? 96 : 56}) scale(${pad ? 6.67 : 8.33})">
    <path d="M12 22.5 24 13l12 9.5V34a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V22.5Z" fill="none" stroke="${fg}" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M24 36v-6.5c0-3 2-5.2 5-5.5 0 3-2 5.6-5 6" fill="none" stroke="${fg}" stroke-width="2.2" stroke-linecap="round"/>
  </g>
</svg>`;

const BG = "#3f6b52";
const FG = "#f7f5f0";
const standard = Buffer.from(mark(BG, FG, false));
const maskable = Buffer.from(mark(BG, FG, true)); // full-bleed with safe-zone padding

for (const size of [192, 512]) {
  await sharp(standard).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
  await sharp(maskable).resize(size, size).png().toFile(`public/icons/maskable-${size}.png`);
}
await sharp(standard).resize(180, 180).png().toFile("src/app/apple-icon.png");
writeFileSync("src/app/icon.svg", mark(BG, FG, false));
console.log("icons written");
