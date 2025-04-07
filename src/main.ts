import { Engine } from '@babylonjs/core';
import type { Engine as EngineType } from '@babylonjs/core/Engines/engine';
import '@babylonjs/core/Debug/debugLayer';
import '@babylonjs/inspector';
import { GameScene } from './game/scenes/GameScene';
import './style.css';

class Game {
    private canvas: HTMLCanvasElement;
    private engine: EngineType;
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
        
        // Hide loading screen once everything is loaded
        this.hideLoadingScreen();
        
        // Add debug inspector (press Ctrl+Shift+I to toggle)
        this.setupDebugLayer();
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
        // Add keyboard shortcut to show/hide inspector (Ctrl+Shift+I)
        window.addEventListener('keydown', (event) => {
            if (event.key === '`') {
                if (this.gameScene.getScene().debugLayer.isVisible()) {
                    this.gameScene.getScene().debugLayer.hide();
                } else {
                    this.gameScene.getScene().debugLayer.show();
                }
            }
        });
    }
}

// Initialize the game when the page is loaded
window.addEventListener('DOMContentLoaded', () => {
    new Game();
});
