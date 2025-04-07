import {
    Vector3,
    TransformNode,
    ArcRotateCamera,
    Ray,
    RayHelper,
    Matrix,
    AnimationGroup,
    ImportMeshAsync,
    AbstractMesh
} from '@babylonjs/core';
import type { Scene as SceneType } from '@babylonjs/core/scene';
import type { TransformNode as TransformNodeType } from '@babylonjs/core/Meshes/transformNode';
import type { Vector3 as Vector3Type } from '@babylonjs/core/Maths/math.vector';
import type { ArcRotateCamera as ArcRotateCameraType } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { RayHelper as RayHelperType } from '@babylonjs/core/Debug/rayHelper';
import { InputController } from '../utils/InputController';

// Import SceneLoader loaders
import '@babylonjs/loaders/glTF';

type AnimationNames = "idle"
    | "run"
    | "run-backwards"
    | "left-strafe"
    | "right-strafe";

export class Player {
    private scene: SceneType;
    private input: InputController;
    private rootNode: TransformNodeType;
    private camera: ArcRotateCameraType;
    private moveSpeed: number = 0.05; // Reduced from 0.1 (half as fast)
    private runSpeed: number = 0.1;   // Set to the previous walking speed
    private dashSpeed: number = 0.2;  // Kept the same
    private dashDuration: number = 30; // frames
    private dashCooldown: number = 60; // frames
    private dashTimer: number = 0;
    private dashCooldownTimer: number = 0;
    private isDashing: boolean = false;
    private cameraRotationSpeed: number = 0.005;
    private gravity: number = 0.01;
    private verticalVelocity: number = 0;
    private isGrounded: boolean = true;
    private rayHelper?: RayHelperType;
    private debugMode: boolean = false;
    private modelLoaded: boolean = false;
    private meshes: Map<AnimationNames, AbstractMesh> = new Map();
    private animations: Map<AnimationNames, AnimationGroup> = new Map();
    private currentAnimationName?: AnimationNames;
    private currentAnimation?: AnimationGroup;

    constructor(scene: SceneType, input: InputController, position: Vector3Type) {
        this.scene = scene;
        this.input = input;

        // Create a root node for the player
        this.rootNode = new TransformNode('playerRoot', this.scene);
        this.rootNode.position = position;

        // Create camera
        this.camera = new ArcRotateCamera(
            'playerCamera',
            Math.PI, // Alpha (rotation around Y axis)
            Math.PI / 3, // Beta (rotation around X axis)
            8, // Radius (distance from target)
            this.rootNode.position, // Target
            this.scene
        );

        // Configure camera
        this.camera.lowerRadiusLimit = 5;
        this.camera.upperRadiusLimit = 8;
        this.camera.wheelDeltaPercentage = 0.01;
        this.camera.attachControl(this.scene.getEngine().getRenderingCanvas(), true);
        
        // Add beta (vertical) angle limits
        this.camera.lowerBetaLimit = Math.PI / 6;     // Limit looking down (higher value = less down)
        this.camera.upperBetaLimit = Math.PI / 2.2;   // Limit looking up (lower value = less up)

        // Set camera as active
        this.scene.activeCamera = this.camera;

        // Load the character model
        this.loadCharacterAnimations();

        // Setup ground detection ray
        if (this.debugMode) {
            const ray = new Ray(this.rootNode.position, Vector3.Down(), 1.1);
            this.rayHelper = new RayHelper(ray);
            this.rayHelper?.show(this.scene);
        }
    }

    private async loadCharacterAnimations(): Promise<void> {
        try {
            await this.loadAnimation("idle", "models/y-bot/animations/fighting-idle.glb");
            await this.loadAnimation("run", "models/y-bot/animations/running-forwards.glb");
            await this.loadAnimation("run-backwards", "models/y-bot/animations/running-backwards.glb");
            await this.loadAnimation("left-strafe", "models/y-bot/animations/left-strafe.glb");
            await this.loadAnimation("right-strafe", "models/y-bot/animations/right-strafe.glb");

            // Mark as loaded
            this.modelLoaded = true;

            console.log("Character model and animations loaded successfully");
        } catch (error) {
            console.error("Failed to load character model:", error);
        }
    }

    private async loadAnimation(name: AnimationNames, fromFile: string): Promise<void> {
        // Load the idle animation model first
        const importResult = await ImportMeshAsync(fromFile, this.scene);

        // Get the root mesh
        const importedMesh = importResult.meshes[0];

        // Scale and position the model
        importedMesh.scaling = new Vector3(1.5, 1.5, 1.5); // Slightly larger scale

        // Adjust position to align feet with ground
        importedMesh.position = new Vector3(0, -0.9, 0);

        // Rotate the model to face forward
        importedMesh.rotation = new Vector3(0, Math.PI / 2, 0);

        // Parent the model to our root node
        importedMesh.parent = this.rootNode;

        // Hide mesh
        importedMesh.setEnabled(false);

        // Enable shadows for all meshes
        importResult.meshes.forEach(mesh => {
            mesh.receiveShadows = true;
            mesh.checkCollisions = true;
        });

        this.meshes.set(name, importedMesh);

        if (importResult.animationGroups && importResult.animationGroups.length > 0) {
            // Stop all animations initially
            importResult.animationGroups.forEach(animGroup => {
                animGroup.stop();
            });

            // Store the idle animation
            this.animations.set(name, importResult.animationGroups[0]);
        }
    }

    /**
     * Update player position, rotation, and state based on input
     */
    public update(): void {
        this.handleMovement();
        this.applyGravity();
        this.updateCamera();
        this.updatePlayerRotation();
    }

    /**
     * Handle player movement based on input
     */
    private handleMovement(): void {
        // Get movement direction from input
        const [inputX, inputZ] = this.input.getMovementDirection();

        // Track if we're moving
        const isMoving = inputX !== 0 || inputZ !== 0;

        // Update animations based on movement state
        this.updateAnimations(isMoving, this.input.isRunning());

        // Skip if no movement input
        if (!isMoving) return;

        // Calculate movement speed
        let speed = this.moveSpeed;

        // Apply run speed if running
        if (this.input.isRunning()) {
            speed = this.runSpeed;
        }

        // Handle dashing
        if (this.input.isDashing() && !this.isDashing && this.dashCooldownTimer <= 0) {
            this.isDashing = true;
            this.dashTimer = this.dashDuration;
        }

        // Apply dash speed if dashing
        if (this.isDashing) {
            speed = this.dashSpeed;
            this.dashTimer--;

            if (this.dashTimer <= 0) {
                this.isDashing = false;
                this.dashCooldownTimer = this.dashCooldown;
            }
        }

        // Update dash cooldown
        if (this.dashCooldownTimer > 0) {
            this.dashCooldownTimer--;
        }

        // Get camera-relative movement vectors
        const cameraForward = this.getCameraForwardVector();
        const cameraRight = this.getCameraRightVector();

        // Calculate movement vector relative to camera orientation
        const movement = new Vector3(0, 0, 0);

        // Add forward/backward movement based on camera direction
        if (inputZ !== 0) {
            // Negate inputZ to correct the direction (W = forward = negative Z)
            movement.addInPlace(cameraForward.scale(-inputZ * speed));
        }

        // Add left/right movement based on camera direction
        if (inputX !== 0) {
            movement.addInPlace(cameraRight.scale(inputX * speed));
        }

        // Apply movement
        this.rootNode.position.addInPlace(movement);
    }

    /**
     * Update character animations based on movement state
     */
    private updateAnimations(isMoving: boolean, isRunning: boolean): void {
        // Only update animations if the model is loaded
        if (!this.modelLoaded) return;

        // Get movement direction to determine which animation to play
        const [inputX, inputZ] = this.input.getMovementDirection();

        if (!isMoving) {
            this.playAnimation("idle");

            return;
        }

        if (inputX < 0 && !inputZ) {
            this.playAnimation("run");

            return;
        }

        if (inputX > 0) {
            this.playAnimation("run-backwards");

            if (inputZ > 0) {
                this.meshes.get("run-backwards")!.rotation.y = Math.PI / 4;
            }

            if (inputZ < 0) {
                this.meshes.get("run-backwards")!.rotation.y = 3 * Math.PI / 4;
            }

            if (inputZ === 0) {
                this.meshes.get("run-backwards")!.rotation.y = Math.PI / 2;
            }

            return;
        }

        if (inputZ > 0) {
            this.playAnimation("left-strafe");

            if (inputX > 0) {
                this.meshes.get("left-strafe")!.rotation.y = 3 * Math.PI / 4;
            }

            if (inputX < 0) {
                this.meshes.get("left-strafe")!.rotation.y = Math.PI / 4;
            }

            if (inputX === 0) {
                this.meshes.get("left-strafe")!.rotation.y = Math.PI / 2;
            }

            return;
        }

        if (inputZ < 0) {
            this.playAnimation("right-strafe");

            if (inputX > 0) {
                this.meshes.get("right-strafe")!.rotation.y = Math.PI / 4;
            }

            if (inputX < 0) {
                this.meshes.get("right-strafe")!.rotation.y = 3 * Math.PI / 4;
            }

            if (inputX === 0) {
                this.meshes.get("right-strafe")!.rotation.y = Math.PI / 2;
            }

            return;
        }

        this.playAnimation("idle");
    }

    /**
     * Play the specified animation, stopping any currently playing animation
     */
    private playAnimation(animationName?: AnimationNames): void {
        if (!animationName
            || !this.animations.has(animationName)
            || animationName === this.currentAnimationName
        ) {
            return;
        }

        if (this.currentAnimationName) {
            this.meshes.get(this.currentAnimationName)?.setEnabled(false);
            this.currentAnimation?.stop();
        }

        this.meshes.get(animationName)?.setEnabled(true);

        this.currentAnimation = this.animations.get(animationName);
        this.currentAnimationName = animationName;

        if (this.currentAnimation) {
            this.currentAnimation.start(true);
        }
    }

    /**
     * Update player rotation to face the direction of movement or camera
     */
    private updatePlayerRotation(): void {
        // If there's no movement, make the player face the camera direction
        const [inputX, inputZ] = this.input.getMovementDirection();

        if (inputX !== 0 || inputZ !== 0) {
            // Get the camera's forward vector (horizontal only)
            const cameraForward = this.getCameraForwardVector();
            cameraForward.y = 0; // Ignore vertical component
            cameraForward.normalize();

            // Calculate the target rotation based on camera direction
            const targetAngle = Math.atan2(cameraForward.x, cameraForward.z);

            // Set the player's rotation to match the camera direction
            this.rootNode.rotation.y = targetAngle;
        }
    }

    /**
     * Get the camera's forward vector
     */
    private getCameraForwardVector(): Vector3Type {
        // Get the forward direction based on camera rotation
        const forward = new Vector3(0, 0, -1);

        // Create a rotation matrix from the camera's alpha angle (horizontal rotation)
        const matrix = Matrix.RotationY(-this.camera.alpha);

        // Apply the rotation to the forward vector
        return Vector3.TransformNormal(forward, matrix);
    }

    /**
     * Get the camera's right vector
     */
    private getCameraRightVector(): Vector3Type {
        // Get the right direction based on camera rotation
        const right = new Vector3(1, 0, 0);

        // Create a rotation matrix from the camera's alpha angle (horizontal rotation)
        const matrix = Matrix.RotationY(-this.camera.alpha);

        // Apply the rotation to the right vector
        return Vector3.TransformNormal(right, matrix);
    }

    /**
     * Apply gravity and handle ground collision
     */
    private applyGravity(): void {
        // Check if player is on the ground
        this.checkGrounded();

        // Apply gravity if not grounded
        if (!this.isGrounded) {
            this.verticalVelocity -= this.gravity;
        } else {
            this.verticalVelocity = 0;
        }

        // Apply vertical velocity
        this.rootNode.position.y += this.verticalVelocity;

        // Check if player fell off the platform
        if (this.rootNode.position.y < -100) {
            this.respawn();
        }
    }

    /**
     * Check if the player is on the ground
     */
    private checkGrounded(): void {
        // Create a ray from the player position downward
        const ray = this.createGroundRay();

        // Update ray helper if in debug mode
        if (this.debugMode && this.rayHelper) {
            this.rayHelper.ray = ray;
        }

        // Check for intersection with the ground
        const hit = this.scene.pickWithRay(ray);
        // Ensure we handle null/undefined properly
        this.isGrounded = Boolean(hit && hit.hit && hit.pickedMesh?.name === 'ground');
    }

    private createGroundRay(): Ray {
        const origin = this.rootNode.position.clone();
        origin.y -= 0.5;
        const ray = new Ray(origin, Vector3.Down(), 0.6);
        return ray;
    }

    /**
     * Update camera position based on player movement and mouse input
     */
    private updateCamera(): void {
        // Update camera target to follow player
        this.camera.target = this.rootNode.position.clone();

        // Handle camera rotation with mouse
        const deltaX = this.input.getMouseDeltaX();
        const deltaY = this.input.getMouseDeltaY();

        if (deltaX !== 0) {
            // Rotate camera around player (alpha rotation)
            this.camera.alpha -= deltaX * this.cameraRotationSpeed;
        }

        if (deltaY !== 0) {
            // Adjust camera height (beta rotation)
            // Inverted Y-axis for more natural feel (negative sign)
            this.camera.beta -= deltaY * this.cameraRotationSpeed;
        }
    }

    /**
     * Respawn the player at the starting position
     */
    private respawn(): void {
        this.rootNode.position = new Vector3(0, 1, 0);
        this.verticalVelocity = 0;
    }

    /**
     * Get the player's position
     */
    public getPosition(): Vector3Type {
        return this.rootNode.position;
    }

    /**
     * Get the player's camera
     */
    public getCamera(): ArcRotateCameraType {
        return this.camera;
    }
}
