import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 5, 10);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        // Lighting
        this.setupLights();

        // Create floor
        this.setupFloor();

        // Load player (car)
        this.setupPlayer();

        // Setup controls
        this.speed = 0.1;
        this.isJumping = false;
        this.jumpForce = 0;
        this.gravity = 0.005;
        this.jumpHeight = 0.15;
        this.keys = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
            " ": false, // Space bar for jumping
        };
        this.setupEventListeners();

        // Add only flying parameters
        this.isFlying = false;
        this.flyingSpeed = 0.1;
        this.fallSpeed = 0.15;
        this.wasMoving = false;

        this.animate();
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(10, 10, 10);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
    }

    setupFloor() {
        const floorGeometry = new THREE.PlaneGeometry(100, 100);
        const floorMaterial = new THREE.MeshStandardMaterial({
            color: 0x404040,
            roughness: 0.8,
            metalness: 0.2,
            side: THREE.DoubleSide,
        });

        this.floor = new THREE.Mesh(floorGeometry, floorMaterial);
        this.floor.rotation.x = -Math.PI / 2;
        this.floor.receiveShadow = true;
        this.scene.add(this.floor);

        // Add grid helper
        const grid = new THREE.GridHelper(100, 40, 0x000000, 0x444444);
        grid.position.y = 0.01;
        this.scene.add(grid);
    }

    setupPlayer() {
        const loader = new GLTFLoader();

        loader.load(
            "https://threejs.org/examples/models/gltf/Soldier.glb",
            (gltf) => {
                this.player = gltf.scene;
                this.player.scale.set(1, 1, 1);
                this.player.position.set(0, 0, 0);
                this.scene.add(this.player);

                // Setup animation mixer
                this.mixer = new THREE.AnimationMixer(this.player);
                this.animations = {};

                // Store original animations
                gltf.animations.forEach((clip) => {
                    this.animations[clip.name] = this.mixer.clipAction(clip);
                });

                // Create custom jump animation
                const jumpTrack = new THREE.NumberKeyframeTrack(
                    ".position[y]", // property to animate
                    [0, 0.5, 1], // keyframe times
                    [0, 1.5, 0], // values at each keyframe
                    THREE.InterpolateSmooth // interpolation type
                );

                // Create the jump animation clip
                this.jumpClip = new THREE.AnimationClip("Jump", 1, [jumpTrack]);
                this.animations["Jump"] = this.mixer.clipAction(this.jumpClip);
                this.animations["Jump"].setLoop(THREE.LoopOnce);
                this.animations["Jump"].clampWhenFinished = true;

                // Start with idle animation
                this.currentAction = this.animations["Idle"];
                this.currentAction.play();

                // Add shadows
                this.player.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
            }
        );
    }

    updateCameraPosition() {
        if (!this.player) return;

        // Position camera behind player
        const cameraOffset = new THREE.Vector3(0, 2, 4);
        const playerPosition = this.player.position.clone();

        // Add height offset for jump
        playerPosition.y += 1;

        // Calculate camera position
        this.camera.position.copy(playerPosition).add(cameraOffset);
        this.camera.lookAt(playerPosition);
    }

    setupEventListeners() {
        window.addEventListener("keydown", (event) => {
            if (this.keys.hasOwnProperty(event.key)) {
                this.keys[event.key] = true;
            }
        });

        window.addEventListener("keyup", (event) => {
            if (this.keys.hasOwnProperty(event.key)) {
                this.keys[event.key] = false;
            }
        });

        // Handle window resize
        window.addEventListener("resize", () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    movePlayer() {
        if (!this.player || !this.mixer) return;

        const moveDistance = this.speed;
        let isMoving = false;

        // Check movement
        if (this.keys.ArrowUp) {
            this.player.position.z -= moveDistance;
            this.player.rotation.y = 0;
            isMoving = true;
        }
        if (this.keys.ArrowDown) {
            this.player.position.z += moveDistance;
            this.player.rotation.y = Math.PI;
            isMoving = true;
        }
        if (this.keys.ArrowLeft) {
            this.player.position.x -= moveDistance;
            this.player.rotation.y = Math.PI / 2;
            isMoving = true;
        }
        if (this.keys.ArrowRight) {
            this.player.position.x += moveDistance;
            this.player.rotation.y = -Math.PI / 2;
            isMoving = true;
        }

        // Store current movement state
        this.wasMoving = isMoving;

        // Flying and landing logic
        if (this.keys[" "]) {
            // Flying up
            this.player.position.y += this.flyingSpeed;
            this.playAnimation("Jump");
            this.isFlying = true;
        } else {
            if (this.player.position.y > 0) {
                // Falling
                this.player.position.y -= this.fallSpeed;
                this.playAnimation("Jump");

                // Check for landing
                if (this.player.position.y <= 0) {
                    this.player.position.y = 0;
                    this.isFlying = false;

                    // Force animation change on landing
                    if (isMoving) {
                        this.forceAnimation("Run");
                    } else {
                        this.forceAnimation("Idle");
                    }
                }
            } else {
                // On ground
                if (this.isFlying) {
                    // Just landed
                    this.isFlying = false;
                    if (isMoving) {
                        this.forceAnimation("Run");
                    } else {
                        this.forceAnimation("Idle");
                    }
                } else {
                    // Normal ground movement
                    if (isMoving) {
                        this.playAnimation("Run");
                    } else {
                        this.playAnimation("Idle");
                    }
                }
            }
        }

        this.updateCameraPosition();
    }

    // Add a new method to force animation change
    forceAnimation(name) {
        if (!this.animations[name]) return;

        if (this.currentAction) {
            this.currentAction.stop();
        }

        const nextAction = this.animations[name];
        nextAction
            .reset()
            .setEffectiveTimeScale(1)
            .setEffectiveWeight(1)
            .play();

        this.currentAction = nextAction;
    }

    // Regular animation transitions
    playAnimation(name) {
        if (
            !this.animations[name] ||
            this.currentAction === this.animations[name]
        )
            return;

        const nextAction = this.animations[name];
        const duration = 0.15;

        if (this.currentAction) {
            this.currentAction.fadeOut(duration);
        }

        nextAction
            .reset()
            .setEffectiveTimeScale(1)
            .setEffectiveWeight(1)
            .fadeIn(duration)
            .play();

        this.currentAction = nextAction;
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const deltaTime = 0.016;

        if (this.mixer) {
            this.mixer.update(deltaTime);
        }

        this.movePlayer();
        this.renderer.render(this.scene, this.camera);
    }
}

new Game();
