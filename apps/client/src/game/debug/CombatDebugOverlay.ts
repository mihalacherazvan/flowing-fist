import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { StunKind, getCurrentMove, getHitboxPosition, getMovePhase, tuning } from '@flowing-fist/sim';
import type { CharacterState, WorldState } from '@flowing-fist/sim';

const BODY_HEIGHT = 2.7;
const GROUND_HEIGHT = 0.1;
const MAX_HITBOXES_PER_CHARACTER = 4;

const BODY_COLORS = {
    neutral: new Color3(0.2, 0.9, 0.3),
    guarding: new Color3(0.2, 0.5, 1),
    blockStun: new Color3(0.6, 0.8, 1),
    hitStun: new Color3(1, 1, 1),
    guardBroken: new Color3(1, 0.3, 0.9),
    dodging: new Color3(0.5, 0.5, 0.5),
    knockedOut: new Color3(0.1, 0.1, 0.1)
};

const HITBOX_COLORS = {
    startup: new Color3(1, 0.8, 0.1),
    active: new Color3(1, 0.1, 0.1),
    recovery: new Color3(0.4, 0.4, 0.4)
};

/**
 * Draws what the simulation actually tests: each character's body cylinder and
 * the hitboxes of the attack in progress. Until attack animations exist this is
 * also the only way to see an attack.
 */
export class CombatDebugOverlay {
    private bodies: Mesh[] = [];
    private hitboxes: Mesh[][] = [];
    private visible: boolean = true;

    constructor(private scene: Scene, characterCount: number) {
        for (let i = 0; i < characterCount; i++) {
            const body = CreateCylinder(
                `debugBody${i}`,
                { diameter: tuning.CHARACTER_RADIUS * 2, height: BODY_HEIGHT, tessellation: 16 },
                this.scene
            );
            body.material = this.createMaterial(`debugBodyMaterial${i}`, true);
            body.isPickable = false;
            this.bodies.push(body);

            const spheres: Mesh[] = [];
            for (let j = 0; j < MAX_HITBOXES_PER_CHARACTER; j++) {
                const sphere = CreateSphere(`debugHitbox${i}_${j}`, { diameter: 1, segments: 12 }, this.scene);
                sphere.material = this.createMaterial(`debugHitboxMaterial${i}_${j}`, false);
                sphere.isPickable = false;
                spheres.push(sphere);
            }
            this.hitboxes.push(spheres);
        }
    }

    private createMaterial(name: string, wireframe: boolean): StandardMaterial {
        const material = new StandardMaterial(name, this.scene);
        material.disableLighting = true;
        material.wireframe = wireframe;
        material.alpha = wireframe ? 1 : 0.5;

        return material;
    }

    public toggle(): void {
        this.visible = !this.visible;
    }

    /**
     * Match the overlay to the current simulation tick
     */
    public update(world: WorldState): void {
        world.characters.forEach((character, index) => {
            const body = this.bodies[index];
            body.setEnabled(this.visible);
            body.position.set(character.x, GROUND_HEIGHT + BODY_HEIGHT / 2, character.z);
            (body.material as StandardMaterial).emissiveColor = CombatDebugOverlay.getBodyColor(character);

            const move = getCurrentMove(character);
            const phase = getMovePhase(character);

            this.hitboxes[index].forEach((sphere, hitboxIndex) => {
                const hitbox = move?.hitboxes[hitboxIndex];
                if (!this.visible || !hitbox || !phase) {
                    sphere.setEnabled(false);
                    return;
                }

                const position = getHitboxPosition(character, hitbox);
                sphere.setEnabled(true);
                sphere.position.set(position.x, GROUND_HEIGHT + hitbox.up, position.z);
                sphere.scaling.setAll(hitbox.radius * 2);
                (sphere.material as StandardMaterial).emissiveColor = HITBOX_COLORS[phase];
            });
        });
    }

    private static getBodyColor(character: CharacterState): Color3 {
        if (character.knockoutTicks > 0) return BODY_COLORS.knockedOut;
        if (character.stunKind === StunKind.Hit) return BODY_COLORS.hitStun;
        if (character.stunKind === StunKind.GuardBroken) return BODY_COLORS.guardBroken;
        if (character.stunKind === StunKind.Block) return BODY_COLORS.blockStun;
        if (character.guarding) return BODY_COLORS.guarding;
        if (character.dodgeTicks > 0) return BODY_COLORS.dodging;

        return BODY_COLORS.neutral;
    }
}
