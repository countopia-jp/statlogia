// 扉絵を変換して置く（扉絵＋カード用の縮小版）
//   閲覧室・別館：node scripts/room-art.mjs <窓口id> <元の画像>
//   展示：        node scripts/room-art.mjs exhibit <展示slug> <元の画像>
// 16:9の中央で切り抜き、1400×788（q82）と 560×315（q78）の webp を書く
import sharp from 'sharp';
const args = process.argv.slice(2);
const isExhibit = args[0] === 'exhibit';
const [id, src] = isExhibit ? args.slice(1) : args;
if (!id || !src) {
  console.error('使い方：node scripts/room-art.mjs <窓口id> <元の画像>／node scripts/room-art.mjs exhibit <展示slug> <元の画像>');
  process.exit(1);
}
const dir = isExhibit ? 'public/images/exhibits' : 'public/images/icon';
await sharp(src).resize(1400, 788, { fit: 'cover', position: 'centre' }).webp({ quality: 82 }).toFile(`${dir}/${id}-large.webp`);
await sharp(src).resize(560, 315, { fit: 'cover', position: 'centre' }).webp({ quality: 78 }).toFile(`${dir}/${id}-thumb.webp`);
console.log(`${dir}/${id}-large.webp と ${id}-thumb.webp を置きました`);
