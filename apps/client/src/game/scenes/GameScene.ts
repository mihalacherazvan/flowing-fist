import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { Scene } from '@babylonjs/core/scene';
import { SkyMaterial } from '@babylonjs/materials/sky';
import type { Engine as EngineType } from '@babylonjs/core/Engines/engine';
import type { Mesh as MeshType } from '@babylonjs/core/Meshes/mesh';
import { STANCES } from '@flowing-fist/content';
import { StunKind, getCurrentMove, getMovePhase, tuning } from '@flowing-fist/sim';
import type { CharacterState, WorldState } from '@flowing-fist/sim';
import { hudStore } from '../../ui/hudStore';
import { CameraRig } from '../camera/CameraRig';
import { CharacterView } from '../characters/CharacterView';
import { CombatDebugOverlay } from '../debug/CombatDebugOverlay';
import { DuelSession } from '../sessions/DuelSession';
import type { GameSession } from '../sessions/GameSession';
import { TrainingSession } from '../sessions/TrainingSession';
import { InputController } from '../utils/InputController';

const CHARACTER_COUNT = 2;

export class GameScene {
    private scene: Scene;
    private ground!: MeshType;
    private input: InputController;
    private session: GameSession = new TrainingSession();
    private characterViews: CharacterView[];
    private cameraRig: CameraRig;
    private debugOverlay: CombatDebugOverlay;

    constructor(private engine: EngineType, private canvas: HTMLCanvasElement) {
        // Create the scene
        this.scene = new Scene(this.engine);

        // Create input controller
        this.input = new InputController(this.canvas);

        // Setup environment
        this.setupEnvironment();

        // Create a view per character and the camera that follows the local player
        this.characterViews = [
            new CharacterView(this.scene, 'first'),
            new CharacterView(this.scene, 'second')
        ];
        this.cameraRig = new CameraRig(this.scene, this.input, new Vector3(0, 1, 0));
        this.debugOverlay = new CombatDebugOverlay(this.scene, CHARACTER_COUNT);

        this.setupSessionControls();

        // Register render loop
        this.engine.runRenderLoop(() => {
            this.update(this.engine.getDeltaTime());
            this.scene.render();
        });

        // Handle browser resize
        window.addEventListener('resize', () => {
            this.engine.resize();
        });
    }

    /**
     * Set up the game environment (lights, ground, etc.)
     */
    private setupEnvironment(): void {
        // Setup ground
        this.setupGround();

        // Create a skybox and lights
        this.createSkybox();
    }

    /**
     * Setup the ground with texture
     */
    private setupGround(): void {
        // Create a large flat ground
        this.ground = CreateGround(
            'ground',
            { width: 100, height: 100, subdivisions: 16 },
            this.scene
        );
        // Create a standard material for the ground
        const groundMaterial = new StandardMaterial('groundMaterial', this.scene);

        // Create ground texture
        const groundTexture = new Texture('textures/ground.jpg', this.scene);
        groundTexture.uScale = 10;
        groundTexture.vScale = 10;

        // Apply texture to the ground material
        groundMaterial.diffuseTexture = groundTexture;

        // Adjust material properties
        groundMaterial.specularColor = new Color3(0.2, 0.2, 0.2);
        groundMaterial.specularPower = 64;

        // Apply material to ground
        this.ground.material = groundMaterial;
        
        // Enable collisions for the ground
        this.ground.checkCollisions = true;
    }

    /**
     * Create a skybox with a sky material and setup lights
     */
    private createSkybox(): void {
        // Create a hemispheric light (ambient light)
        const hemiLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), this.scene);
        hemiLight.intensity = 1.0;
        hemiLight.diffuse = new Color3(1, 1, 1);
        hemiLight.groundColor = new Color3(0.5, 0.5, 0.5); // Lighter ground reflection

        // Sky properties
        const skyInclination = 0.3; // The sky inclination, sunset mode when 0, day mode when 0.5
        const skyAzimuth = 0.25; // The sky azimuth, East when 0, North when 0.25, West when 0.5, South when 0.75

        // Add a directional light to simulate sunlight based on sky azimuth and inclination
        const sunPhi = Math.PI * (1 - skyInclination * 2); // Convert inclination to phi angle
        const sunTheta = Math.PI * 2 * skyAzimuth; // Convert azimuth to theta angle

        // Calculate sun direction from spherical coordinates
        const sunX = Math.cos(sunTheta) * Math.sin(sunPhi);
        const sunY = Math.cos(sunPhi);
        const sunZ = Math.sin(sunTheta) * Math.sin(sunPhi);

        const dirLight = new DirectionalLight('dirLight', new Vector3(sunX, sunY, sunZ), this.scene);
        dirLight.intensity = 0.5;
        dirLight.diffuse = new Color3(1, 0.95, 0.8); // Slightly warm sunlight

        // Create a skybox mesh
        const skybox = CreateBox('skyBox', { size: 1000.0 }, this.scene);

        // Create a sky material
        const skyMaterial = new SkyMaterial('skyMaterial', this.scene);
        skyMaterial.backFaceCulling = false;

        // Set sky properties
        skyMaterial.inclination = skyInclination;
        skyMaterial.azimuth = skyAzimuth;
        skyMaterial.luminance = 0.1; // Controls the overall brightness
        skyMaterial.turbidity = 20; // Controls the amount of haze/fog (0 to 20)
        skyMaterial.rayleigh = 2; // Rayleigh scattering coefficient (0 to 4, default 2)
        skyMaterial.mieCoefficient = 0.005; // Mie scattering coefficient (0 to 0.1, default 0.005)
        skyMaterial.mieDirectionalG = 0.8; // Mie directional scattering factor (0 to 1, default 0.8)

        // Apply the material to the skybox
        skybox.material = skyMaterial;

        // Ensure the skybox is rendered behind everything else
        skybox.infiniteDistance = true;
    }

    /**
     * Switching between training and an online duel, from the keyboard or the HUD
     */
    private setupSessionControls(): void {
        hudStore.actions = {
            startTraining: () => this.startSession(new TrainingSession()),
            startDuel: () => this.startSession(new DuelSession())
        };

        window.addEventListener('keydown', (event) => {
            if (event.code === 'KeyH') this.debugOverlay.toggle();
            if (event.code === 'KeyO') {
                this.startSession(this.session.mode === 'training' ? new DuelSession() : new TrainingSession());
            }
        });
    }

    private startSession(session: GameSession): void {
        this.session.dispose();
        this.session = session;
    }

    /**
     * Advance the session, then draw the world it produced
     */
    private update(elapsedMs: number): void {
        this.session.update(elapsedMs, () => this.input.sampleInputFrame(this.cameraRig.getYaw()));

        const world = this.session.getWorld();
        const previousWorld = this.session.getPreviousWorld();

        // Blend between the last two ticks so rendering stays smooth at any frame rate
        const alpha = this.session.getAlpha();
        this.characterViews.forEach((view, index) => {
            view.update(previousWorld.characters[index], world.characters[index], alpha);
        });
        this.debugOverlay.update(world);

        const playerIndex = this.session.getLocalPlayerIndex();
        const playerView = this.characterViews[playerIndex];
        const isLockedOn = world.characters[playerIndex].lockedOn;
        this.cameraRig.update(playerView.getPosition(), isLockedOn ? playerView.getYaw() : null);

        this.publishHud(world);
    }

    private publishHud(world: WorldState): void {
        const names = this.session.getCharacterNames();

        hudStore.publish({
            mode: this.session.mode,
            characters: world.characters.map((character, index) => ({
                name: names[index],
                health: character.health,
                maxHealth: tuning.MAX_HEALTH,
                stamina: character.stamina,
                maxStamina: tuning.MAX_STAMINA,
                stance: STANCES[character.stance],
                status: GameScene.describeStatus(character)
            })),
            statusLine: this.session.getStatusLine()
        });
    }

    private static describeStatus(character: CharacterState): string {
        if (character.knockoutTicks > 0) return 'Knocked out';
        if (character.stunKind === StunKind.Hit) return 'Hit';
        if (character.stunKind === StunKind.Block) return 'Blocked';
        if (character.stunKind === StunKind.GuardBroken) return 'Guard broken';

        const move = getCurrentMove(character);
        if (move) return `${move.name} (${getMovePhase(character)})`;
        if (character.dodgeTicks > 0) return 'Dodging';
        if (character.guarding) return 'Guarding';

        return '';
    }

    /**
     * Get the simulated world (read-only use: debugging and tests)
     */
    public getWorld(): WorldState {
        return this.session.getWorld();
    }

    /**
     * Get the index of the character the local player controls
     */
    public getLocalPlayerIndex(): number {
        return this.session.getLocalPlayerIndex();
    }

    /**
     * Get the Babylon.js scene
     */
    public getScene(): Scene {
        return this.scene;
    }
}
