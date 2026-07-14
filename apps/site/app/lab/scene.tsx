'use client';

import { Canvas } from '@react-three/fiber';
import { Float, MeshDistortMaterial } from '@react-three/drei';
import { Suspense } from 'react';

/**
 * Private test canvas — experiment with 3D on designesy.org.
 * Uses contract tokens (--signal blue) as the material color.
 * Respects prefers-reduced-motion via Float speed.
 */

function SignalOrb() {
  return (
    <Float speed={1.2} rotationIntensity={0.4} floatIntensity={1.5}>
      <mesh>
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

export default function Scene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 4.5], fov: 45 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true, alpha: true }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.3} />
        <pointLight position={[5, 5, 5]} intensity={1.2} color="#3358e8" />
        <pointLight position={[-5, -3, 2]} intensity={0.5} color="#ffffff" />
        <SignalOrb />
      </Suspense>
    </Canvas>
  );
}