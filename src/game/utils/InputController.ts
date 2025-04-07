/**
 * Handles keyboard and mouse input for the game
 */
export class InputController {
    private keys: { [key: string]: boolean } = {};
    private mouseX: number = 0;
    private mouseY: number = 0;
    private mouseDeltaX: number = 0;
    private mouseDeltaY: number = 0;
    private isPointerLocked: boolean = false;
    private debug: boolean = false;

    constructor(private canvas: HTMLCanvasElement) {
        // Set up keyboard event listeners
        window.addEventListener('keydown', this.handleKeyDown.bind(this));
        window.addEventListener('keyup', this.handleKeyUp.bind(this));

        // Set up mouse event listeners
        document.addEventListener('pointerlockchange', this.handlePointerLockChange.bind(this));
        canvas.addEventListener('click', this.requestPointerLock.bind(this));
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));

        // Toggle debug mode with backtick key
        window.addEventListener('keydown', (event) => {
            if (event.key === '`') {
                this.debug = !this.debug;
                console.log(`Input debug mode: ${this.debug ? 'ON' : 'OFF'}`);
            }
        });
    }

    private handleKeyDown(event: KeyboardEvent): void {
        // Store both key and code for better compatibility
        this.keys[event.key.toLowerCase()] = true;
        this.keys[event.code.toLowerCase()] = true;

        if (this.debug) {
            console.log(`Key down: ${event.key} (${event.code})`);
        }
    }

    private handleKeyUp(event: KeyboardEvent): void {
        // Clear both key and code for better compatibility
        this.keys[event.key.toLowerCase()] = false;
        this.keys[event.code.toLowerCase()] = false;

        if (this.debug) {
            console.log(`Key up: ${event.key} (${event.code})`);
        }
    }

    private handleMouseMove(event: MouseEvent): void {
        if (this.isPointerLocked) {
            // Store mouse movement delta
            this.mouseDeltaX = event.movementX;
            this.mouseDeltaY = event.movementY;

            // Update absolute position
            this.mouseX += event.movementX;
            this.mouseY += event.movementY;
        }
    }

    private requestPointerLock(): void {
        this.canvas.requestPointerLock();
    }

    private handlePointerLockChange(): void {
        this.isPointerLocked = document.pointerLockElement === this.canvas;
    }

    /**
     * Check if a key is currently pressed
     */
    public isKeyDown(key: string): boolean {
        return this.keys[key.toLowerCase()] === true;
    }

    /**
     * Check if multiple keys are pressed simultaneously
     */
    public areKeysDown(keys: string[]): boolean {
        return keys.every(key => this.isKeyDown(key));
    }

    /**
     * Get the current mouse X position
     */
    public getMouseX(): number {
        return this.mouseX;
    }

    /**
     * Get the current mouse Y position
     */
    public getMouseY(): number {
        return this.mouseY;
    }

    /**
     * Get the mouse X movement since last frame
     */
    public getMouseDeltaX(): number {
        const delta = this.mouseDeltaX;
        this.mouseDeltaX = 0; // Reset after reading
        return delta;
    }

    /**
     * Get the mouse Y movement since last frame
     */
    public getMouseDeltaY(): number {
        const delta = this.mouseDeltaY;
        this.mouseDeltaY = 0; // Reset after reading
        return delta;
    }

    /**
     * Check if the player is running (Shift key)
     */
    public isRunning(): boolean {
        return this.isKeyDown('shift') || this.isKeyDown('shiftleft') || this.isKeyDown('shiftright');
    }

    /**
     * Check if the player is attempting to dash (Space + direction key)
     */
    public isDashing(): boolean {
        return this.isKeyDown('space') && (
            this.isKeyDown('w')
            || this.isKeyDown('a')
            || this.isKeyDown('s')
            || this.isKeyDown('d')
        );
    }

    /**
     * Get the movement direction based on WASD keys
     * Returns normalized vector [x, z] where:
     * - z: -1 (left) to 1 (right)
     * - x: -1 (forward) to 1 (backward)
     */
    public getMovementDirection(): [number, number] {
        let x = 0;
        let z = 0;

        // Check both key and code for better compatibility
        const wPressed = this.isKeyDown('w') || this.isKeyDown('keyw');
        const aPressed = this.isKeyDown('a') || this.isKeyDown('keya');
        const sPressed = this.isKeyDown('s') || this.isKeyDown('keys');
        const dPressed = this.isKeyDown('d') || this.isKeyDown('keyd');

        if (wPressed) x -= 1;
        if (sPressed) x += 1;
        if (aPressed) z -= 1;
        if (dPressed) z += 1;

        if (this.debug && (wPressed || aPressed || sPressed || dPressed)) {
            console.log(`Movement: x=${x}, z=${z}`);
        }

        // Normalize for diagonal movement
        if (x !== 0 && z !== 0) {
            const length = Math.sqrt(x * x + z * z);
            x /= length;
            z /= length;
        }

        return [x, z];
    }
}
