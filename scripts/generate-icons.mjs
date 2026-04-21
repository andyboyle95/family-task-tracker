// Run: node scripts/generate-icons.mjs
// Requires: npm install -D sharp (one-time)
import sharp from 'sharp'
import { readFileSync } from 'fs'

const svg = readFileSync('./public/icon.svg')
await sharp(Buffer.from(svg)).resize(192, 192).png().toFile('./public/icon-192.png')
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile('./public/icon-512.png')
console.log('Icons generated: icon-192.png, icon-512.png')
