// Builds the character models the game loads from the Mixamo downloads in
// assets-src/, by running build-character.py inside Blender. See docs/ASSETS.md.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger, NodeIO } from '@gltf-transform/core';

const toolDir = dirname(fileURLToPath(import.meta.url));
const sourceRoot = join(toolDir, '../../assets-src');
const modelsDir = join(toolDir, '../../apps/client/public/models');
// A character folder with no animations/ of its own plays this character's clips
const CLIP_SOURCE = 'y-bot';
const WINDOWS_BLENDER_ROOT = '/mnt/c/Program Files/Blender Foundation';

/**
 * BLENDER if set, else `blender` on the PATH, else the newest Blender installed on the Windows side of WSL
 */
function findBlender() {
    if (process.env.BLENDER) return process.env.BLENDER;
    if (spawnSync('blender', ['--version']).status === 0) return 'blender';

    if (existsSync(WINDOWS_BLENDER_ROOT)) {
        const newest = readdirSync(WINDOWS_BLENDER_ROOT).sort().reverse()
            .map((version) => join(WINDOWS_BLENDER_ROOT, version, 'blender.exe'))
            .find(existsSync);
        if (newest) return newest;
    }

    throw new Error('Blender not found. Install it, or set BLENDER to the path of its executable.');
}

const blender = findBlender();
// A Windows program started from WSL needs Windows paths
const toBlenderPath = (path) => blender.endsWith('.exe')
    ? execFileSync('wslpath', ['-w', path], { encoding: 'utf8' }).trim()
    : path;

const characters = existsSync(sourceRoot)
    ? readdirSync(sourceRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : [];
if (characters.length === 0) throw new Error(`No character folders in ${sourceRoot}. See docs/ASSETS.md.`);

for (const character of characters) {
    const output = join(modelsDir, character, `${character}-with-animations.glb`);
    const hasOwnClips = existsSync(join(sourceRoot, character, 'animations'));

    const result = spawnSync(blender, [
        '--background',
        '--python-exit-code', '1',
        '--python', toBlenderPath(join(toolDir, 'build-character.py')),
        '--',
        toBlenderPath(join(sourceRoot, character)),
        toBlenderPath(output),
        ...(hasOwnClips ? [] : [toBlenderPath(join(sourceRoot, CLIP_SOURCE))])
    ], { encoding: 'utf8' });

    if (result.status !== 0) {
        // Blender is noisy; its own output only matters when it failed
        console.error(result.stdout, result.stderr);
        throw new Error(`Blender failed on ${character}`);
    }

    // Reading the result back only lists its clips, so warnings about material extensions are noise
    const document = await new NodeIO().setLogger(new Logger(Logger.Verbosity.ERROR)).read(output);
    console.log(`${character}: wrote ${output}`);
    // What the script did to make the character and its clips fit each other
    for (const line of result.stdout.split(/\r?\n/).filter((candidate) => /^(Fitted|Converted) /.test(candidate))) {
        console.log(`  ${line}`);
    }
    for (const animation of document.getRoot().listAnimations()) {
        const duration = Math.max(...animation.listSamplers().map((sampler) => sampler.getInput().getMax([])[0]));
        console.log(`  ${animation.getName().padEnd(24)} ${duration.toFixed(2)} s`);
    }
}
