// Mixamo exports embed the full character mesh in every animation file.
// This writes animation-only copies (skeleton nodes + keyframes) to clips/.
import { mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';

const modelsDir = join(dirname(fileURLToPath(import.meta.url)), '../../apps/client/public/models');
const io = new NodeIO();

for (const character of await readdir(modelsDir)) {
    const sourceDir = join(modelsDir, character, 'animations');
    const outputDir = join(modelsDir, character, 'clips');

    let files;
    try {
        files = (await readdir(sourceDir)).filter((file) => file.endsWith('.glb'));
    } catch {
        continue;
    }

    await mkdir(outputDir, { recursive: true });

    for (const file of files) {
        const document = await io.read(join(sourceDir, file));
        const root = document.getRoot();

        for (const list of [root.listMeshes(), root.listSkins(), root.listMaterials(), root.listTextures()]) {
            list.forEach((property) => property.dispose());
        }

        // keepLeaves: bone nodes with no children must survive for retargeting
        await document.transform(prune({ keepLeaves: true }));

        await io.write(join(outputDir, file), document);

        const before = (await stat(join(sourceDir, file))).size;
        const after = (await stat(join(outputDir, file))).size;
        console.log(`${character}/${file}: ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`);
    }
}
