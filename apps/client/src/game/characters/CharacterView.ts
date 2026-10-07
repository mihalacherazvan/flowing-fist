import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { CharacterState } from '@flowing-fist/sim';
import { lerpAngle } from '../utils/angles';
import { chooseAnimation, createAnimationMemory } from './characterAnimation';
import { BLEND_SECONDS, SkeletonAnimator } from './SkeletonAnimator';

// Import SceneLoader loaders
import '@babylonjs/core/Animations/animatable';
import '@babylonjs/loaders/glTF';

const ROOT_HEIGHT = 1;
// The model is about 1.8 units tall as built; the simulation's sizes assume 2.7
const MODEL_SCALE = 1.5;
// The model turns into a diagonal in the time a clip takes to blend in, so the two arrive together
const TWIST_SPEED = Math.PI / 4 / BLEND_SECONDS;

/**
 * Draws one simulated character: model, placement and animation.
 * It only reads simulation state and never changes it.
 */
export class CharacterView {
    private rootNode: TransformNode;
    /** Holds the loaded model: its size, its height above the root and its twist */
    private modelNode: TransformNode;
    private animator: SkeletonAnimator | null = null;
    private animationMemory = createAnimationMemory();

    constructor(private scene: Scene, name: string) {
        // Create a root node for the character
        this.rootNode = new TransformNode(`${name}Root`, this.scene);

        // The loader turns the model the right way round for this scene on the model's own
        // root, so size and placement go on a node above it rather than overwriting that
        this.modelNode = new TransformNode(`${name}Model`, this.scene);
        this.modelNode.parent = this.rootNode;
        this.modelNode.scaling.setAll(MODEL_SCALE);
        // Align feet with ground
        this.modelNode.position.y = -0.9;

        // Load the character model
        this.loadCharacterModel();
    }

    private async loadCharacterModel(): Promise<void> {
        try {
            const importResult = await ImportMeshAsync(
                'models/y-bot/y-bot-with-animations.glb',
                this.scene
            );

            // The model faces +Z, which is yaw 0 in the simulation
            importResult.meshes[0].parent = this.modelNode;

            this.animator = new SkeletonAnimator(importResult.animationGroups);
        } catch (e) {
            console.error(e);
        }
    }

    /**
     * Place and animate the character between two simulation ticks
     *
     * @param tick  the world tick `current` belongs to
     * @param alpha 0 shows the previous tick, 1 the current one
     * @param elapsedSeconds time since the previous frame was drawn
     */
    public update(previous: CharacterState, current: CharacterState, tick: number, alpha: number, elapsedSeconds: number): void {
        this.rootNode.position.set(
            previous.x + (current.x - previous.x) * alpha,
            ROOT_HEIGHT,
            previous.z + (current.z - previous.z) * alpha
        );
        this.rootNode.rotation.y = lerpAngle(previous.yaw, current.yaw, alpha);

        const animation = chooseAnimation(current, this.animationMemory, tick, alpha);
        const twistLeft = animation.twist - this.modelNode.rotation.y;
        const twistStep = TWIST_SPEED * elapsedSeconds;
        this.modelNode.rotation.y += Math.min(twistStep, Math.max(-twistStep, twistLeft));
        // Nothing to pose until the model has loaded
        this.animator?.update(animation, elapsedSeconds);
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
