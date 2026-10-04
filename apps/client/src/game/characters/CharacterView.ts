import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { CharacterState } from '@flowing-fist/sim';
import { lerpAngle } from '../utils/angles';

// Import SceneLoader loaders
import '@babylonjs/core/Animations/animatable';
import '@babylonjs/loaders/glTF';

type AnimationNames = 'idle'
    | 'run-forward'
    | 'run-backward'
    | 'left-strafe'
    | 'right-strafe';

// Below this the character counts as not moving along that axis
const MOVE_THRESHOLD = 0.1;
const ROOT_HEIGHT = 1;

/**
 * Draws one simulated character: model, placement and animation.
 * It only reads simulation state and never changes it.
 */
export class CharacterView {
    private rootNode: TransformNode;
    private mesh: AbstractMesh | null = null;
    private animations: Map<AnimationNames, AnimationGroup> = new Map();
    private currentAnimationName?: AnimationNames;
    private currentAnimation?: AnimationGroup;

    constructor(private scene: Scene, name: string) {
        // Create a root node for the character
        this.rootNode = new TransformNode(`${name}Root`, this.scene);

        // Load the character model
        this.loadCharacterModel();
    }

    private async loadCharacterModel(): Promise<void> {
        try {
            const importResult = await ImportMeshAsync(
                'models/y-bot/y-bot-with-animations.glb',
                this.scene
            );

            // Get the root mesh
            const importedMesh = importResult.meshes[0];

            // Scale and position the model
            importedMesh.scaling = new Vector3(1.5, 1.5, 1.5); // Slightly larger scale

            // Adjust position to align feet with ground
            importedMesh.position = new Vector3(0, -0.9, 0);

            // The model faces +Z, which is yaw 0 in the simulation
            importedMesh.rotation = new Vector3(0, 0, 0);

            // Parent the model to our root node
            importedMesh.parent = this.rootNode;

            this.mesh = importedMesh;

            // The loader auto-plays the first group, so stop everything before taking control
            importResult.animationGroups.forEach((animGroup) => {
                animGroup.stop();
                this.animations.set(animGroup.name as AnimationNames, animGroup);
            });
        } catch (e) {
            console.error(e);
        }
    }

    /**
     * Place and animate the character between two simulation ticks
     *
     * @param alpha 0 shows the previous tick, 1 the current one
     */
    public update(previous: CharacterState, current: CharacterState, alpha: number): void {
        this.rootNode.position.set(
            previous.x + (current.x - previous.x) * alpha,
            ROOT_HEIGHT,
            previous.z + (current.z - previous.z) * alpha
        );
        this.rootNode.rotation.y = lerpAngle(previous.yaw, current.yaw, alpha);

        this.updateAnimations(current);
    }

    /**
     * Update character animations based on movement state
     */
    private updateAnimations(state: CharacterState): void {
        // Only update animations if the model is loaded
        if (!this.mesh) return;

        const forward = Math.abs(state.moveForward) > MOVE_THRESHOLD ? Math.sign(state.moveForward) : 0;
        const right = Math.abs(state.moveRight) > MOVE_THRESHOLD ? Math.sign(state.moveRight) : 0;

        let animationName: AnimationNames = 'idle';
        // Extra turn of the model so diagonal movement leans into the direction of travel
        let twist = 0;

        if (forward > 0 && right === 0) {
            animationName = 'run-forward';
        } else if (forward < 0) {
            animationName = 'run-backward';
            twist = -right * Math.PI / 4;
        } else if (right !== 0) {
            // The model is drawn mirrored (its handedness flip is dropped when the
            // scaling is set above), so the strafe clips are swapped
            animationName = right > 0 ? 'left-strafe' : 'right-strafe';
            twist = forward > 0 ? -right * Math.PI / 4 : 0;
        }

        this.mesh.rotation.y = twist;
        this.playAnimation(animationName, state);
    }

    private playAnimation(animationName: AnimationNames, state: CharacterState): void {
        if (this.currentAnimation) {
            if (state.running) {
                this.currentAnimation.speedRatio = 1.5;
            } else if (state.dodgeTicks > 0) {
                this.currentAnimation.speedRatio = 0.3;
            } else {
                this.currentAnimation.speedRatio = 1;
            }
        }

        if (!this.animations.has(animationName) || animationName === this.currentAnimationName) {
            return;
        }

        if (this.currentAnimation) {
            this.currentAnimation.stop();
        }

        this.currentAnimation = this.animations.get(animationName);
        this.currentAnimationName = animationName;

        if (this.currentAnimation) {
            this.currentAnimation.start(true);
        }
    }

    /**
     * Get the character's interpolated position
     */
    public getPosition(): Vector3 {
        return this.rootNode.position;
    }

    /**
     * Get the character's interpolated facing
     */
    public getYaw(): number {
        return this.rootNode.rotation.y;
    }
}
