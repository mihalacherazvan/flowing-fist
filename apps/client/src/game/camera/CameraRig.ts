import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector2 } from '@babylonjs/core/Maths/math.vector';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { InputController } from '../utils/InputController';
import { lerpAngle } from '../utils/angles';

/**
 * Third-person camera that orbits the player and, while locked on, swings behind
 * them and to one side so both fighters are in view
 */
export class CameraRig {
    private camera: ArcRotateCamera;
    private rotationSpeed: number = 0.005;
    private lockOnFollowSpeed: number = 0.15;
    /** How far the locked-on camera turns off the line from the player to the opponent */
    private lockOnSideAngle: number = Math.PI / 4;
    /** 1 when the locked-on camera is on the player's right, -1 on their left, null when not locked on */
    private lockOnSide: 1 | -1 | null = null;

    constructor(scene: Scene, private input: InputController, target: Vector3) {
        this.camera = new ArcRotateCamera(
            'playerCamera',
            CameraRig.yawToAlpha(0), // Alpha (rotation around Y axis)
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

        // Mouse buttons are attacks, so the camera only keeps the wheel; rotation comes from the locked pointer
        this.camera.inputs.removeByType('ArcRotateCameraPointersInput');
        this.camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');

        // Add beta (vertical) angle limits
        this.camera.lowerBetaLimit = Math.PI / 6;     // Limit looking down (higher value = less down)
        this.camera.upperBetaLimit = Math.PI / 2.2;   // Limit looking up (lower value = less up)

        // Offset the view so the player stands right of centre
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

        if (lockOnYaw !== null && this.lockOnSide === null) {
            // Keep to the side the camera already leans to, so locking on swings it the shorter way
            const cameraOffset = Math.atan2(Math.sin(this.getYaw() - lockOnYaw), Math.cos(this.getYaw() - lockOnYaw));
            this.lockOnSide = cameraOffset < 0 ? 1 : -1;
        } else if (lockOnYaw === null) {
            this.lockOnSide = null;
        }

        // The player stands right of centre when free; locked on, on the side away from the opponent
        const targetOffsetX = this.lockOnSide === null ? 1 : -this.lockOnSide;
        this.camera.targetScreenOffset.x += (targetOffsetX - this.camera.targetScreenOffset.x) * this.lockOnFollowSpeed;

        if (lockOnYaw !== null && this.lockOnSide !== null) {
            // Swing behind and to one side of the player, so the player stands at the side of the view and the opponent is in the open
            const cameraYaw = lockOnYaw - this.lockOnSide * this.lockOnSideAngle;
            this.camera.alpha = lerpAngle(this.camera.alpha, CameraRig.yawToAlpha(cameraYaw), this.lockOnFollowSpeed);
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
     * Put the camera straight behind a character facing `yaw`, with no swing
     */
    public placeBehind(yaw: number): void {
        this.camera.alpha = CameraRig.yawToAlpha(yaw);
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
