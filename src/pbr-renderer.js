/**
 * Free3D Hub - PBR Renderer
 * 
 * Sketchfab-style PBR rendering with:
 * - IBL (Image-Based Lighting) via environment maps
 * - Full PBR texture support (Albedo, Normal, Metallic, Roughness, AO, Emissive, Height)
 * - ACES Filmic tone mapping
 * - OrbitControls for smooth camera interaction
 * - Post-processing ready (bloom trigger optional)
 * - Grid ground plane with contact shadows
 * - GLTF/GLB model loading
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

// ============================================
// Environment Map Generator
// ============================================
/**
 * Generate a procedural Studio HDR environment map
 * Sketchfab-style: soft gradient dome with a bright key light and warm fill
 */
function generateStudioEnvironment(renderer) {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    // Create a simple studio-like environment
    const envScene = new THREE.Scene();

    // Sky dome gradient
    const skyGeo = new THREE.SphereGeometry(50, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
            topColor: { value: new THREE.Color(0x1a1a2e) },
            bottomColor: { value: new THREE.Color(0x16213e) },
            horizonColor: { value: new THREE.Color(0x0f3460) },
            offset: { value: 10 },
            exponent: { value: 0.6 },
        },
        vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
        fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform vec3 horizonColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        float t = max(pow(max(h, 0.0), exponent), 0.0);
        vec3 color = mix(horizonColor, topColor, t);
        if (h < 0.0) {
          color = mix(horizonColor, bottomColor, min(pow(-h * 2.0, 0.5), 1.0));
        }
        gl_FragColor = vec4(color * 1.5, 1.0);
      }
    `,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    envScene.add(sky);

    // Key light sphere (simulates a bright area light)
    const keyLightGeo = new THREE.SphereGeometry(3, 16, 16);
    const keyLightMat = new THREE.MeshBasicMaterial({ color: 0xfff5ee });
    const keyLight = new THREE.Mesh(keyLightGeo, keyLightMat);
    keyLight.position.set(15, 20, 10);
    envScene.add(keyLight);

    // Fill light sphere
    const fillLightGeo = new THREE.SphereGeometry(5, 16, 16);
    const fillLightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.4, 0.6) });
    const fillLight = new THREE.Mesh(fillLightGeo, fillLightMat);
    fillLight.position.set(-20, 8, -15);
    envScene.add(fillLight);

    // Rim/back light
    const rimLightGeo = new THREE.SphereGeometry(2, 16, 16);
    const rimLightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.6, 0.8) });
    const rimLight = new THREE.Mesh(rimLightGeo, rimLightMat);
    rimLight.position.set(-8, 15, -20);
    envScene.add(rimLight);

    // Ground glow
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.05, 0.08) });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -10;
    envScene.add(ground);

    const envMap = pmremGenerator.fromScene(envScene, 0.04).texture;
    pmremGenerator.dispose();

    // Clean up env scene
    skyGeo.dispose();
    skyMat.dispose();
    keyLightGeo.dispose();
    keyLightMat.dispose();
    fillLightGeo.dispose();
    fillLightMat.dispose();
    rimLightGeo.dispose();
    rimLightMat.dispose();
    groundGeo.dispose();
    groundMat.dispose();

    return envMap;
}

// ============================================
// PBR Scene Creator
// ============================================

/**
 * Create a Sketchfab-style PBR viewer in the given container.
 * 
 * @param {HTMLElement} container - DOM element to render into
 * @param {Object} options - Configuration options
 * @param {string} options.modelUrl - URL of the GLTF/GLB/FBX/OBJ model file
 * @param {string} options.modelFormat - Format hint ('gltf','fbx','obj') for blob URLs
 * @param {Object} options.textures - PBR texture URLs { albedo, normal, metallic, roughness, ao, emissive, height }
 * @param {Object} options.modelData - Metadata for the model (fallback geometry colors etc)
 * @param {boolean} options.autoRotate - Enable auto-rotation (default true)
 * @param {boolean} options.showGrid - Show ground grid (default true)
 */
export function createPBRViewer(container, options = {}) {
    const {
        modelUrl = null,
        modelFormat = null,
        textures = {},
        modelData = {},
        autoRotate = true,
        showGrid = true,
        isThumbnail = false,
    } = options;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // ---- Renderer ----
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // ---- Scene ----
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e0e14);

    // ---- Camera ----
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
    camera.position.set(3, 2, 3);

    // ---- OrbitControls (Sketchfab-style) ----
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.5;
    controls.minDistance = 0.5;
    controls.maxDistance = 20;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.5;
    controls.target.set(0, 0, 0);

    // ---- Environment Map (IBL) ----
    const envMap = generateStudioEnvironment(renderer);
    scene.environment = envMap;

    // ---- Lights ----
    // Key light
    const keyLight = new THREE.DirectionalLight(0xfff5ee, 2.5);
    keyLight.position.set(5, 8, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 30;
    keyLight.shadow.camera.left = -5;
    keyLight.shadow.camera.right = 5;
    keyLight.shadow.camera.top = 5;
    keyLight.shadow.camera.bottom = -5;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    // Fill light (cool blue)
    const fillLight = new THREE.DirectionalLight(0x8eafc8, 0.8);
    fillLight.position.set(-4, 3, -5);
    scene.add(fillLight);

    // Rim light
    const rimLight = new THREE.DirectionalLight(0xc4b5fd, 0.6);
    rimLight.position.set(-2, 5, -4);
    scene.add(rimLight);

    // Ambient fill
    const ambientLight = new THREE.AmbientLight(0x1a1a2e, 0.3);
    scene.add(ambientLight);

    // ---- Ground ----
    if (showGrid) {
        // Shadow-catching ground
        const groundGeo = new THREE.PlaneGeometry(30, 30);
        const groundMat = new THREE.ShadowMaterial({
            opacity: 0.3,
        });
        const groundMesh = new THREE.Mesh(groundGeo, groundMat);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.y = -0.01;
        groundMesh.receiveShadow = true;
        scene.add(groundMesh);

        // Grid helper
        const gridHelper = new THREE.GridHelper(10, 20, 0x1a1a2e, 0x14142a);
        gridHelper.position.y = 0;
        gridHelper.material.opacity = 0.4;
        gridHelper.material.transparent = true;
        scene.add(gridHelper);

        // Center marker
        const markerGeo = new THREE.RingGeometry(0.03, 0.05, 32);
        const markerMat = new THREE.MeshBasicMaterial({
            color: 0x6c5ce7,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
        });
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.rotation.x = -Math.PI / 2;
        marker.position.y = 0.001;
        scene.add(marker);
    }

    // ---- Texture Loader ----
    const textureLoader = new THREE.TextureLoader();

    /**
     * Load a texture from URL with proper settings
     */
    function loadTexture(url, encoding = THREE.SRGBColorSpace) {
        return new Promise((resolve) => {
            if (!url) { resolve(null); return; }
            textureLoader.load(url, (tex) => {
                tex.colorSpace = encoding;
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.flipY = true;
                resolve(tex);
            }, undefined, () => resolve(null));
        });
    }

    // ---- Model Loading State ----
    let loadedModel = null;
    let loadedMaterials = [];

    /**
     * Apply PBR textures to all meshes in a model
     */
    async function applyPBRTextures(object, textureUrls) {
        const [
            albedoTex,
            normalTex,
            metallicTex,
            roughnessTex,
            aoTex,
            emissiveTex,
            heightTex,
        ] = await Promise.all([
            loadTexture(textureUrls.albedo, THREE.SRGBColorSpace),
            loadTexture(textureUrls.normal, THREE.LinearSRGBColorSpace),
            loadTexture(textureUrls.metallic, THREE.LinearSRGBColorSpace),
            loadTexture(textureUrls.roughness, THREE.LinearSRGBColorSpace),
            loadTexture(textureUrls.ao, THREE.LinearSRGBColorSpace),
            loadTexture(textureUrls.emissive, THREE.SRGBColorSpace),
            loadTexture(textureUrls.height, THREE.LinearSRGBColorSpace),
        ]);

        object.traverse((child) => {
            if (child.isMesh) {
                // Create PBR material
                const pbrMat = new THREE.MeshPhysicalMaterial({
                    // Base color
                    map: albedoTex || child.material.map,
                    color: albedoTex ? 0xffffff : (child.material.color || new THREE.Color(0x888888)),

                    // Normal
                    normalMap: normalTex || child.material.normalMap,
                    normalScale: new THREE.Vector2(1, 1),

                    // Metallic / Roughness
                    metalnessMap: metallicTex || child.material.metalnessMap,
                    metalness: metallicTex ? 1.0 : (child.material.metalness ?? 0.0),
                    roughnessMap: roughnessTex || child.material.roughnessMap,
                    roughness: roughnessTex ? 1.0 : (child.material.roughness ?? 0.5),

                    // AO
                    aoMap: aoTex || child.material.aoMap,
                    aoMapIntensity: aoTex ? 1.5 : 1.0,

                    // Emissive
                    emissiveMap: emissiveTex || child.material.emissiveMap,
                    emissive: emissiveTex ? new THREE.Color(0xffffff) : (child.material.emissive || new THREE.Color(0x000000)),
                    emissiveIntensity: emissiveTex ? 1.0 : (child.material.emissiveIntensity ?? 0),

                    // Displacement (subtle)
                    displacementMap: heightTex,
                    displacementScale: heightTex ? 0.05 : 0,

                    // Physical properties (Sketchfab-style)
                    clearcoat: 0.0,
                    clearcoatRoughness: 0.3,
                    envMapIntensity: 1.2,

                    // Rendering
                    side: THREE.DoubleSide,
                    flatShading: false,
                });

                // Preserve UV2 for AO maps
                if (child.geometry && !child.geometry.attributes.uv2 && child.geometry.attributes.uv) {
                    child.geometry.setAttribute('uv2', child.geometry.attributes.uv);
                }

                child.material.dispose();
                child.material = pbrMat;
                child.castShadow = true;
                child.receiveShadow = true;

                loadedMaterials.push(pbrMat);
            }
        });
    }

    /**
     * Center and scale a loaded model to fit the viewport
     */
    function fitModelToView(object) {
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2.0 / maxDim;

        object.scale.multiplyScalar(scale);
        object.position.sub(center.multiplyScalar(scale));

        // Ensure model sits on ground
        const newBox = new THREE.Box3().setFromObject(object);
        object.position.y -= newBox.min.y;

        // Update controls target
        const newCenter = newBox.getCenter(new THREE.Vector3());
        controls.target.copy(newCenter);

        // Position camera nicely
        const dist = 3.5;
        camera.position.set(dist, dist * 0.7, dist);
        controls.update();
    }

    /**
     * Detect model format from URL
     */
    function detectFormat(url) {
        if (!url) return 'unknown';
        // Handle blob URLs - check stored format hint
        if (url.startsWith('blob:')) {
            return _modelFormatHint || 'glb';
        }
        const ext = url.split('.').pop().split('?')[0].toLowerCase();
        if (['glb', 'gltf'].includes(ext)) return 'gltf';
        if (ext === 'fbx') return 'fbx';
        if (ext === 'obj') return 'obj';
        return 'gltf'; // default
    }

    // Format hint for blob URLs (set externally)
    let _modelFormatHint = null;

    /**
     * Load a 3D model (GLTF/GLB, FBX, or OBJ)
     */
    function loadModel(url, formatHint) {
        _modelFormatHint = formatHint || null;
        const format = formatHint || detectFormat(url);

        return new Promise((resolve, reject) => {
            // Common handler for loaded models
            function handleLoadedModel(model, animations = []) {
                // Enable shadows on all meshes
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        if (child.material) {
                            // Ensure proper material settings
                            if (Array.isArray(child.material)) {
                                child.material.forEach(m => { m.envMapIntensity = 1.2; });
                            } else {
                                child.material.envMapIntensity = 1.2;
                            }
                        }
                    }
                });

                // Handle animations
                let mixer = null;
                if (animations && animations.length > 0) {
                    mixer = new THREE.AnimationMixer(model);
                    animations.forEach((clip) => {
                        mixer.clipAction(clip).play();
                    });
                }

                // Remove old model
                if (loadedModel) {
                    scene.remove(loadedModel);
                }
                scene.add(model);
                loadedModel = model;

                // Fit to view
                fitModelToView(model);

                resolve({ model, mixer, animations });
            }

            // Progress callback
            function onProgress(progress) {
                if (progress.total > 0) {
                    const percent = Math.round((progress.loaded / progress.total) * 100);
                    updateLoadingProgress(percent);
                }
            }

            try {
                if (format === 'fbx') {
                    // ---- FBX Loader ----
                    const fbxLoader = new FBXLoader();
                    fbxLoader.load(
                        url,
                        (fbxScene) => {
                            handleLoadedModel(fbxScene, fbxScene.animations || []);
                        },
                        onProgress,
                        (error) => reject(error)
                    );
                } else if (format === 'obj') {
                    // ---- OBJ Loader ----
                    const objLoader = new OBJLoader();
                    objLoader.load(
                        url,
                        (objGroup) => {
                            handleLoadedModel(objGroup, []);
                        },
                        onProgress,
                        (error) => reject(error)
                    );
                } else {
                    // ---- GLTF/GLB Loader (default) ----
                    const gltfLoader = new GLTFLoader();
                    const dracoLoader = new DRACOLoader();
                    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
                    gltfLoader.setDRACOLoader(dracoLoader);

                    gltfLoader.load(
                        url,
                        (gltf) => {
                            handleLoadedModel(gltf.scene, gltf.animations || []);
                        },
                        onProgress,
                        (error) => reject(error)
                    );
                }
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Create a fallback procedural PBR object when no model file is provided
     */
    function createFallbackObject(data) {
        const type = data.geometryType || 'sphere';
        let geometry;
        switch (type) {
            case 'box': geometry = new THREE.BoxGeometry(1.4, 1.4, 1.4, 4, 4, 4); break;
            case 'sphere': geometry = new THREE.SphereGeometry(1, 64, 64); break;
            case 'cylinder': geometry = new THREE.CylinderGeometry(0.6, 0.8, 1.8, 64); break;
            case 'torus': geometry = new THREE.TorusGeometry(0.8, 0.35, 32, 64); break;
            case 'torusKnot': geometry = new THREE.TorusKnotGeometry(0.7, 0.25, 128, 32); break;
            case 'icosahedron': geometry = new THREE.IcosahedronGeometry(1.1, 2); break;
            case 'octahedron': geometry = new THREE.OctahedronGeometry(1.1, 2); break;
            case 'dodecahedron': geometry = new THREE.DodecahedronGeometry(1.0, 2); break;
            case 'cone': geometry = new THREE.ConeGeometry(0.8, 1.8, 32); break;
            case 'capsule': geometry = new THREE.CapsuleGeometry(0.4, 1.2, 16, 32); break;
            default: geometry = new THREE.SphereGeometry(1, 64, 64);
        }

        // Create UV2 for AO
        if (geometry.attributes.uv) {
            geometry.setAttribute('uv2', geometry.attributes.uv);
        }

        const material = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(data.color || '#6c5ce7'),
            metalness: 0.3,
            roughness: 0.4,
            clearcoat: 0.3,
            clearcoatRoughness: 0.2,
            envMapIntensity: 1.2,
            emissive: new THREE.Color(data.secondaryColor || '#00cec9'),
            emissiveIntensity: 0.05,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Position on ground
        const box = new THREE.Box3().setFromObject(mesh);
        mesh.position.y = -box.min.y;

        scene.add(mesh);
        loadedModel = mesh;
        loadedMaterials.push(material);

        return mesh;
    }

    // ---- Loading Progress UI ----
    let progressBarContainer = null;
    if (!isThumbnail) {
        progressBarContainer = document.createElement('div');
        progressBarContainer.className = 'pbr-loading';
        progressBarContainer.innerHTML = `
        <div class="pbr-loading__spinner"></div>
        <div class="pbr-loading__text">Loading Model...</div>
        <div class="pbr-loading__bar">
          <div class="pbr-loading__fill" id="pbrLoadFill" style="width: 0%"></div>
        </div>
      `;
        container.appendChild(progressBarContainer);
    }

    function updateLoadingProgress(percent) {
        const fill = container.querySelector('#pbrLoadFill');
        if (fill) fill.style.width = percent + '%';
    }

    function hideLoadingProgress() {
        if (!progressBarContainer) return;
        progressBarContainer.style.opacity = '0';
        setTimeout(() => {
            if (progressBarContainer && progressBarContainer.parentNode) {
                progressBarContainer.parentNode.removeChild(progressBarContainer);
            }
        }, 400);
    }

    // ---- Toolbar ----
    const toolbar = document.createElement('div');
    toolbar.className = 'pbr-toolbar';
    toolbar.innerHTML = `
    <button class="pbr-toolbar__btn" data-action="wireframe" title="Wireframe Mode">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M4 12h16"/><path d="M12 4v16"/></svg>
    </button>
    <button class="pbr-toolbar__btn" data-action="normals" title="Show Normals">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 4v16"/><path d="M4 12h16"/></svg>
    </button>
    <button class="pbr-toolbar__btn" data-action="autoRotate" title="Auto Rotate">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
    </button>
    <button class="pbr-toolbar__btn" data-action="resetCamera" title="Reset Camera">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
    </button>
    <div class="pbr-toolbar__divider"></div>
    <button class="pbr-toolbar__btn" data-action="envStudio" title="Studio Lighting">S</button>
    <button class="pbr-toolbar__btn" data-action="envDark" title="Dark Lighting">D</button>
  `;
    if (!isThumbnail) {
        container.appendChild(toolbar);
    }

    // Toolbar event handling
    let isWireframe = false;
    toolbar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        switch (action) {
            case 'wireframe':
                isWireframe = !isWireframe;
                btn.classList.toggle('active', isWireframe);
                if (loadedModel) {
                    loadedModel.traverse((child) => {
                        if (child.isMesh) {
                            child.material.wireframe = isWireframe;
                        }
                    });
                }
                break;

            case 'normals':
                // Toggle between normal map view and standard view
                btn.classList.toggle('active');
                if (loadedModel) {
                    loadedModel.traverse((child) => {
                        if (child.isMesh && child.material) {
                            if (btn.classList.contains('active')) {
                                child.material._savedColor = child.material.color.clone();
                                child.material.color.setHex(0x8080ff);
                                child.material.metalness = 0;
                                child.material.roughness = 1;
                            } else {
                                if (child.material._savedColor) {
                                    child.material.color.copy(child.material._savedColor);
                                }
                                child.material.metalness = child.material._origMetalness ?? 0.3;
                                child.material.roughness = child.material._origRoughness ?? 0.4;
                            }
                        }
                    });
                }
                break;

            case 'autoRotate':
                controls.autoRotate = !controls.autoRotate;
                btn.classList.toggle('active', controls.autoRotate);
                break;

            case 'resetCamera':
                controls.reset();
                camera.position.set(3, 2, 3);
                controls.target.set(0, 0.5, 0);
                controls.update();
                break;

            case 'envStudio':
                renderer.toneMappingExposure = 1.0;
                scene.background = new THREE.Color(0x0e0e14);
                break;

            case 'envDark':
                renderer.toneMappingExposure = 0.6;
                scene.background = new THREE.Color(0x050508);
                break;
        }
    });

    // ---- Animation ----
    let animationId;
    let animationMixer = null;
    const clock = new THREE.Clock();

    function animate() {
        animationId = requestAnimationFrame(animate);

        const delta = clock.getDelta();

        controls.update();

        if (animationMixer) {
            animationMixer.update(delta);
        }

        renderer.render(scene, camera);
    }
    animate();

    // ---- Resize Handler ----
    const resizeObserver = new ResizeObserver(() => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    // ---- Initialize ----
    async function initialize() {
        try {
            if (modelUrl) {
                // Load real model with format hint
                const result = await loadModel(modelUrl, modelFormat);
                animationMixer = result.mixer;

                // Apply PBR textures if provided
                if (textures && Object.values(textures).some(v => v)) {
                    await applyPBRTextures(result.model, textures);
                }
            } else {
                // Fallback to procedural geometry
                const fallback = createFallbackObject(modelData);

                // Still apply textures if any were uploaded
                if (textures && Object.values(textures).some(v => v)) {
                    const wrapper = new THREE.Group();
                    wrapper.add(fallback);
                    scene.remove(fallback);
                    scene.add(wrapper);
                    loadedModel = wrapper;
                    await applyPBRTextures(wrapper, textures);
                    fitModelToView(wrapper);
                }
            }
        } catch (err) {
            console.error('Failed to load model:', err);
            if (!isThumbnail) {
                createFallbackObject(modelData);
            } else {
                // Show a simple error text in the middle of canvas
                const errorNode = document.createElement('div');
                errorNode.style.cssText = 'position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); color:rgba(255,255,255,0.3); font-size:10px; font-family:sans-serif; pointer-events:none;';
                errorNode.innerHTML = '⚠️ LOAD ERROR';
                container.appendChild(errorNode);
            }
        } finally {
            hideLoadingProgress();
        }
    }

    initialize();

    // ---- Public API ----
    return {
        scene,
        camera,
        renderer,
        controls,

        /**
         * Load a new model URL
         */
        async loadModelUrl(url) {
            try {
                updateLoadingProgress(0);
                progressBarContainer.style.opacity = '1';
                const result = await loadModel(url);
                animationMixer = result.mixer;
                hideLoadingProgress();
                return result;
            } catch (err) {
                hideLoadingProgress();
                throw err;
            }
        },

        /**
         * Apply PBR textures to the current model
         */
        async applyTextures(textureUrls) {
            if (loadedModel) {
                await applyPBRTextures(loadedModel, textureUrls);
            }
        },

        /**
         * Update environment exposure
         */
        setExposure(value) {
            renderer.toneMappingExposure = value;
        },

        /**
         * Dispose all resources
         */
        dispose() {
            cancelAnimationFrame(animationId);
            resizeObserver.disconnect();

            // Dispose materials
            loadedMaterials.forEach(m => m.dispose());

            // Dispose model
            if (loadedModel) {
                loadedModel.traverse((child) => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => m.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                });
            }

            // Dispose scene
            scene.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });

            if (envMap) envMap.dispose();
            controls.dispose();
            renderer.dispose();

            if (renderer.domElement.parentNode) {
                renderer.domElement.parentNode.removeChild(renderer.domElement);
            }
            if (toolbar.parentNode) {
                toolbar.parentNode.removeChild(toolbar);
            }
        },
    };
}
