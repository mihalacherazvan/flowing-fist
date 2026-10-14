# Flowing Fist — Character and Animation Assets

How a character and its animations get from [Mixamo](https://www.mixamo.com) into the game. For what the game does with them, see [ARCHITECTURE.md](ARCHITECTURE.md).

_Last updated: 2026-10-07._

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

  fighter/
    character.fbx                   a generated character, rigged by Mixamo; no animations/
                                    folder, so it plays Y Bot's clips
  fighter-v2/
    character.fbx                   a second generated character, built the same way

apps/client/public/models/          what the game loads; not in git
  y-bot/
    y-bot-with-animations.glb       built by `pnpm assets`
  fighter/
    fighter-with-animations.glb
  fighter-v2/
    fighter-v2-with-animations.glb
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

1. Keep **Y Bot** as the character if you can (it is shown in the preview). A clip downloaded with another of our characters selected also works: the build notices that it was made for a different skeleton, converts it and says so. On the character it was downloaded for the result is exact; on the others the feet can end up a few centimetres off the floor, because Mixamo fitted the clip to that one body.
2. Open **Animations**, search for the clip and select it.
3. Set the options on the right:
   - **In Place**: tick it whenever it is offered (walks, runs, strafes). The simulation moves the character; a clip that travels by itself would move it twice.
   - **Mirror**: tick it to get the other side of a clip. Every attack and reaction is downloaded twice, once plain and once mirrored, and saved as `<name>-left` and `<name>-right`.
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

The file name, without `.fbx`, becomes the clip's name in the game. Use lower case with hyphens.

**The side in a name is the character's own**, not the side of the screen: `jab-left` is thrown with the left hand, `roundhouse-kick-right` with the right foot. For a clip with no striking limb (block, hit, knockout, idle) it is the foot that stands in front. In Mixamo's preview the character faces you, so its left is on your right.

The clips the game uses today:

| Clip name | Mixamo animation | Notes |
|---|---|---|
| `idle-v2` | a fighting idle with the guard up | The idle the game plays. Left foot in front; the game mirrors it for the two right stances. Downloaded with the masked fighter selected, so the build converts it |
| `idle` | a fighting idle | The first idle, no longer played: it stands taller than the attacks and steps, so the character rose whenever it stopped |
| `run-forward` | Running | In Place |
| `run-backward` | Running Backward | In Place |
| `left-strafe`, `right-strafe` | Left Strafe, Right Strafe | In Place |
| `step-forward`, `step-backward`, `step-left`, `step-right` | short fighting steps | Walking while locked on. Left foot in front; the game mirrors them for the right stances. Played in place by the game |
| `jab-left`, `jab-right` | a jab | Side: the punching hand, which is also the front foot |
| `hook-left`, `hook-right` | a hook | As the jab |
| `uppercut-left`, `uppercut-right` | an uppercut | As the jab |
| `roundhouse-kick-left`, `-right` | a roundhouse kick | Side: the kicking foot, which is the front one |
| `push-kick-left`, `-right` | a push kick | Side: the kicking foot, which is the back one |
| `sweep-left`, `-right` | a leg sweep | Side: the sweeping foot, which is the back one |
| `flying-kick-left`, `-right` | a flying kick | Side: the kicking foot |
| `block-left`, `-right` | a block that then takes a hit | The first second is the guard pose, frames 68 to 115 the blocked hit |
| `parry-left`, `-right` | a parry | Side: the arm that sweeps up |
| `hit-left`, `-right` | a hit to the head | Hit stun |
| `hit-body-left`, `-right` | a hit to the stomach | Broken guard, and an attack that was parried |
| `knockout-left`, `-right` | a knockout | |

The Mixamo names are a guide to what to search for; the exact clips behind the files were not written down.

**Still to download.** These moves borrow another move's clip until they have their own: Cross (a rear-hand straight), Breaking Elbow, Low Kick, Back Fist, Side Kick, Spin Kick. A getting-up clip would complete the knockout.

## 2. Building

```sh
pnpm assets
```

For every folder in `assets-src/` this writes `apps/client/public/models/<character>/<character>-with-animations.glb` and lists the clips it contains with their lengths. Check the list: a missing or misnamed clip shows there.

It needs **Blender 4.4 or later** (run with 4.4 and with 5.2). The script looks for it in this order: the `BLENDER` environment variable, `blender` on the `PATH`, then a Windows installation under `C:\Program Files\Blender Foundation` when run from WSL.

What the build does (`tools/assets/build-character.py`, run inside Blender by `tools/assets/build-characters.mjs`):

1. imports `character.fbx` and drops its one-frame T-pose clip;
2. imports each animation file, checks that its skeleton has the same bones as the character, keeps its motion under the file's name and throws the rest away;
3. exports mesh, skeleton and all clips as one binary glTF file.

The build replaces the output file. Reload the game page to see the result; no restart is needed.

## 3. Using a new clip in the game

A clip that is in the GLB but not named in the code is loaded and never played.

Everything about which clip shows when is in `apps/client/src/game/characters/characterAnimation.ts`. Add the new name to `ClipName` there, then:

- **A clip for a move:** point the move at it in `MOVE_CLIPS`, with the side whose front foot matches the stance the move starts in (right stance, right foot in front). A new kind of strike also needs a line in `STRIKE_FRAMES`: the frame where the limb starts to move (`start`), the frame where it is furthest out (`impact`) and the frame where it is back (`end`). The game stretches the clip so that `impact` falls exactly where the move's startup ends, so the clip's own pace does not matter. To find the frames, scrub the clip in Mixamo's preview and multiply its frame counter by two if it shows 30 frames per second, or ask Claude to measure them from the file.
- **Any other clip** (idle, locomotion, reactions): pick it in `chooseAnimation`.

Things to know when adding clips:

- **The game can mirror a clip itself**, so a clip that is the same on both sides apart from left and right needs only one download, with the left foot in front. The idle and the steps work this way (`mirrored` on the layer in `chooseAnimation`). The attacks and reactions that were downloaded in pairs still use their two files.

- Attacks and reactions are played **in place**: the forward and sideways travel of the hips is dropped, because the simulation moves the character (a move's `advance`). So a clip does not need Mixamo's In Place box, which most combat clips do not offer anyway.
- A clip never changes stance, but most moves do. The blend into the next idle or attack covers the change of feet.
- The character is drawn at 1.5 times its size, about 2.7 units tall. Hitboxes in `packages/content/src/moves.ts` are sized to that.

## Adding another character

A new character does not need its own animations: it plays Y Bot's. What it needs is Mixamo's skeleton, which Mixamo's auto-rigger gives to any humanoid mesh.

1. **Make the mesh** in any tool (the masked fighter came from Midjourney images turned into a mesh by Tripo) and export it **without a skeleton**, as FBX or OBJ. Standing in an A-pose or T-pose.
2. **Rig it on mixamo.com:** *Upload Character*, place the markers (the groin marker where the legs really split, not at the hem of loose clothing), and choose the **Standard Skeleton (65)**. Preview a few kicks there before going on. A smaller skeleton builds too, but the fingers it leaves out stay as they rest: the second masked fighter has only its index fingers, so its hands stay open where the clips make a fist.
3. **Download it** with the *T-Pose* animation selected: FBX Binary, With Skin. Save it as `assets-src/<name>/character.fbx`, with no `animations/` folder beside it.
4. **Run** `pnpm assets`.
5. **Add it to the game:** one line in `CHARACTER_MODELS` in `apps/client/src/game/characters/characterModelStore.ts`. The first entry is the default; the player picks among them in the menu.

What the build does for such a character, before adding the clips: it poses the skeleton into Y Bot's rest pose, scales the character until its soles touch the ground with the hips at Y Bot's height, and makes that its new rest pose. The file may arrive lying down, in an A-pose and at any size (the fighter was one metre tall); after this it stands, rests in a T-pose and is about Y Bot's size, so every clip means the same on it. A texture is written as JPEG, and a textured material is made matte.

Limits:

- **The skeleton must be Mixamo's.** A rig made by another tool, even one that names its bones like Mixamo's, turns its bones differently and plays the clips twisted. Tripo's own rigger is one of those.
- **Clips copy joint angles, not hand and foot positions.** A character built much like Y Bot moves like Y Bot; one with far longer arms or a wide body will reach further or pass its arms through its clothes.
- **Tripo's rigged GLB export is broken** (bones without positions); its FBX export is sound.

A character can still have clips of its own: give its folder an `animations/` folder, downloaded with that character selected in Mixamo, and it is built exactly as Y Bot is.

## Troubleshooting

| Symptom | Cause |
|---|---|
| "its skeleton lacks bones the character has" or "has bones that the one in ... lacks" | The clip or the character was not made with a Mixamo skeleton |
| The build prints "Converted ... from another character's skeleton" | Not an error: the clip was downloaded with another character selected in Mixamo and has been refitted |
| "Blender not found" | Install Blender, or set `BLENDER` to its executable |
| The character slides twice as far, or snaps back at the end of a loop | The clip was downloaded without **In Place** |
| A clip plays too fast or too slow | It was not downloaded at 60 frames per second |
| The clip is listed by the build but never plays | Its name is not used in the code; see step 3 |
| The character freezes in its last pose during a move or reaction | The code names a clip that is not in the model: a missing or misnamed file |
| A strike lands too early or too late against the hitbox overlay | Its `impact` frame in `STRIKE_FRAMES` is off |
| The wrong hand or foot strikes | The file's side is wrong: swap the two files' names, or the side in `MOVE_CLIPS` |
