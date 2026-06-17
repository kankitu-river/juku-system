// Node.js 18+ で実行: node scripts/generate-icons.mjs
// sharp が必要: npm install --save-dev sharp

import sharp from 'sharp'
import { mkdirSync } from 'fs'

mkdirSync('public/icons', { recursive: true })

const sizes = [192, 512]

for (const size of sizes) {
  const fontSize = Math.floor(size * 0.45)
  const svg = `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${Math.floor(size * 0.2)}" fill="#1E3A5F"/>
  <text
    x="50%" y="54%"
    font-family="'Hiragino Kaku Gothic ProN','Hiragino Sans','Meiryo',sans-serif"
    font-size="${fontSize}"
    font-weight="bold"
    fill="white"
    text-anchor="middle"
    dominant-baseline="middle"
  >塾</text>
</svg>`

  await sharp(Buffer.from(svg))
    .png()
    .toFile(`public/icons/icon-${size}.png`)

  console.log(`✓ public/icons/icon-${size}.png`)
}

console.log('アイコン生成完了')
