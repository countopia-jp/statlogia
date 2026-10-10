// 閲覧室の扉絵を変換して置く：node scripts/room-art.mjs <窓口id> <元の画像>
// 16:9の中央で切り抜き、1400×788のwebp（品質82）にして public/images/icon/<窓口id>-large.webp に書く
import sharp from 'sharp';
const [id, src] = process.argv.slice(2);
if (!id || !src) {
  console.error('使い方：node scripts/room-art.mjs <窓口id> <元の画像>');
  process.exit(1);
}
const out = `public/images/icon/${id}-large.webp`;
await sharp(src).resize(1400, 788, { fit: 'cover', position: 'centre' }).webp({ quality: 82 }).toFile(out);
console.log(`${out} に置きました`);
