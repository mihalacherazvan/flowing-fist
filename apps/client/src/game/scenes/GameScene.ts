import { Constants } from '@babylonjs/core/Engines/constants';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { Scene } from '@babylonjs/core/scene';
import { SkyMaterial } from '@babylonjs/materials/sky';
import type { Engine as EngineType } from '@babylonjs/core/Engines/engine';
import type { Mesh as MeshType } from '@babylonjs/core/Meshes/mesh';
import { STANCES, TRAINING_ARENA } from '@flowing-fist/content';
import { MatchPhase, NO_WINNER, StunKind, TICK_RATE, getCurrentMove, getMovePhase, tuning } from '@flowing-fist/sim';
import type { CharacterState, WorldState } from '@flowing-fist/sim';
import { accountStore } from '../../account/accountStore';
import { hudStore } from '../../ui/hudStore';
import type { DuelRequest, HudMatch } from '../../ui/hudStore';
import { menuStore } from '../../ui/menuStore';
import { CameraRig } from '../camera/CameraRig';
import { characterModelStore } from '../characters/characterModelStore';
import { CharacterView } from '../characters/CharacterView';
import { CombatDebugOverlay } from '../debug/CombatDebugOverlay';
import { DuelSession } from '../sessions/DuelSession';
import type { GameSession } from '../sessions/GameSession';
import { TrainingSession } from '../sessions/TrainingSession';
import { InputController } from '../utils/InputController';

const CHARACTER_COUNT = 2;
/** How long "Fight!" stays up once a round starts */
const FIGHT_ANNOUNCEMENT_TICKS = 45;

/** Side of one floor tile, in world units */
const TILE_SIZE = 2;
const TILE_TEXTURE_PIXELS = 256;
// Neutral warm greys: light enough for the characters and the overlay to stand out against
const TILE_COLORS = ['#8f8d88', '#858480'];
const TILE_GROUT_COLOR = '#5f5e5b';
const TILE_GROUT_PIXELS = 3;

export class GameScene {
    private scene: Scene;
    private ground!: MeshType;
    private input: InputController;
    private session: GameSession = new TrainingSession(accountStore.getState().activeDeck);
    private characterViews: CharacterView[];
    private cameraRig: CameraRig;
    private debugOverlay: CombatDebugOverlay;
    /** The session and player the camera was last put behind; a change of either is a new fight */
    private cameraPlacement: { session: GameSession; playerIndex: number } | null = null;

    constructor(private engine: EngineType, private canvas: HTMLCanvasElement) {
        // Create the scene
        this.scene = new Scene(this.engine);

        // Create input controller
        this.input = new InputController(this.canvas);

        // Setup environment
        this.setupEnvironment();

        // Create a view per character and the camera that follows the local player
        this.characterViews = [
            new CharacterView(this.scene, 'first', characterModelStore.getModel()),
            new CharacterView(this.scene, 'second', characterModelStore.getModel())
        ];
        characterModelStore.subscribe(() => {
            this.characterViews.forEach((view) => view.setModel(characterModelStore.getModel()));
        });
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
        const size = TRAINING_ARENA.radius * 2;
        this.ground = CreateGround('ground', { width: size, height: size, subdivisions: 16 }, this.scene);

        const groundMaterial = new StandardMaterial('groundMaterial', this.scene);
        const tileTexture = this.createTileTexture();
        // The texture holds two tiles each way
        tileTexture.uScale = size / (TILE_SIZE * 2);
        tileTexture.vScale = size / (TILE_SIZE * 2);
        groundMaterial.diffuseTexture = tileTexture;

        // Stone, not polished: only a faint sheen
        groundMaterial.specularColor = new Color3(0.08, 0.08, 0.08);
        groundMaterial.specularPower = 32;

        this.ground.material = groundMaterial;
        this.ground.checkCollisions = true;
    }

    /**
     * Draw a two-by-two block of floor tiles in slightly different greys, with grout between them
     */
    private createTileTexture(): DynamicTexture {
        const texture = new DynamicTexture('tileTexture', TILE_TEXTURE_PIXELS, this.scene, true);
        const context = texture.getContext();
        const tilePixels = TILE_TEXTURE_PIXELS / 2;

        context.fillStyle = TILE_GROUT_COLOR;
        context.fillRect(0, 0, TILE_TEXTURE_PIXELS, TILE_TEXTURE_PIXELS);

        for (let row = 0; row < 2; row++) {
            for (let column = 0; column < 2; column++) {
                context.fillStyle = TILE_COLORS[(row + column) % 2];
                context.fillRect(
                    column * tilePixels + TILE_GROUT_PIXELS / 2,
                    row * tilePixels + TILE_GROUT_PIXELS / 2,
                    tilePixels - TILE_GROUT_PIXELS,
                    tilePixels - TILE_GROUT_PIXELS
                );
            }
        }

        texture.update();
        // Unlike a loaded texture, a drawn one does not repeat unless told to
        texture.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
        texture.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
        // The floor is seen at a shallow angle, where plain filtering smears the grout lines
        texture.anisotropicFilteringLevel = 8;

        return texture;
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
        const startTraining = () => this.startSession(new TrainingSession(accountStore.getState().activeDeck));
        const startDuel = (request: DuelRequest) => this.startSession(new DuelSession(request));

        hudStore.actions = { startTraining, startDuel };

        window.addEventListener('keydown', (event) => {
            if (menuStore.isOpen()) {
                if (event.code === 'Escape') menuStore.setOpen(false);
                return;
            }

            if (event.code === 'KeyV') this.debugOverlay.toggle();
            if (event.code === 'KeyB') menuStore.setOpen(true);
            if (event.code === 'KeyO') {
                if (this.session.mode === 'training') {
                    startDuel({ kind: 'ranked' });
                } else if (!this.isMatchInProgress()) {
                    // Leaving a match in progress gives it away, which is too much for one stray key press
                    startTraining();
                }
            }
        });

        // Training restarts with a newly chosen deck. A duel keeps the deck it started with.
        let trainingDeck = accountStore.getState().activeDeck;
        accountStore.subscribe(() => {
            const { activeDeck } = accountStore.getState();
            if (activeDeck === trainingDeck) return;

            trainingDeck = activeDeck;
            if (this.session.mode === 'training') startTraining();
        });
        accountStore.connect();
    }

    /**
     * True while an online match is being fought: it has started and has no result yet
     */
    private isMatchInProgress(): boolean {
        return this.session.mode === 'duel' && !this.session.getLobby() && !this.session.getResult();
    }

    private startSession(session: GameSession): void {
        this.session.dispose();
        this.session = session;
    }

    /**
     * Advance the session, then draw the world it produced
     */
    private update(elapsedMs: number): void {
        this.session.update(elapsedMs, () => this.input.sampleInputFrame(this.getMovementYaw()));

        const world = this.session.getWorld();
        const previousWorld = this.session.getPreviousWorld();

        // Blend between the last two ticks so rendering stays smooth at any frame rate
        const alpha = this.session.getAlpha();
        this.characterViews.forEach((view, index) => {
            view.update(previousWorld.characters[index], world.characters[index], world.tick, alpha, elapsedMs / 1000);
        });
        this.debugOverlay.update(world);

        const playerIndex = this.session.getLocalPlayerIndex();
        const playerView = this.characterViews[playerIndex];
        // A duel only learns which fighter is the player's once the server has answered
        if (this.cameraPlacement?.session !== this.session || this.cameraPlacement.playerIndex !== playerIndex) {
            this.cameraPlacement = { session: this.session, playerIndex };
            this.cameraRig.placeBehind(world.characters[playerIndex].yaw);
        }
        const isLockedOn = world.characters[playerIndex].lockedOn;
        this.cameraRig.update(playerView.getPosition(), isLockedOn ? playerView.getYaw() : null);

        this.publishHud(world);
    }

    /**
     * Yaw the movement keys are relative to: the camera's, except while locked on,
     * where the camera looks from the side and forward has to mean towards the opponent
     */
    private getMovementYaw(): number {
        const player = this.session.getWorld().characters[this.session.getLocalPlayerIndex()];

        return player.lockedOn ? player.yaw : this.cameraRig.getYaw();
    }

    private publishHud(world: WorldState): void {
        const names = this.session.getCharacterNames();
        const result = this.session.getResult();

        hudStore.publish({
            mode: this.session.mode,
            characters: world.characters.map((character, index) => ({
                name: names[index],
                health: character.health,
                maxHealth: tuning.MAX_HEALTH,
                stamina: character.stamina,
                maxStamina: tuning.MAX_STAMINA,
                stance: STANCES[character.stance],
                status: GameScene.describeStatus(character),
                roundsWon: world.match ? world.match.wins[index] : null
            })),
            statusLine: this.session.getStatusLine(),
            // Once the result is up it says everything the round display would
            match: result ? null : this.describeMatch(world),
            lobby: this.session.getLobby(),
            result,
            isMatchInProgress: this.isMatchInProgress()
        });
    }

    /**
     * The round number, the clock and what to announce, from the match in the world
     */
    private describeMatch(world: WorldState): HudMatch | null {
        const match = world.match;
        if (!match) return null;

        let secondsLeft: number | null = null;
        let announcement = '';

        if (match.phase === MatchPhase.Countdown) {
            secondsLeft = tuning.ROUND_TICKS / TICK_RATE;
            announcement = `Round ${match.round} · ${Math.ceil(match.phaseTicks / TICK_RATE)}`;
        } else if (match.phase === MatchPhase.Fighting) {
            secondsLeft = Math.ceil(match.phaseTicks / TICK_RATE);
            if (match.phaseTicks > tuning.ROUND_TICKS - FIGHT_ANNOUNCEMENT_TICKS) announcement = 'Fight!';
        } else {
            const isKnockout = world.characters.some((character) => character.health <= 0);
            const winner = match.roundWinner;
            // Only duels have rounds, so the local player is always one of the two
            const outcome = winner === NO_WINNER ? 'Round drawn'
                : winner === this.session.getLocalPlayerIndex() ? 'You win the round'
                    : 'You lose the round';

            announcement = `${isKnockout ? 'KO' : 'Time up'} · ${outcome}`;
        }

        return { round: match.round, roundsToWin: tuning.ROUNDS_TO_WIN, secondsLeft, announcement };
    }

    private static describeStatus(character: CharacterState): string {
        if (character.knockoutTicks > 0) return 'Knocked out';
        if (character.stunKind === StunKind.Hit) return 'Hit';
        if (character.stunKind === StunKind.Block) return 'Blocked';
        if (character.stunKind === StunKind.GuardBroken) return 'Guard broken';
        if (character.stunKind === StunKind.Parried) return 'Parried';

        const move = getCurrentMove(character);
        if (move) return `${move.name} (${getMovePhase(character)})`;
        if (character.parryTicks > 0) return 'Parrying';
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
