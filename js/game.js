import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

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

        // Add lights first
        this.setupLights();

        // Add building
        this.addBuilding();

        // Setup floor
        this.setupFloor();

        // Setup player and controls last
        this.isFlying = false;
        this.flyingSpeed = 0.1;
        this.fallSpeed = 0.15;
        this.speed = 0.1;
        this.keys = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
            " ": false, // Space bar for jumping
        };

        this.setupPlayer();
        this.setupEventListeners();
        this.animate();
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(50, 50, 50);
        directionalLight.castShadow = true;

        // Improve shadow quality and coverage
        directionalLight.shadow.mapSize.width = 2048; // Increased from default (512)
        directionalLight.shadow.mapSize.height = 2048; // Increased from default (512)

        // Adjust the shadow camera's frustum
        directionalLight.shadow.camera.left = -50;
        directionalLight.shadow.camera.right = 50;
        directionalLight.shadow.camera.top = 50;
        directionalLight.shadow.camera.bottom = -50;
        directionalLight.shadow.camera.near = 0.1;
        directionalLight.shadow.camera.far = 200;

        // Optional: Improve shadow softness
        directionalLight.shadow.bias = -0.001;
        directionalLight.shadow.normalBias = 0.02;

        this.scene.add(directionalLight);
    }

    setupFloor() {
        const floorGeometry = new THREE.PlaneGeometry(100, 100);
        const floorMaterial = new THREE.MeshStandardMaterial({
            color: 0x808080, // Concrete gray
            roughness: 0.9, // Very rough for concrete look
            metalness: 0.1, // Low metalness
            side: THREE.DoubleSide,
        });

        this.floor = new THREE.Mesh(floorGeometry, floorMaterial);
        this.floor.rotation.x = -Math.PI / 2;
        this.floor.receiveShadow = true;
        this.scene.add(this.floor);
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

        // Camera offset with tilted angle
        const cameraOffset = new THREE.Vector3(
            0, // X offset (left/right)
            4, // Y offset (height) - increased for better view
            6 // Z offset (distance behind player)
        );

        // Position camera behind player
        const playerPosition = this.player.position.clone();
        this.camera.position.copy(playerPosition).add(cameraOffset);

        // Tilt camera down to see more of the path ahead
        this.camera.lookAt(
            playerPosition.x, // Look at player's X position
            playerPosition.y + 0.5, // Look slightly above player's Y position
            playerPosition.z - 4 // Look ahead of player's Z position
        );
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

    checkBuildingCollision(newPosition) {
        const buildingBounds = {
            minX: -50,
            maxX: -40,
            minZ: -50,
            maxZ: -40,
            // Door opening boundaries with more depth
            doorMinX: -46,
            doorMaxX: -44,
            doorFrontZ: -40,
            doorBackZ: -41, // Deeper door boundary
        };

        // Check if the new position would be inside the building bounds
        if (
            newPosition.x >= buildingBounds.minX &&
            newPosition.x <= buildingBounds.maxX &&
            newPosition.z >= buildingBounds.minZ &&
            newPosition.z <= buildingBounds.maxZ
        ) {
            // Allow walking through the deeper door area
            if (
                newPosition.z >= buildingBounds.doorBackZ &&
                newPosition.z <= buildingBounds.doorFrontZ &&
                newPosition.x >= buildingBounds.doorMinX &&
                newPosition.x <= buildingBounds.doorMaxX
            ) {
                return false; // No collision, can walk through door
            }

            return true; // Collision detected
        }

        return false; // No collision
    }

    movePlayer() {
        if (!this.player || !this.mixer) return;

        const moveDistance = this.speed;
        let isMoving = false;

        // Store current position before movement
        const currentPosition = this.player.position.clone();
        const newPosition = currentPosition.clone();

        // Check movement with collision
        if (this.keys.ArrowUp) {
            newPosition.z -= moveDistance;
            this.player.rotation.y = 0;
            isMoving = true;
        }
        if (this.keys.ArrowDown) {
            newPosition.z += moveDistance;
            this.player.rotation.y = Math.PI;
            isMoving = true;
        }
        if (this.keys.ArrowLeft) {
            newPosition.x -= moveDistance;
            this.player.rotation.y = Math.PI / 2;
            isMoving = true;
        }
        if (this.keys.ArrowRight) {
            newPosition.x += moveDistance;
            this.player.rotation.y = -Math.PI / 2;
            isMoving = true;
        }

        // Check for collision before applying movement
        if (isMoving && !this.checkBuildingCollision(newPosition)) {
            this.player.position.copy(newPosition);
        }

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

        // Log building position for debugging
        if (this.building) {
            console.log("Building position:", this.building.position);
        }

        this.renderer.render(this.scene, this.camera);
    }

    setupEnvironment() {
        // ... existing environment setup ...

        // Add black cube building
        this.addBuilding();
    }

    addBuilding() {
        // Create the main cube structure
        const buildingGeometry = new THREE.BoxGeometry(10, 10, 10);
        const buildingMaterial = new THREE.MeshStandardMaterial({
            color: 0x000003,
            roughness: 0.7,
            metalness: 1,
        });

        this.building = new THREE.Mesh(buildingGeometry, buildingMaterial);
        this.building.position.set(-45, 5, -45); // Back left corner
        this.building.castShadow = true;
        this.building.receiveShadow = true;
        this.scene.add(this.building);

        // Add door facing the starting position
        const doorGeometry = new THREE.PlaneGeometry(2, 4);
        const doorMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xcccccc,
            metalness: 0.2,
            roughness: 0.5,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            depthWrite: false, // Prevents z-fighting
            blending: THREE.AdditiveBlending, // Smoother blending
        });

        // Create door with slight offset from building
        this.door = new THREE.Mesh(doorGeometry, doorMaterial);
        this.door.position.set(-45, 2, -39.95); // Moved slightly forward from building
        this.door.renderOrder = 1; // Ensure door renders after building
        this.scene.add(this.door);

        // Add sign with larger dimensions (30% bigger)
        const signGeometry = new THREE.PlaneGeometry(5.2, 2.6); // Increased from 4, 2
        const signTexture = new THREE.TextureLoader().load(
            "/public/DarkSun.png"
        );
        const signMaterial = new THREE.MeshBasicMaterial({
            map: signTexture,
            transparent: true,
            alphaTest: 0.1, // Helps with transparency
            side: THREE.DoubleSide,
        });
        const sign = new THREE.Mesh(signGeometry, signMaterial);
        sign.position.set(-45, 6.5, -39.9); // Slightly higher to account for larger size
        this.scene.add(sign);

        console.log("Building added to scene"); // Debug log
    }
}

new Game();
