import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

class Game {
    loadPlayer() {
        const loadingManager = new THREE.LoadingManager();
        loadingManager.onProgress = (url, loaded, total) => {
            console.log(`Loading: ${(loaded / total) * 100}%`);
        };

        this.loader = new GLTFLoader(loadingManager);

        // Create temporary cube while model loads
        const tempGeometry = new THREE.BoxGeometry(1, 1, 1);
        const tempMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.player = new THREE.Mesh(tempGeometry, tempMaterial);
        this.player.position.y = 0.5;
        this.scene.add(this.player);

        // Load the sports car model
        this.loader.load(
            "https://raw.githubusercontent.com/pmndrs/drei-assets/master/vehicles/McLaren.glb",
            (gltf) => {
                console.log("Car loaded successfully!");

                // Remove the temporary cube
                this.scene.remove(this.player);

                // Set up the car model
                this.player = gltf.scene;

                // Adjust the car's scale and position
                this.player.scale.set(0.7, 0.7, 0.7);
                this.player.position.set(0, 0.3, 0);

                // Rotate to face forward
                this.player.rotation.y = Math.PI;

                // Add the car to the scene
                this.scene.add(this.player);

                // Add car shadow
                this.player.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                // Adjust camera for better car view
                this.camera.position.set(0, 3, 8);
                this.camera.lookAt(this.player.position);
            },
            (progress) => {
                console.log(
                    "Loading progress:",
                    (progress.loaded / progress.total) * 100 + "%"
                );
            },
            (error) => {
                console.error("Error loading car:", error);
                // Keep the red cube as fallback
                console.log("Using fallback cube instead");
            }
        );
    }

    constructor() {
        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb); // Sky blue background
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        // Add better lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(10, 10, 10);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);

        // Improve shadow quality
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;

        // Game objects
        this.createFloor();
        this.loadPlayer();

        // Controls
        this.speed = 0.15; // Adjusted for the sports car
        this.keys = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
        };

        this.setupEventListeners();
        this.animate();
    }

    createFloor() {
        // Create a more realistic floor with asphalt texture
        const floorGeometry = new THREE.PlaneGeometry(100, 100);
        const textureLoader = new THREE.TextureLoader();

        // Load asphalt texture
        const floorTexture = textureLoader.load(
            "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/terrain/grasslight-big.jpg"
        );
        floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
        floorTexture.repeat.set(10, 10);

        const floorMaterial = new THREE.MeshStandardMaterial({
            map: floorTexture,
            roughness: 0.8,
            metalness: 0.2,
            side: THREE.DoubleSide,
        });

        this.floor = new THREE.Mesh(floorGeometry, floorMaterial);
        this.floor.rotation.x = -Math.PI / 2;
        this.floor.receiveShadow = true;
        this.scene.add(this.floor);
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
        if (!this.player) return;

        const moveDistance = this.speed;
        const rotationSpeed = 0.03;

        if (this.keys.ArrowUp) {
            this.player.position.x +=
                Math.cos(this.player.rotation.y) * moveDistance;
            this.player.position.z +=
                Math.sin(this.player.rotation.y) * moveDistance;
        }
        if (this.keys.ArrowDown) {
            this.player.position.x -=
                Math.cos(this.player.rotation.y) * moveDistance * 0.5;
            this.player.position.z -=
                Math.sin(this.player.rotation.y) * moveDistance * 0.5;
        }
        if (this.keys.ArrowLeft) {
            this.player.rotation.y += rotationSpeed;
        }
        if (this.keys.ArrowRight) {
            this.player.rotation.y -= rotationSpeed;
        }

        // Update camera to follow car
        const cameraOffset = new THREE.Vector3(0, 3, 8);
        cameraOffset.applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            this.player.rotation.y
        );
        this.camera.position.copy(this.player.position).add(cameraOffset);
        this.camera.lookAt(this.player.position);
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));

        this.movePlayer();
        this.renderer.render(this.scene, this.camera);
    }
}

// Start the game
new Game();
