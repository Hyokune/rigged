// Merges every .glb in assets/ into public/models/arcade.glb and de-duplicates shared textures.
// The asset pack embeds the same 500 KB texture in every plushie, so this cuts the download from ~10 MB to ~2.5 MB.
// Run with: npm run pack-models
import { readdirSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, unpartition, dedup, prune } from '@gltf-transform/functions';

const SRC = 'assets';
const OUT_DIR = 'public/models';
const OUT = join(OUT_DIR, 'arcade.glb');

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
// The Toy Claw cabinet and its colour sets are in the pack but not used by the game, so leave them out of the download.
const SKIP = /^(Toy_Claw|ColorSet)_/;
const files = readdirSync(SRC).filter((f) => f.toLowerCase().endsWith('.glb') && !SKIP.test(f)).sort();

if (!files.length) {
  throw new Error(`No .glb files found in ${SRC}/`);
}

const doc = await io.read(join(SRC, files[0]));

for (const f of files.slice(1)) {
  mergeDocuments(doc, await io.read(join(SRC, f)));
}

// Put every model's root node into a single scene so they can be looked up by name.
const root = doc.getRoot();
const [scene, ...rest] = root.listScenes();

for (const s of rest) {
  for (const node of s.listChildren()) {
    scene.addChild(node);
  }

  s.dispose();
}

root.setDefaultScene(scene);

await doc.transform(unpartition(), dedup(), prune());
mkdirSync(OUT_DIR, { recursive: true });
await io.write(OUT, doc);

const before = files.reduce((n, f) => n + statSync(join(SRC, f)).size, 0);

console.log(`Packed ${files.length} models: ${(before / 1e6).toFixed(1)} MB -> ${(statSync(OUT).size / 1e6).toFixed(1)} MB (${OUT})`);
console.log('Nodes:', scene.listChildren().map((n) => n.getName()).join(', '));
