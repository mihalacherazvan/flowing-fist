# Flowing Fist — Character and Animation Assets

How a character and its animations get from [Mixamo](https://www.mixamo.com) into the game. For what the game does with them, see [ARCHITECTURE.md](ARCHITECTURE.md).

_Last updated: 2026-10-04._

## The workflow in short

1. **Download** FBX files from Mixamo by hand (it needs a login and has no API).
2. **Drop** them into `assets-src/<character>/`, named after the clip.
3. **Run** `pnpm assets`. Blender converts and combines them into the one GLB the game loads.
4. **Wire** any new clip name into the code.

Only step 1 needs a person. Steps 2 to 4 can be done by hand or handed to Claude: "I downloaded `<file>` to `<folder>`, add it as the `<name>` clip".

Blender is never opened: the script runs it in the background. Nothing is edited by hand in Blender, so the result can always be rebuilt from the downloads.

## Folders

```
assets-src/                         Mixamo downloads; not in git
  y-bot/
    character.fbx                   the mesh and skeleton, in T-pose
    animations/
      idle.fbx                      one file per clip; the file name is the clip name
      run-forward.fbx
      ...

apps/client/public/models/          what the game loads; not in git
  y-bot/
    y-bot-with-animations.glb       built by `pnpm assets`
```

Neither folder is tracked in git: Mixamo's licence allows using the assets in a game but not handing them out as files, and the repository is no place for them. **Keep your own backup of `assets-src/`**, because it is the only source the models can be rebuilt from.

## 1. Downloading from Mixamo

Sign in at mixamo.com with an Adobe account (free).

**The character, once**

1. Open **Characters**, search for **Y Bot** and select it.
2. Click **Download** and choose:

   | Setting | Value |
   |---|---|
   | Format | FBX Binary (.fbx) |
   | Pose | T-pose |

3. Save it as `assets-src/y-bot/character.fbx`.

**Each animation**

1. Keep **Y Bot** as the character (it is shown in the preview). A clip downloaded for another character will not fit the skeleton, and the build refuses it.
2. Open **Animations**, search for the clip and select it.
3. Set the options on the right:
   - **In Place**: tick it whenever it is offered (walks, runs, strafes). The simulation moves the character; a clip that travels by itself would move it twice.
   - **Mirror**: tick it to get the left-handed or left-footed version of a clip.
   - Leave **Trim** and **Overdrive** alone unless the clip needs it; adjust **Character Arm-Space** only if the arms cut through the body.
4. Click **Download** and choose:

   | Setting | Value |
   |---|---|
   | Format | FBX Binary (.fbx) |
   | Skin | Without Skin |
   | Frames per Second | 60 |
   | Keyframe Reduction | none |

5. Save it as `assets-src/y-bot/animations/<clip-name>.fbx`.

Sixty frames per second matches the simulation's 60 ticks per second, so one frame of a clip is one tick of a move. "Without Skin" keeps each file to a few hundred kilobytes; a file with skin also works, its mesh is thrown away.

### Clip names

The file name, without `.fbx`, becomes the clip's name in the game. Use lower case with hyphens. The clips the game uses today:

| Clip name | Mixamo animation | Notes |
|---|---|---|
| `idle` | a fighting idle | |
| `run-forward` | Running | In Place |
| `run-backward` | Running Backward | In Place |
| `left-strafe` | Left Strafe | In Place |
| `right-strafe` | Right Strafe | In Place |

The Mixamo names are a guide to what to search for. The exact clips behind the current files were not written down when they were downloaded in April 2025.

## 2. Building

```sh
pnpm assets
```

For every folder in `assets-src/` this writes `apps/client/public/models/<character>/<character>-with-animations.glb` and lists the clips it contains with their lengths. Check the list: a missing or misnamed clip shows there.

It needs **Blender 4.4 or later**. The script looks for it in this order: the `BLENDER` environment variable, `blender` on the `PATH`, then a Windows installation under `C:\Program Files\Blender Foundation` when run from WSL.

What the build does (`tools/assets/build-character.py`, run inside Blender by `tools/assets/build-characters.mjs`):

1. imports `character.fbx` and drops its one-frame T-pose clip;
2. imports each animation file, checks that its skeleton has the same bones as the character, keeps its motion under the file's name and throws the rest away;
3. exports mesh, skeleton and all clips as one binary glTF file.

The build replaces the output file. Reload the game page to see the result; no restart is needed.

## 3. Using a new clip in the game

A clip that is in the GLB but not named in the code is loaded and never played.

- **Locomotion and idle clips** are chosen in `apps/client/src/game/characters/CharacterView.ts`: add the name to `AnimationNames` and pick it in `updateAnimations`.
- **Attack clips** are not wired up yet. Attacks currently show only as the character sliding forward plus the hitbox overlay. Playing a clip for a move needs a clip name on `MoveDefinition` and a view that sets the clip's time from the move's tick; see "Animation" under Client in [SPEC.md](SPEC.md).

Two things to know when adding clips:

- The model is drawn mirrored, so `CharacterView` plays `left-strafe` when the character moves right. A new sided clip needs the same swap. See "Current limits" for the client in ARCHITECTURE.md.
- The character is drawn at 1.5 times its size, about 2.7 units tall. Hitboxes in `packages/content/src/moves.ts` are sized to that.

## Adding another character

Make a new folder in `assets-src/` with its own `character.fbx` and `animations/`, downloaded with that character selected in Mixamo. `pnpm assets` builds every folder. The game loads only `y-bot` today; the path is in `CharacterView.ts`.

## Troubleshooting

| Symptom | Cause |
|---|---|
| "its skeleton differs from the character's" | The clip was downloaded with another character selected in Mixamo |
| "Blender not found" | Install Blender, or set `BLENDER` to its executable |
| The character slides twice as far, or snaps back at the end of a loop | The clip was downloaded without **In Place** |
| A clip plays too fast or too slow | It was not downloaded at 60 frames per second |
| The clip is listed by the build but never plays | Its name is not used in the code; see step 3 |
