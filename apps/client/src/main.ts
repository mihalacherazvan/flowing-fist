import { Engine } from '@babylonjs/core/Engines/engine';
import { GameScene } from './game/scenes/GameScene';
import { mountHud } from './ui/mountHud';
import './style.css';

class Game {
    private canvas: HTMLCanvasElement;
    private engine: Engine;
    private gameScene: GameScene;
    private loadingScreen: HTMLElement | null;

    constructor() {
        // Get the canvas element
        this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        if (!this.canvas) throw new Error('Canvas element not found');
        
        // Get loading screen element
        this.loadingScreen = document.getElementById('loadingScreen');
        
        // Initialize the Babylon.js engine
        this.engine = new Engine(this.canvas, true, { 
            preserveDrawingBuffer: true, 
            stencil: true,
            disableWebGL2Support: false
        });
        
        // Create and initialize the game scene
        this.gameScene = new GameScene(this.engine, this.canvas);
        
        // Mount the HUD over the canvas
        const uiContainer = document.getElementById('ui');
        if (uiContainer) mountHud(uiContainer);

        // Hide loading screen once everything is loaded
        this.hideLoadingScreen();
        
        // Add debug inspector (press backtick to toggle)
        this.setupDebugLayer();

        // Let browser tests read the simulation state
        if (import.meta.env.DEV) {
            (window as Window & { flowingFist?: GameScene }).flowingFist = this.gameScene;
        }
    }

    /**
     * Hide the loading screen
     */
    private hideLoadingScreen(): void {
        if (this.loadingScreen) {
            this.loadingScreen.style.display = 'none';
        }
    }

    /**
     * Setup the Babylon.js debug inspector
     */
    private setupDebugLayer(): void {
        // The inspector is large, so it is only loaded on demand in dev builds
        if (import.meta.env.DEV) {
            // Add keyboard shortcut to show/hide inspector (backtick)
            window.addEventListener('keydown', async (event) => {
                if (event.key === '`') {
                    await import('@babylonjs/core/Debug/debugLayer');
                    await import('@babylonjs/inspector');

                    if (this.gameScene.getScene().debugLayer.isVisible()) {
                        this.gameScene.getScene().debugLayer.hide();
                    } else {
                        this.gameScene.getScene().debugLayer.show();
                    }
                }
            });
        }
    }
}

// Initialize the game when the page is loaded
window.addEventListener('DOMContentLoaded', () => {
    new Game();
});
