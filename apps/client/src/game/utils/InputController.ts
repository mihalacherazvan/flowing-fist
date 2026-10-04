import { Button, encodeInput } from '@flowing-fist/sim';
import type { InputFrame } from '@flowing-fist/sim';

/**
 * Handles keyboard and mouse input for the game
 */
export class InputController {
    private keys: { [key: string]: boolean } = {};
    private keysPressedSinceSample: Set<string> = new Set();
    private mouseDeltaX: number = 0;
    private mouseDeltaY: number = 0;
    private isPointerLocked: boolean = false;
    private ignoreNextMouseMove: boolean = false;
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
        // Physical key codes keep WASD in place on non-QWERTY layouts
        this.keys[event.code.toLowerCase()] = true;
        this.keysPressedSinceSample.add(event.code.toLowerCase());

        if (this.debug) {
            console.log(`Key down: ${event.key} (${event.code})`);
        }
    }

    private handleKeyUp(event: KeyboardEvent): void {
        this.keys[event.code.toLowerCase()] = false;

        if (this.debug) {
            console.log(`Key up: ${event.key} (${event.code})`);
        }
    }

    private handleMouseMove(event: MouseEvent): void {
        if (this.isPointerLocked) {
            // The first event after locking can report the jump from the old cursor position
            if (this.ignoreNextMouseMove) {
                this.ignoreNextMouseMove = false;
                return;
            }

            // Several mousemove events can arrive between two reads
            this.mouseDeltaX += event.movementX;
            this.mouseDeltaY += event.movementY;
        }
    }

    private requestPointerLock(): void {
        this.canvas.requestPointerLock();
    }

    private handlePointerLockChange(): void {
        this.isPointerLocked = document.pointerLockElement === this.canvas;
        this.ignoreNextMouseMove = this.isPointerLocked;
    }

    public isKeyDown(code: string): boolean {
        return this.keys[code.toLowerCase()] === true;
    }

    /**
     * Held now, or tapped and released since the last sampled tick.
     * Without this a tap shorter than one tick would be lost.
     */
    private isKeyActive(code: string): boolean {
        return this.isKeyDown(code) || this.keysPressedSinceSample.has(code.toLowerCase());
    }

    /**
     * Get the mouse X movement since the last read
     */
    public getMouseDeltaX(): number {
        const delta = this.mouseDeltaX;
        this.mouseDeltaX = 0; // Reset after reading
        return delta;
    }

    /**
     * Get the mouse Y movement since the last read
     */
    public getMouseDeltaY(): number {
        const delta = this.mouseDeltaY;
        this.mouseDeltaY = 0; // Reset after reading
        return delta;
    }

    /**
     * Sample the current input as one simulation tick's InputFrame
     *
     * @param cameraYaw yaw the movement keys are relative to, in radians
     */
    public sampleInputFrame(cameraYaw: number): InputFrame {
        let moveRight = 0;
        let moveForward = 0;

        if (this.isKeyActive('KeyW')) moveForward += 1;
        if (this.isKeyActive('KeyS')) moveForward -= 1;
        if (this.isKeyActive('KeyD')) moveRight += 1;
        if (this.isKeyActive('KeyA')) moveRight -= 1;

        let buttons = 0;
        if (this.isKeyActive('ShiftLeft') || this.isKeyActive('ShiftRight')) buttons |= Button.Run;
        if (this.isKeyActive('Space')) buttons |= Button.Dodge;
        if (this.isKeyActive('KeyF')) buttons |= Button.LockOn;

        this.keysPressedSinceSample.clear();

        return encodeInput(buttons, moveRight, moveForward, cameraYaw);
    }
}
