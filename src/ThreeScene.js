// ThreeScene.js

import React, { useEffect } from 'react';
import * as THREE from 'three';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const ThreeScene = () => {
  useEffect(() => {
    let scene, camera, renderer, controls, composer, bloomPass;
    let video, texture, particles, analyser, audioCtx, audio, audioSource;
    const particleCount = 480 * 480;
    const luminanceThreshold = 0.1;
    let bassStrength = 0;

    const container = document.getElementById('three-container');

    // Initialize scene
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      1,
      10000
    );
    camera.position.set(0, 0, 1200);

    // Video texture setup
    video = document.getElementById('video');
    texture = new THREE.VideoTexture(video);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    video.play();

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // Orbit Controls setup (used as fallback)
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
        map: { value: texture },
        size: { value: 0.5 },
        bassStrength: { value: 0.0 },
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
      transparent: true,
    });

    particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Post-processing for bloom effect
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.5,
      0.4,
      0.85
    );
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

    // Device Orientation Variables
    let deviceOrientation = null;

    const animate = () => {
      requestAnimationFrame(animate);
      if (particles) {
        detectBass();
        particles.material.uniforms.bassStrength.value = bassStrength;

        // Update camera rotation based on device orientation
        if (deviceOrientation) {
          const { alpha, beta, gamma } = deviceOrientation;

          // Convert degrees to radians
          const alphaRad = THREE.MathUtils.degToRad(alpha || 0);
          const betaRad = THREE.MathUtils.degToRad(beta || 0);
          const gammaRad = THREE.MathUtils.degToRad(gamma || 0);

          // Create quaternion from Euler angles
          const euler = new THREE.Euler();
          euler.set(betaRad, alphaRad, -gammaRad, 'YXZ'); // Adjust axes as needed
          camera.quaternion.setFromEuler(euler);
        } else {
          // Fallback to OrbitControls if device orientation is not available
          controls.update();
        }

        composer.render();
      }
    };
    animate();

    // Function to request permission and enable device orientation
    const requestOrientationPermission = async () => {
      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function'
      ) {
        // iOS 13+ devices
        try {
          const response = await DeviceOrientationEvent.requestPermission();
          if (response === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation, true);
            controls.enabled = false; // Disable OrbitControls
          } else {
            alert('Device orientation permission denied');
          }
        } catch (error) {
          console.error('Error requesting device orientation permission:', error);
        }
      } else {
        // Non-iOS devices or older versions
        window.addEventListener('deviceorientation', handleOrientation, true);
        controls.enabled = false; // Disable OrbitControls
      }
    };

    const handleOrientation = (event) => {
      deviceOrientation = {
        alpha: event.alpha,
        beta: event.beta,
        gamma: event.gamma,
      };
    };

    // Add event listener to the button
    const button = document.getElementById('enable-gyroscope');
    button.addEventListener('click', requestOrientationPermission);

    // Clean up
    return () => {
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('deviceorientation', handleOrientation);
      if (controls) controls.dispose();
      container.removeChild(renderer.domElement);
      audioCtx.close();
      button.removeEventListener('click', requestOrientationPermission);
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      {/* Three.js container */}
      <div
        id="three-container"
        style={{
          width: '100%',
          height: '100%',
        }}
      />

      {/* Enable Gyroscope Button */}
      <button
        id="enable-gyroscope"
        style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          zIndex: 10,
          padding: '10px 20px',
          fontSize: '16px',
        }}
      >
        Enable Gyroscope
      </button>

      {/* Hidden video and audio elements */}
      <video
        id="video"
        loop
        muted
        crossOrigin="anonymous"
        playsInline
        style={{ display: 'none' }}
        autoPlay
      >
        <source src="movie.mp4" type="video/mp4" />
      </video>
      <audio
        id="audio"
        controls
        loop
        style={{ display: 'none' }}
        autoPlay
      >
        <source src="audio.mp3" type="audio/mp3" />
      </audio>
    </div>
  );
};

export default ThreeScene;
