"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface Hero3DCanvasProps {
  isCooled?: boolean;
}

export function Hero3DCanvas({ isCooled = false }: Hero3DCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const [hasWebGL, setHasWebGL] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    try {
      const width = container.clientWidth;
      const height = container.clientHeight;

      const scene = new THREE.Scene();
      sceneRef.current = scene;

      // Determine initial theme state
      const isDarkMode = () => document.documentElement.classList.contains("dark");
      const isDarkInitial = typeof document !== "undefined" ? isDarkMode() : true;

      // Atmospheric fog (adapts to light/dark background)
      const fog = new THREE.FogExp2(isDarkInitial ? 0x0B0C10 : 0xF8FAFC, 0.012);
      scene.fog = fog;

      const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 120);
      camera.position.set(0, 16, 20);
      camera.lookAt(0, 0, 0);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;
      rendererRef.current = renderer;
      container.appendChild(renderer.domElement);

      // Luminous multi-point lighting for clear 3D definition
      const ambientLight = new THREE.AmbientLight(0xffffff, isDarkInitial ? 0.75 : 0.85);
      scene.add(ambientLight);

      const hemiLight = new THREE.HemisphereLight(
        0xffffff, 
        isDarkInitial ? 0x1e293b : 0xe2e8f0, 
        isDarkInitial ? 0.5 : 0.65
      );
      scene.add(hemiLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 1.3);
      dirLight.position.set(8, 20, 10);
      dirLight.castShadow = true;
      scene.add(dirLight);

      const fillLight = new THREE.DirectionalLight(0x60A5FA, 0.45);
      fillLight.position.set(-6, 8, -4);
      scene.add(fillLight);

      // Ground plane (adapts to theme)
      const groundGeo = new THREE.PlaneGeometry(24, 24, 1, 1);
      const groundMat = new THREE.MeshStandardMaterial({
        color: isDarkInitial ? 0x0B0C10 : 0xF1F5F9,
        roughness: 0.95,
        metalness: 0.0,
      });
      const groundMesh = new THREE.Mesh(groundGeo, groundMat);
      groundMesh.rotation.x = -Math.PI / 2;
      groundMesh.position.y = -0.02;
      groundMesh.receiveShadow = true;
      scene.add(groundMesh);

      // Subtle grid helper (adapts to theme)
      const gridHelper = new THREE.GridHelper(
        20, 
        24, 
        isDarkInitial ? 0x222631 : 0xCBD5E1, 
        isDarkInitial ? 0x181B22 : 0xE2E8F0
      );
      gridHelper.position.y = -0.01;
      scene.add(gridHelper);

      // Dynamic theme sync function
      const applyThemeToScene = () => {
        const dark = isDarkMode();
        fog.color.setHex(dark ? 0x0B0C10 : 0xF8FAFC);
        groundMat.color.setHex(dark ? 0x0B0C10 : 0xF1F5F9);
        
        // Update grid colors
        const gridMat = gridHelper.material;
        if (Array.isArray(gridMat)) {
          (gridMat[0] as THREE.LineBasicMaterial).color.setHex(dark ? 0x222631 : 0xCBD5E1);
          (gridMat[1] as THREE.LineBasicMaterial).color.setHex(dark ? 0x181B22 : 0xE2E8F0);
        } else {
          (gridMat as THREE.LineBasicMaterial).color.setHex(dark ? 0x222631 : 0xCBD5E1);
        }

        hemiLight.groundColor.setHex(dark ? 0x1e293b : 0xe2e8f0);
        ambientLight.intensity = dark ? 0.75 : 0.85;
      };

      // Listen for custom theme events and DOM class mutations
      window.addEventListener("themeChanged", applyThemeToScene);
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.attributeName === "class") {
            applyThemeToScene();
          }
        }
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

      // Create varied urban morphology
      const group = new THREE.Group();
      scene.add(group);

      // Use seeded pseudo-random for consistent look
      const seeded = (i: number) => ((Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;

      const blocks: { mesh: THREE.Mesh; baseHeight: number; x: number; z: number; phase: number }[] = [];
      const gridSize = 18;
      const spacing = 0.72;

      // Color palettes
      const hotColors = [
        new THREE.Color(0xEF4444),
        new THREE.Color(0xF59E0B),
        new THREE.Color(0xEA580C),
        new THREE.Color(0xDC2626),
      ];
      const coolColors = [
        new THREE.Color(0x4A6CFF),
        new THREE.Color(0x3B55CC),
        new THREE.Color(0x10B981),
        new THREE.Color(0x2563EB),
      ];

      for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
          const seed = seeded(i * gridSize + j);
          const seed2 = seeded(i * gridSize + j + 500);
          const seed3 = seeded(i * gridSize + j + 1000);

          // Skip ~25% of cells for organic gaps (parks, plazas)
          if (seed < 0.22) continue;

          const x = (i - gridSize / 2) * spacing;
          const z = (j - gridSize / 2) * spacing;
          const dist = Math.sqrt(x * x + z * z);

          // Varied block widths (0.3–0.65)
          const blockW = 0.3 + seed2 * 0.35;
          const blockD = 0.3 + seed3 * 0.35;

          // City density profile: taller center, sparser edges
          const densityFalloff = Math.max(0, 1.0 - dist / 7.5);
          const baseHeight = Math.max(
            0.2,
            densityFalloff * (1.5 + seed * 3.5) + seed2 * 0.4
          );

          // Slight rotation for organic feel
          const rotY = (seed - 0.5) * 0.08;

          const boxGeo = new THREE.BoxGeometry(blockW, 1, blockD);
          const colorPalette = isCooled ? coolColors : hotColors;
          const colorIdx = Math.floor(seed * colorPalette.length);
          const baseColor = colorPalette[colorIdx].clone();

          // Vary brightness based on height and distance
          const brightnessVar = 0.85 + seed3 * 0.35;
          baseColor.multiplyScalar(brightnessVar);

          const mat = new THREE.MeshStandardMaterial({
            color: baseColor,
            emissive: baseColor,
            emissiveIntensity: 0.22,
            roughness: 0.35,
            metalness: 0.1,
            transparent: false,
            opacity: 1.0,
          });

          const mesh = new THREE.Mesh(boxGeo, mat);
          mesh.position.set(x, baseHeight / 2, z);
          mesh.scale.set(1, baseHeight, 1);
          mesh.rotation.y = rotY;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          group.add(mesh);

          blocks.push({ mesh, baseHeight, x, z, phase: seed * Math.PI * 2 });
        }
      }

      // Mouse interaction
      let mouseX = 0;
      let mouseY = 0;

      const handleMouseMove = (e: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        mouseX = ((e.clientX - rect.left) / width) * 2 - 1;
        mouseY = -(((e.clientY - rect.top) / height) * 2 - 1);
      };
      window.addEventListener("mousemove", handleMouseMove);

      let animId: number;
      const startTime = performance.now();

      const animate = () => {
        animId = requestAnimationFrame(animate);
        const elapsed = (performance.now() - startTime) / 1000;

        if (!prefersReducedMotion) {
          // Gentle camera orbit from mouse
          const targetRotY = mouseX * 0.15;
          const targetRotX = mouseY * 0.08;
          group.rotation.y += (targetRotY - group.rotation.y) * 0.03;
          group.rotation.x += (targetRotX - group.rotation.x) * 0.03;

          // Subtle breathing animation — much gentler than before
          for (const b of blocks) {
            const wave = Math.sin(elapsed * 0.8 + b.phase) * 0.08;
            const h = Math.max(0.15, b.baseHeight + wave);
            b.mesh.scale.y = h;
            b.mesh.position.y = h / 2;

            // Slow color interpolation toward target state
            const targetPalette = isCooled ? coolColors : hotColors;
            const ci = Math.floor(((b.phase / (Math.PI * 2)) * targetPalette.length) % targetPalette.length);
            const targetColor = targetPalette[ci];
            const meshMat = b.mesh.material as THREE.MeshStandardMaterial;
            meshMat.color.lerp(targetColor, 0.02);
            meshMat.emissive.lerp(targetColor, 0.02);
          }
        }

        renderer.render(scene, camera);
      };

      animate();

      const handleResize = () => {
        if (!container) return;
        const newW = container.clientWidth;
        const newH = container.clientHeight;
        camera.aspect = newW / newH;
        camera.updateProjectionMatrix();
        renderer.setSize(newW, newH);
      };
      window.addEventListener("resize", handleResize);

      return () => {
        cancelAnimationFrame(animId);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("resize", handleResize);
        window.removeEventListener("themeChanged", applyThemeToScene);
        observer.disconnect();
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        renderer.dispose();
      };
    } catch (err) {
      console.warn("WebGL initialization failed:", err);
      setHasWebGL(false);
    }
  }, [isCooled]);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[420px] relative select-none">
      {!hasWebGL && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-elevated text-ink-muted text-xs font-mono">
          WebGL not available
        </div>
      )}
    </div>
  );
}
