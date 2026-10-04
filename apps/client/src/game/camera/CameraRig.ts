import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector2 } from '@babylonjs/core/Maths/math.vector';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { InputController } from '../utils/InputController';
import { lerpAngle } from '../utils/angles';

/**
 * Third-person camera that orbits the player and swings behind them while locked on
 */
export class CameraRig {
    private camera: ArcRotateCamera;
    private rotationSpeed: number = 0.005;
    private lockOnFollowSpeed: number = 0.15;

    constructor(scene: Scene, private input: InputController, target: Vector3) {
        this.camera = new ArcRotateCamera(
            'playerCamera',
            Math.PI, // Alpha (rotation around Y axis)
            Math.PI / 2.5, // Beta (rotation around X axis)
            5, // Radius (distance from target)
            target.clone(),
            scene
        );

        // Configure camera
        this.camera.lowerRadiusLimit = 5;
        this.camera.upperRadiusLimit = 7;
        this.camera.wheelDeltaPercentage = 0.01;
        this.camera.attachControl(scene.getEngine().getRenderingCanvas(), true);

        // Add beta (vertical) angle limits
        this.camera.lowerBetaLimit = Math.PI / 6;     // Limit looking down (higher value = less down)
        this.camera.upperBetaLimit = Math.PI / 2.2;   // Limit looking up (lower value = less up)

        // Add camera target offset to position it more over the right shoulder
        this.camera.targetScreenOffset = new Vector2(1, -1); // Offset right and up

        // Set camera as active
        scene.activeCamera = this.camera;
    }

    /**
     * Follow the target and apply mouse rotation
     *
     * @param lockOnYaw facing of the locked-on player, or null when free
     */
    public update(target: Vector3, lockOnYaw: number | null): void {
        this.camera.target.copyFrom(target);

        const deltaX = this.input.getMouseDeltaX();
        const deltaY = this.input.getMouseDeltaY();

        if (lockOnYaw !== null) {
            // Swing behind the player so the target stays in view
            this.camera.alpha = lerpAngle(this.camera.alpha, CameraRig.yawToAlpha(lockOnYaw), this.lockOnFollowSpeed);
        } else if (deltaX !== 0) {
            // Rotate camera around player (alpha rotation)
            this.camera.alpha -= deltaX * this.rotationSpeed;
        }

        if (deltaY !== 0) {
            // Adjust camera height (beta rotation)
            // Inverted Y-axis for more natural feel (negative sign)
            this.camera.beta -= deltaY * this.rotationSpeed;
        }
    }

    /**
     * Direction the camera looks in on the ground plane, in the simulation's
     * yaw convention (0 looks along +Z, positive turns towards +X)
     */
    public getYaw(): number {
        return -this.camera.alpha - Math.PI / 2;
    }

    private static yawToAlpha(yaw: number): number {
        return -yaw - Math.PI / 2;
    }
}
