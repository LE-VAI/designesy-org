'use client';

import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Sparkles } from '@react-three/drei';
import { Suspense, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';

/* ---------- Firework burst ---------- */

type Burst = {
  id: number;
  position: [number, number, number];
  count: number;
};

function FireworkBurst({
  position,
  count,
  onComplete,
}: {
  position: [number, number, number];
  count: number;
  onComplete: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const startTime = useRef(performance.now());
  const duration = 1200;

  const particles = useMemo(() => {
    return Array.from({ length: count }, () => {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 2 + Math.random() * 3;
      return {
        velocity: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.sin(phi) * Math.sin(theta) * speed,
          Math.cos(phi) * speed * 0.3,
        ),
        size: 0.02 + Math.random() * 0.05,
      };
    });
  }, [count]);

  useFrame(() => {
    if (!groupRef.current) return;
    const elapsed = (performance.now() - startTime.current) / 1000;
    const progress = elapsed / (duration / 1000);

    if (progress >= 1) {
      onComplete();
      return;
    }

    groupRef.current.children.forEach((child, i) => {
      const p = particles[i];
      if (!p) return;
      const decay = 1 - progress;
      child.position.set(
        p.velocity.x * elapsed * decay,
        p.velocity.y * elapsed * decay - progress * progress * 2,
        p.velocity.z * elapsed * decay,
      );
      child.scale.setScalar(decay);
    });
  });

  return (
    <group ref={groupRef} position={position}>
      {particles.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial
            color={i % 3 === 0 ? '#3358e8' : '#0133cb'}
            transparent
            opacity={0.9}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ---------- Shockwave ring ---------- */

function Shockwave({
  position,
  onComplete,
}: {
  position: [number, number, number];
  onComplete: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const startTime = useRef(performance.now());
  const duration = 800;

  useFrame(() => {
    if (!meshRef.current) return;
    const elapsed = (performance.now() - startTime.current) / 1000;
    const progress = elapsed / (duration / 1000);

    if (progress >= 1) {
      onComplete();
      return;
    }

    const scale = 0.3 + progress * 4;
    meshRef.current.scale.set(scale, scale, 1);
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = (1 - progress) * 0.6;
  });

  return (
    <mesh ref={meshRef} position={position} rotation={[0, 0, 0]}>
      <ringGeometry args={[0.85, 1, 48]} />
      <meshBasicMaterial
        color="#3358e8"
        transparent
        opacity={0.6}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

/* ---------- Main orb ---------- */

function SignalOrb({ pulseCount }: { pulseCount: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const pulseStart = useRef(0);
  const lastPulse = useRef(0);

  useFrame(() => {
    if (!meshRef.current) return;

    if (pulseCount !== lastPulse.current) {
      lastPulse.current = pulseCount;
      pulseStart.current = performance.now();
    }

    if (pulseStart.current > 0) {
      const elapsed = (performance.now() - pulseStart.current) / 1000;
      const p = elapsed / 0.6;
      if (p >= 1) {
        pulseStart.current = 0;
        meshRef.current.scale.setScalar(1);
      } else {
        const expansion = Math.sin(p * Math.PI) * 0.25;
        meshRef.current.scale.setScalar(1 + expansion);
      }
    }
  });

  return (
    <Float speed={1.2} rotationIntensity={0.4} floatIntensity={1.5}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[1.4, 64, 64]} />
        <MeshDistortMaterial
          color="#0133cb"
          emissive="#0133cb"
          emissiveIntensity={0.15}
          roughness={0.15}
          metalness={0.85}
          distort={0.25}
          speed={1.5}
        />
      </mesh>
    </Float>
  );
}

/* ---------- Scene ---------- */

function SceneContent() {
  const { camera, raycaster } = useThree();
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [shockwaves, setShockwaves] = useState<Burst[]>([]);
  const [orbPulse, setOrbPulse] = useState(0);
  const burstId = useRef(0);

  const handlePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.nativeEvent.preventDefault();
      const x = (event.nativeEvent.offsetX / (event.nativeEvent.target as HTMLElement).clientWidth) * 2 - 1;
      const y = -(event.nativeEvent.offsetY / (event.nativeEvent.target as HTMLElement).clientHeight) * 2 + 1;

      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const target = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, target);

      if (!target) return;

      const id = burstId.current++;
      setBursts((prev) => [...prev, { id, position: [target.x, target.y, 0], count: 40 }]);
      setShockwaves((prev) => [...prev, { id, position: [target.x, target.y, 0.1], count: 0 }]);
      setOrbPulse((p) => p + 1);
    },
    [camera, raycaster],
  );

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[5, 5, 5]} intensity={1.2} color="#3358e8" />
      <pointLight position={[-5, -3, 2]} intensity={0.5} color="#ffffff" />

      <group onPointerDown={handlePointerDown}>
        <SignalOrb pulseCount={orbPulse} />
      </group>

      <Sparkles count={30} scale={6} size={2} speed={0.3} color="#3358e8" opacity={0.4} />

      {bursts.map((burst) => (
        <FireworkBurst
          key={burst.id}
          position={burst.position}
          count={burst.count}
          onComplete={() => setBursts((prev) => prev.filter((b) => b.id !== burst.id))}
        />
      ))}

      {shockwaves.map((sw) => (
        <Shockwave
          key={sw.id}
          position={sw.position}
          onComplete={() => setShockwaves((prev) => prev.filter((s) => s.id !== sw.id))}
        />
      ))}
    </>
  );
}

export default function Scene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 4.5], fov: 45 }}
      style={{ width: '100%', height: '100%', cursor: 'crosshair' }}
      gl={{ antialias: true, alpha: true }}
      onPointerMissed={() => {}}
    >
      <Suspense fallback={null}>
        <SceneContent />
      </Suspense>
    </Canvas>
  );
}