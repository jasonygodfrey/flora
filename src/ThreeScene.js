import React, { useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';

const ThreeScene = () => {
  useEffect(() => {
    let scene, camera, renderer, controls, composer, bloomPass;
    let video, texture, particles, analyser, audioCtx, audio, audioSource;
    const particleCount = 1480 * 1480;
    const luminanceThreshold = 0.1;
    let bassStrength = 0;

    const container = document.getElementById('three-container');

    // Initialize scene
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 10000);
    camera.position.set(0, 0, 1200);

    // Video texture setup
    video = document.getElementById('video');
    texture = new THREE.VideoTexture(video);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    video.play();

    // Renderer setup
    renderer = new THREE.WebGLRenderer();
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // Orbit Controls setup
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.maxDistance = 3000;
    controls.minDistance = 200;

    // Audio setup
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audio = document.getElementById('audio');
    audioSource = audioCtx.createMediaElementSource(audio);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    audioSource.connect(analyser);
    analyser.connect(audioCtx.destination);
    audio.play();

    // Create Particle System
    const videoWidth = 480;
    const videoHeight = 480;
    const width = 240 * (videoWidth / videoHeight);
    const height = 240;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const uvs = new Float32Array(particleCount * 2);

    let index = 0;
    for (let i = 0; i < 480; i++) {
      for (let j = 0; j < 480; j++) {
        positions[index * 3] = (i - 240) * (width / 240);
        positions[index * 3 + 1] = (j - 240) * (height / 240);
        positions[index * 3 + 2] = 0;

        uvs[index * 2] = i / 480;
        uvs[index * 2 + 1] = j / 480;

        index++;
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        'map': { value: texture },
        'size': { value: 0.5 },
        'bassStrength': { value: 0.0 }
      },
      vertexShader: `
        uniform sampler2D map;
        uniform float size;
        uniform float bassStrength;
        varying vec2 vUv;
        varying vec4 vColor;
        void main() {
          vUv = uv;
          vec4 color = texture2D(map, uv);
          vColor = color;
          float luminance = (color.r + color.g + color.b) / 3.0;
          float displacement = luminance > ${luminanceThreshold} ? luminance * (100.0 + bassStrength * 200.0) : 0.0;
          gl_PointSize = size * (luminance * 6.0 + 3.0);
          vec3 displacedPosition = position + vec3(0.0, 0.0, displacement);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec4 vColor;
        void main() {
          gl_FragColor = vColor;
        }
      `,
      transparent: true
    });

    particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Post-processing for bloom effect
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    
    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.1;
    bloomPass.strength = 1.2;
    bloomPass.radius = 0.4;
    composer.addPass(bloomPass);

    // Resize listener
    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onWindowResize);

    const detectBass = () => {
      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(frequencyData);
      let bassTotal = 0;
      const bassRange = 3;
      for (let i = 0; i < bassRange; i++) {
        bassTotal += frequencyData[i];
      }
      bassStrength = bassTotal / bassRange / 155;
    };

    const animate = () => {
      requestAnimationFrame(animate);
      if (particles) {
        controls.update();
        detectBass();
        particles.material.uniforms.bassStrength.value = bassStrength;
        composer.render();
      }
    };
    animate();

    // Device Orientation Event with Permission Handling
    const requestOrientationPermission = async () => {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const response = await DeviceOrientationEvent.requestPermission();
          if (response === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation, true);
          }
        } catch (error) {
          console.error('Permission request for device orientation failed', error);
        }
      } else {
        // Fallback for browsers that do not require permission
        window.addEventListener('deviceorientation', handleOrientation, true);
      }
    };

    const handleOrientation = (event) => {
      const { alpha, beta, gamma } = event; // alpha (Z), beta (X), gamma (Y)
      if (alpha !== null && beta !== null && gamma !== null) {
        const radAlpha = THREE.MathUtils.degToRad(alpha);
        const radBeta = THREE.MathUtils.degToRad(beta - 90);
        const radGamma = THREE.MathUtils.degToRad(gamma);

        camera.rotation.set(radBeta, radGamma, radAlpha);
      }
    };

    // Request permission and add listener
    requestOrientationPermission();

    return () => {
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('deviceorientation', handleOrientation);
      container.removeChild(renderer.domElement);
      audioCtx.close();
    };
  }, []);

  return (
    <div>
      <video id="video" loop muted crossOrigin="anonymous" playsInline style={{ display: 'none' }} autoPlay>
        <source src="movie.mp4" type="video/mp4" />
      </video>
      <audio id="audio" controls loop style={{ display: 'none' }} autoPlay>
        <source src="audio.mp3" type="audio/mp3" />
      </audio>
      <div id="three-container" />
    </div>
  );
};

export default ThreeScene;
