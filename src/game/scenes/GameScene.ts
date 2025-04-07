import { 
    Scene, 
    Vector3, 
    HemisphericLight, 
    MeshBuilder, 
    StandardMaterial, 
    Color3, 
    DirectionalLight,
    Texture,
} from '@babylonjs/core';
import { SkyMaterial } from '@babylonjs/materials/sky';
import type { Scene as SceneType } from '@babylonjs/core/scene';
import type { Engine as EngineType } from '@babylonjs/core/Engines/engine';
import type { Mesh as MeshType } from '@babylonjs/core/Meshes/mesh';
import { Player } from '../characters/Player';
import { InputController } from '../utils/InputController';

// Import SceneLoader loaders
import '@babylonjs/loaders/glTF';

export class GameScene {
    private scene: SceneType;
    private player: Player;
    private ground!: MeshType;
    private input: InputController;

    constructor(private engine: EngineType, private canvas: HTMLCanvasElement) {
        // Create the scene
        this.scene = new Scene(this.engine);

        // Create input controller
        this.input = new InputController(this.canvas);

        // Setup environment
        this.setupEnvironment();

        // Create player
        this.player = new Player(this.scene, this.input, new Vector3(0, 1, 0));

        // Register render loop
        this.engine.runRenderLoop(() => {
            this.update();
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
        this.ground = MeshBuilder.CreateGround(
            'ground',
            { width: 100, height: 100, subdivisions: 16 },
            this.scene
        );
        // Create a standard material for the ground
        const groundMaterial = new StandardMaterial('groundMaterial', this.scene);

        // Create ground texture
        const groundTexture = new Texture("textures/ground.jpg", this.scene);
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
        const skybox = MeshBuilder.CreateBox("skyBox", { size: 1000.0 }, this.scene);

        // Create a sky material
        const skyMaterial = new SkyMaterial("skyMaterial", this.scene);
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
     * Update game logic
     */
    private update(): void {
        // Update player
        this.player.update();
    }

    /**
     * Get the Babylon.js scene
     */
    public getScene(): SceneType {
        return this.scene;
    }
}
