/**
 * Free3D Hub - Three.js Preview Renderer
 * 
 * Creates interactive 3D previews for model cards using procedural geometry 
 * as placeholders. In production, these would load actual GLTF/FBX models.
 */

import * as THREE from 'three';

// Color palette for materials
const MATERIAL_CONFIGS = {
    standard: (color, secondaryColor) => {
        const mat = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(color),
            metalness: 0.3,
            roughness: 0.4,
            clearcoat: 0.3,
            clearcoatRoughness: 0.25,
        });
        return mat;
    },
    emissive: (color, secondaryColor) => {
        return new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(color),
            emissive: new THREE.Color(secondaryColor),
            emissiveIntensity: 0.3,
            metalness: 0.5,
            roughness: 0.2,
            clearcoat: 0.5,
        });
    },
    glass: (color) => {
        return new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(color),
            metalness: 0.1,
            roughness: 0.05,
            transmission: 0.6,
            thickness: 1.5,
            clearcoat: 1,
        });
    }
};

// Map geometry types to Three.js geometry constructors
function createGeometry(type) {
    switch (type) {
        case 'box':
            return new THREE.BoxGeometry(1.4, 1.4, 1.4, 2, 2, 2);
        case 'sphere':
            return new THREE.SphereGeometry(1, 32, 32);
        case 'cylinder':
            return new THREE.CylinderGeometry(0.6, 0.8, 1.8, 32);
        case 'torus':
            return new THREE.TorusGeometry(0.8, 0.35, 16, 48);
        case 'torusKnot':
            return new THREE.TorusKnotGeometry(0.7, 0.25, 100, 16);
        case 'icosahedron':
            return new THREE.IcosahedronGeometry(1, 0);
        case 'octahedron':
            return new THREE.OctahedronGeometry(1, 0);
        case 'dodecahedron':
            return new THREE.DodecahedronGeometry(1, 0);
        case 'cone':
            return new THREE.ConeGeometry(0.8, 1.8, 6);
        case 'capsule':
            return new THREE.CapsuleGeometry(0.4, 1.2, 8, 16);
        default:
            return new THREE.BoxGeometry(1.4, 1.4, 1.4);
    }
}

/**
 * Create a mini Three.js scene in a container element
 */
export function createPreviewScene(container, modelData) {
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = null; // transparent

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(2.5, 1.8, 2.5);
    camera.lookAt(0, 0, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'low-power',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404060, 0.8);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.5);
    mainLight.position.set(3, 4, 2);
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(
        new THREE.Color(modelData.secondaryColor || '#00cec9'),
        0.6
    );
    fillLight.position.set(-2, 1, -3);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(
        new THREE.Color(modelData.color || '#6c5ce7'),
        1,
        10
    );
    rimLight.position.set(-1, 2, -2);
    scene.add(rimLight);

    // Main object
    const geometry = createGeometry(modelData.geometryType);

    const materialType = ['torusKnot', 'dodecahedron'].includes(modelData.geometryType)
        ? 'emissive'
        : ['cylinder', 'capsule'].includes(modelData.geometryType)
            ? 'glass'
            : 'standard';

    const material = MATERIAL_CONFIGS[materialType](modelData.color, modelData.secondaryColor);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Ground plane (subtle reflection)
    const groundGeo = new THREE.CircleGeometry(2, 32);
    const groundMat = new THREE.MeshPhysicalMaterial({
        color: 0x111118,
        metalness: 0.8,
        roughness: 0.3,
        transparent: true,
        opacity: 0.5,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    scene.add(ground);

    // Wireframe companion
    const wireGeo = createGeometry(modelData.geometryType);
    const wireMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(modelData.secondaryColor || '#00cec9'),
        wireframe: true,
        transparent: true,
        opacity: 0.08,
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    wireMesh.scale.set(1.15, 1.15, 1.15);
    scene.add(wireMesh);

    // Floating particles
    const particleCount = 30;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 4;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 3;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
        color: new THREE.Color(modelData.color),
        size: 0.03,
        transparent: true,
        opacity: 0.6,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Animation state
    let animationId;
    let time = Math.random() * 100; // Random start offset
    let isHovered = false;
    let mouseX = 0;
    let mouseY = 0;
    let targetRotationX = 0;
    let targetRotationY = 0;

    // Mouse interaction
    const onMouseMove = (e) => {
        const rect = container.getBoundingClientRect();
        mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        mouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };

    const onMouseEnter = () => { isHovered = true; };
    const onMouseLeave = () => {
        isHovered = false;
        mouseX = 0;
        mouseY = 0;
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseenter', onMouseEnter);
    container.addEventListener('mouseleave', onMouseLeave);

    // Render loop
    function animate() {
        animationId = requestAnimationFrame(animate);
        time += 0.01;

        // Auto-rotate
        const baseRotationSpeed = isHovered ? 0.002 : 0.005;
        mesh.rotation.y += baseRotationSpeed;
        wireMesh.rotation.y = mesh.rotation.y;

        // Mouse-follow rotation
        if (isHovered) {
            targetRotationX = mouseY * 0.3;
            targetRotationY = mouseX * 0.5;
        } else {
            targetRotationX = Math.sin(time) * 0.1;
            targetRotationY = 0;
        }

        mesh.rotation.x += (targetRotationX - mesh.rotation.x) * 0.05;
        wireMesh.rotation.x = mesh.rotation.x;

        // Floating motion
        mesh.position.y = Math.sin(time * 0.8) * 0.1;
        wireMesh.position.y = mesh.position.y;

        // Particles float
        particles.rotation.y += 0.001;
        particles.rotation.x = Math.sin(time * 0.3) * 0.05;

        renderer.render(scene, camera);
    }
    animate();

    // Cleanup function
    return {
        dispose: () => {
            cancelAnimationFrame(animationId);
            container.removeEventListener('mousemove', onMouseMove);
            container.removeEventListener('mouseenter', onMouseEnter);
            container.removeEventListener('mouseleave', onMouseLeave);

            geometry.dispose();
            material.dispose();
            wireGeo.dispose();
            wireMat.dispose();
            groundGeo.dispose();
            groundMat.dispose();
            particleGeo.dispose();
            particleMat.dispose();
            renderer.dispose();

            if (renderer.domElement.parentNode) {
                renderer.domElement.parentNode.removeChild(renderer.domElement);
            }
        },
        resize: () => {
            const w = container.clientWidth;
            const h = container.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        }
    };
}

/**
 * Create a larger detailed preview scene for the modal
 */
export function createDetailScene(container, modelData) {
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);

    // Environment map approximation
    scene.fog = new THREE.FogExp2(0x0a0a0f, 0.08);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(3, 2.2, 3);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Lights with shadows
    const ambientLight = new THREE.AmbientLight(0x303050, 0.6);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 2);
    mainLight.position.set(5, 6, 3);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(
        new THREE.Color(modelData.secondaryColor),
        0.8
    );
    fillLight.position.set(-3, 2, -4);
    scene.add(fillLight);

    const backLight = new THREE.PointLight(
        new THREE.Color(modelData.color),
        1.5,
        10
    );
    backLight.position.set(-2, 3, -3);
    scene.add(backLight);

    // Main object (larger)
    const geometry = createGeometry(modelData.geometryType);
    const material = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(modelData.color),
        metalness: 0.4,
        roughness: 0.3,
        clearcoat: 0.5,
        clearcoatRoughness: 0.2,
        emissive: new THREE.Color(modelData.secondaryColor),
        emissiveIntensity: 0.1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.scale.set(1.3, 1.3, 1.3);
    scene.add(mesh);

    // Wireframe
    const wireGeo = createGeometry(modelData.geometryType);
    const wireMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(modelData.secondaryColor),
        wireframe: true,
        transparent: true,
        opacity: 0.06,
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    wireMesh.scale.set(1.5, 1.5, 1.5);
    scene.add(wireMesh);

    // Ground
    const groundGeo = new THREE.PlaneGeometry(20, 20);
    const groundMat = new THREE.MeshStandardMaterial({
        color: 0x0a0a0f,
        metalness: 0.9,
        roughness: 0.2,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.3;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid
    const gridHelper = new THREE.GridHelper(10, 20, 0x1a1a2e, 0x1a1a2e);
    gridHelper.position.y = -1.29;
    scene.add(gridHelper);

    // Particles
    const particleCount = 80;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 8;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 5;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 8;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
        color: new THREE.Color(modelData.color),
        size: 0.04,
        transparent: true,
        opacity: 0.5,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Mouse orbit
    let isDragging = false;
    let previousMouseX = 0;
    let previousMouseY = 0;
    let cameraAngle = Math.PI / 4;
    let cameraElevation = 0.5;
    let cameraDistance = 4.2;

    const onPointerDown = (e) => {
        isDragging = true;
        previousMouseX = e.clientX;
        previousMouseY = e.clientY;
    };

    const onPointerMove = (e) => {
        if (!isDragging) return;
        const deltaX = e.clientX - previousMouseX;
        const deltaY = e.clientY - previousMouseY;
        cameraAngle -= deltaX * 0.005;
        cameraElevation = Math.max(-1, Math.min(1.5, cameraElevation + deltaY * 0.005));
        previousMouseX = e.clientX;
        previousMouseY = e.clientY;
    };

    const onPointerUp = () => { isDragging = false; };

    const onWheel = (e) => {
        cameraDistance = Math.max(2, Math.min(8, cameraDistance + e.deltaY * 0.005));
        e.preventDefault();
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('wheel', onWheel, { passive: false });

    let animationId;
    let time = 0;

    function animate() {
        animationId = requestAnimationFrame(animate);
        time += 0.01;

        // Camera orbit
        if (!isDragging) {
            cameraAngle += 0.003;
        }
        camera.position.x = Math.cos(cameraAngle) * cameraDistance;
        camera.position.z = Math.sin(cameraAngle) * cameraDistance;
        camera.position.y = 1.5 + cameraElevation;
        camera.lookAt(0, 0, 0);

        // Object animation
        mesh.rotation.y += 0.003;
        mesh.position.y = Math.sin(time * 0.8) * 0.12;
        wireMesh.rotation.y = mesh.rotation.y;
        wireMesh.position.y = mesh.position.y;

        particles.rotation.y += 0.0008;

        renderer.render(scene, camera);
    }
    animate();

    return {
        dispose: () => {
            cancelAnimationFrame(animationId);
            container.removeEventListener('pointerdown', onPointerDown);
            container.removeEventListener('pointermove', onPointerMove);
            container.removeEventListener('pointerup', onPointerUp);
            container.removeEventListener('wheel', onWheel);

            geometry.dispose();
            material.dispose();
            wireGeo.dispose();
            wireMat.dispose();
            groundGeo.dispose();
            groundMat.dispose();
            particleGeo.dispose();
            particleMat.dispose();
            renderer.dispose();

            if (renderer.domElement.parentNode) {
                renderer.domElement.parentNode.removeChild(renderer.domElement);
            }
        }
    };
}

/**
 * Create the hero background scene
 */
export function createHeroScene(canvas) {
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 5);

    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Create floating geometric shapes
    const shapes = [];
    const geometries = [
        new THREE.IcosahedronGeometry(0.4, 0),
        new THREE.OctahedronGeometry(0.35, 0),
        new THREE.TetrahedronGeometry(0.35, 0),
        new THREE.TorusKnotGeometry(0.25, 0.08, 50, 8),
        new THREE.DodecahedronGeometry(0.3, 0),
    ];

    const colors = [0x6c5ce7, 0x00cec9, 0xfd79a8, 0xa29bfe, 0x00b894, 0xfdcb6e, 0xe17055];

    for (let i = 0; i < 20; i++) {
        const geo = geometries[i % geometries.length];
        const color = colors[i % colors.length];

        const mat = new THREE.MeshPhysicalMaterial({
            color,
            metalness: 0.3,
            roughness: 0.4,
            transparent: true,
            opacity: 0.15 + Math.random() * 0.15,
            wireframe: Math.random() > 0.5,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(
            (Math.random() - 0.5) * 12,
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 6 - 2
        );
        mesh.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
        );

        const scale = 0.5 + Math.random() * 1.5;
        mesh.scale.set(scale, scale, scale);

        scene.add(mesh);
        shapes.push({
            mesh,
            rotSpeed: {
                x: (Math.random() - 0.5) * 0.01,
                y: (Math.random() - 0.5) * 0.01,
                z: (Math.random() - 0.5) * 0.005,
            },
            floatSpeed: 0.3 + Math.random() * 0.5,
            floatOffset: Math.random() * Math.PI * 2,
            initialY: mesh.position.y,
        });
    }

    // Ambient light
    scene.add(new THREE.AmbientLight(0x303050, 0.8));

    const pointLight1 = new THREE.PointLight(0x6c5ce7, 2, 20);
    pointLight1.position.set(3, 3, 3);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x00cec9, 1.5, 20);
    pointLight2.position.set(-4, -2, 2);
    scene.add(pointLight2);

    let animationId;
    let time = 0;

    // Mouse parallax
    let mouseX = 0;
    let mouseY = 0;

    window.addEventListener('mousemove', (e) => {
        mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
        mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    function animate() {
        animationId = requestAnimationFrame(animate);
        time += 0.01;

        shapes.forEach((shape) => {
            shape.mesh.rotation.x += shape.rotSpeed.x;
            shape.mesh.rotation.y += shape.rotSpeed.y;
            shape.mesh.rotation.z += shape.rotSpeed.z;
            shape.mesh.position.y = shape.initialY + Math.sin(time * shape.floatSpeed + shape.floatOffset) * 0.3;
        });

        // Camera parallax
        camera.position.x += (mouseX * 0.5 - camera.position.x) * 0.02;
        camera.position.y += (-mouseY * 0.3 - camera.position.y) * 0.02;
        camera.lookAt(0, 0, 0);

        renderer.render(scene, camera);
    }
    animate();

    // Handle resize
    const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    return {
        dispose: () => {
            cancelAnimationFrame(animationId);
            window.removeEventListener('resize', onResize);
            shapes.forEach(s => {
                s.mesh.geometry.dispose();
                s.mesh.material.dispose();
            });
            renderer.dispose();
        }
    };
}
