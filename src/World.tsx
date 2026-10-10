import { Suspense, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, ContactShadows } from "@react-three/drei";
import {
  Physics,
  RigidBody,
  CuboidCollider,
  CylinderCollider,
  BallCollider,
  type RapierRigidBody,
} from "@react-three/rapier";
import * as THREE from "three";
import type { SceneObject, V3 } from "./schema";
import {
  Controller,
  forward,
  inverse,
  shoulder,
  objectPosition,
} from "./robotics";
function Link({
  a,
  b,
  r = 0.06,
  color = "#dce2e3",
  ghost = false,
}: {
  a: V3;
  b: V3;
  r?: number;
  color?: string;
  ghost?: boolean;
}) {
  const direction = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),
    q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    );
  return (
    <mesh
      position={new THREE.Vector3(...a)
        .add(new THREE.Vector3(...b))
        .multiplyScalar(0.5)}
      quaternion={q}
      castShadow
    >
      <cylinderGeometry args={[r * 0.85, r, direction.length(), 12]} />
      <meshStandardMaterial
        color={color}
        metalness={0.5}
        roughness={0.35}
        transparent={ghost}
        opacity={ghost ? 0.2 : 1}
        depthWrite={!ghost}
      />
    </mesh>
  );
}
function Joint({
  p,
  r = 0.073,
  color = "#333e45",
  ghost = false,
}: {
  p: V3;
  r?: number;
  color?: string;
  ghost?: boolean;
}) {
  return (
    <mesh position={p} castShadow>
      <sphereGeometry args={[r, 16, 16]} />
      <meshStandardMaterial
        color={color}
        metalness={0.7}
        roughness={0.25}
        transparent={ghost}
        opacity={ghost ? 0.25 : 1}
      />
    </mesh>
  );
}
function Robot({ c }: { c: Controller }) {
  const ref = useRef<THREE.Group>(null);
  const dummy = useRef(0);
  useFrame(() => {
    dummy.current++;
  });
  return (
    <group ref={ref}>
      <mesh position={[0, 1.17, 0.58]} castShadow>
        <boxGeometry args={[0.46, 0.48, 0.24]} />
        <meshStandardMaterial
          color="#d6dedc"
          metalness={0.55}
          roughness={0.28}
        />
      </mesh>
      <mesh position={[0, 1.28, 0.445]}>
        <boxGeometry args={[0.24, 0.065, 0.025]} />
        <meshStandardMaterial
          color="#b9f77b"
          emissive="#b9f77b"
          emissiveIntensity={0.6}
        />
      </mesh>
      <Joint p={[0, 1.48, 0.58]} r={0.095} />
      <mesh position={[0, 1.66, 0.56]} castShadow>
        <boxGeometry args={[0.27, 0.26, 0.23]} />
        <meshStandardMaterial
          color="#d6dedc"
          metalness={0.6}
          roughness={0.25}
        />
      </mesh>
      <mesh position={[0, 1.69, 0.438]}>
        <boxGeometry args={[0.22, 0.062, 0.022]} />
        <meshStandardMaterial color="#0a141a" />
      </mesh>
      <mesh position={[0, 1.69, 0.424]}>
        <boxGeometry args={[0.12, 0.011, 0.006]} />
        <meshStandardMaterial
          color="#b4f477"
          emissive="#b4f477"
          emissiveIntensity={2}
        />
      </mesh>
      <mesh position={[0, 0.85, 0.58]}>
        <boxGeometry args={[0.34, 0.19, 0.23]} />
        <meshStandardMaterial color="#37444b" metalness={0.6} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <Link
            a={[s * 0.13, 0.84, 0.58]}
            b={[s * 0.16, 0.46, 0.59]}
            r={0.095}
          />
          <Joint p={[s * 0.16, 0.46, 0.59]} r={0.09} />
          <Link
            a={[s * 0.16, 0.46, 0.59]}
            b={[s * 0.17, 0.12, 0.56]}
            r={0.075}
          />
          <mesh position={[s * 0.17, 0.065, 0.49]} castShadow>
            <boxGeometry args={[0.19, 0.12, 0.32]} />
            <meshStandardMaterial color="#b6c1c1" metalness={0.4} />
          </mesh>
        </group>
      ))}
      {c.arms.map((a) => (
        <ArmView key={a.side} c={c} side={a.side} />
      ))}
    </group>
  );
}
function ArmView({ c, side }: { c: Controller; side: number }) {
  const group = useRef<THREE.Group>(null);
  const actualUpper = useRef<THREE.Mesh>(null),
    actualLower = useRef<THREE.Mesh>(null),
    ghostUpper = useRef<THREE.Mesh>(null),
    ghostLower = useRef<THREE.Mesh>(null),
    elbow = useRef<THREE.Mesh>(null),
    wrist = useRef<THREE.Group>(null),
    marker = useRef<THREE.Mesh>(null),
    f1 = useRef<THREE.Mesh>(null),
    f2 = useRef<THREE.Mesh>(null);
  const s = shoulder(side);
  const update = (mesh: THREE.Mesh | null, a: V3, b: V3) => {
    if (!mesh) return;
    const delta = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
    mesh.position.copy(
      new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(0.5),
    );
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.clone().normalize(),
    );
    mesh.scale.set(1, delta.length(), 1);
  };
  useFrame(() => {
    const a = c.arms.find((a) => a.side === side)!;
    update(actualUpper.current, s, a.elbow);
    update(actualLower.current, a.elbow, a.end);
    elbow.current?.position.set(...a.elbow);
    wrist.current?.position.set(...a.end);
    if (f1.current && f2.current) {
      f1.current.position.x = a.closed ? -0.028 : -0.068;
      f2.current.position.x = a.closed ? 0.028 : 0.068;
    }
    const ghost = forward(inverse(a.target, s).joints, s);
    update(ghostUpper.current, s, ghost.elbow);
    update(ghostLower.current, ghost.elbow, ghost.end);
    marker.current?.position.set(...a.target);
    const color = a.status === "ACCEPTED" ? "#b4f277" : "#ff775f";
    for (const mesh of [ghostUpper.current, ghostLower.current, marker.current])
      if (mesh) (mesh.material as THREE.MeshStandardMaterial).color.set(color);
  });
  return (
    <group ref={group}>
      <Joint p={s} />
      {[actualUpper, actualLower].map((ref, i) => (
        <mesh key={i} ref={ref} castShadow>
          <cylinderGeometry args={[0.05, 0.062, 1, 14]} />
          <meshStandardMaterial
            color="#c8d4d3"
            metalness={0.5}
            roughness={0.3}
          />
        </mesh>
      ))}
      <mesh ref={elbow}>
        <sphereGeometry args={[0.071, 16, 16]} />
        <meshStandardMaterial color="#35454b" />
      </mesh>
      <group ref={wrist}>
        <Joint p={[0, 0, 0]} r={0.05} />
        {[f1, f2].map((ref, i) => (
          <mesh key={i} ref={ref} position={[0, -0.04, 0]}>
            <boxGeometry args={[0.022, 0.1, 0.06]} />
            <meshStandardMaterial color="#b4f277" metalness={0.4} />
          </mesh>
        ))}
      </group>
      {[ghostUpper, ghostLower].map((ref, i) => (
        <mesh ref={ref} key={i}>
          <cylinderGeometry args={[0.07, 0.07, 1, 10]} />
          <meshStandardMaterial transparent opacity={0.13} depthWrite={false} />
        </mesh>
      ))}
      <mesh ref={marker}>
        <sphereGeometry args={[0.025, 12, 12]} />
        <meshStandardMaterial wireframe transparent opacity={0.8} />
      </mesh>
    </group>
  );
}
function ObjectBody({
  object: o,
  c,
  selected,
  onSelect,
}: {
  object: SceneObject;
  c: Controller;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const ref = useRef<RapierRigidBody>(null),
    wasHeld = useRef(false);
  const start = useMemo(
    () => [...(c.positions[o.id] || objectPosition(o, c.scene))] as V3,
    [o, c],
  );
  const size = o.approximateScale;
  const isBottle = /bottle/i.test(o.label),
    isCup = /cup/i.test(o.label);
  useFrame(() => {
    if (!ref.current) return;
    const held = c.held === o.id;
    if (held) {
      if (!wasHeld.current) {
        ref.current.setBodyType(2, true);
        ref.current.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      }
      const p = c.positions[o.id];
      ref.current.setNextKinematicTranslation({ x: p[0], y: p[1], z: p[2] });
    } else {
      if (wasHeld.current) {
        ref.current.setBodyType(0, true);
        ref.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
        ref.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      const p = ref.current.translation();
      c.positions[o.id] = [p.x, p.y, p.z];
    }
    wasHeld.current = held;
  });
  const color =
    selected === o.id
      ? "#bbf487"
      : isBottle
        ? "#8fbbc0"
        : isCup
          ? "#e2bb89"
          : "#667680";
  return (
    <RigidBody
      ref={ref}
      position={start}
      type={o.interactable ? "dynamic" : "fixed"}
      colliders={false}
      restitution={0.08}
      friction={0.8}
      linearDamping={1}
      angularDamping={2}
      ccd
      enabledRotations={[false, false, false]}
    >
      {o.shape === "box" ? (
        <CuboidCollider
          args={[size.x / 2, size.y / 2, size.z / 2]}
          mass={o.massKg}
        />
      ) : o.shape === "cylinder" ? (
        <CylinderCollider args={[size.y / 2, size.x / 2]} mass={o.massKg} />
      ) : (
        <BallCollider args={[size.x / 2]} mass={o.massKg} />
      )}
      <mesh
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onSelect(o.id);
        }}
      >
        <meshStandardMaterial
          color={color}
          metalness={isBottle ? 0.35 : 0.2}
          roughness={0.32}
        />
        {o.shape === "box" ? (
          <boxGeometry args={[size.x, size.y, size.z]} />
        ) : o.shape === "cylinder" ? (
          <cylinderGeometry args={[size.x / 2, size.x / 2, size.y, 24]} />
        ) : (
          <sphereGeometry args={[size.x / 2, 20, 20]} />
        )}
      </mesh>
      {isBottle && (
        <mesh position={[0, size.y / 2 + 0.016, 0]}>
          <cylinderGeometry args={[size.x * 0.26, size.x * 0.26, 0.032, 20]} />
          <meshStandardMaterial color="#26383e" />
        </mesh>
      )}
      {isCup && (
        <mesh position={[size.x * 0.5, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[size.x * 0.3, 0.012, 8, 20]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
      {selected === o.id && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -size.y / 2 + 0.004, 0]}
        >
          <ringGeometry
            args={[
              Math.max(size.x, size.z) * 0.6,
              Math.max(size.x, size.z) * 0.6 + 0.008,
              40,
            ]}
          />
          <meshBasicMaterial
            color="#b4ed79"
            transparent
            opacity={0.8}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </RigidBody>
  );
}
function Tick({ c, onUpdate }: { c: Controller; onUpdate: () => void }) {
  let elapsed = useRef(0);
  useFrame((_, dt) => {
    c.tick(dt);
    elapsed.current += dt;
    if (elapsed.current > 0.1) {
      onUpdate();
      elapsed.current = 0;
    }
  });
  return null;
}
export function World({
  controller: c,
  selected,
  onSelect,
  onUpdate,
  landing = false,
}: {
  controller: Controller;
  selected: string;
  onSelect: (id: string) => void;
  onUpdate: () => void;
  landing?: boolean;
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{
        position: landing ? [3, 2.5, -3.5] : [2.5, 2.1, -3.25],
        fov: 43,
      }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#0b1117"]} />
      <fog attach="fog" args={["#0b1117", 5, 13]} />
      <ambientLight intensity={0.8} />
      <directionalLight
        position={[2, 5, -3]}
        intensity={2.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <pointLight position={[-2, 2, 1]} intensity={8} color="#98dfe8" />
      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60}>
          <Tick c={c} onUpdate={onUpdate} />
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider args={[5, 0.05, 5]} position={[0, -0.05, 0]} />
          </RigidBody>
          {c.scene.surfaces.map((s, i) => (
            <RigidBody type="fixed" key={s.id} colliders={false}>
              <CuboidCollider
                args={[s.width / 2, 0.045, s.depth / 2]}
                position={[0, s.height - 0.045, -0.13 - i * 0.25]}
              />
              <mesh
                position={[0, s.height - 0.045, -0.13 - i * 0.25]}
                receiveShadow
              >
                <boxGeometry args={[s.width, 0.09, s.depth]} />
                <meshStandardMaterial
                  color="#26343d"
                  metalness={0.6}
                  roughness={0.3}
                />
              </mesh>
              {[-1, 1].flatMap((x) =>
                [-1, 1].map((z) => (
                  <mesh
                    key={`${x}${z}`}
                    position={[
                      x * (s.width / 2 - 0.07),
                      s.height / 2 - 0.05,
                      z * (s.depth / 2 - 0.07) - 0.13 - i * 0.25,
                    ]}
                  >
                    <boxGeometry args={[0.045, s.height - 0.1, 0.045]} />
                    <meshStandardMaterial color="#4c6069" />
                  </mesh>
                )),
              )}
            </RigidBody>
          ))}
          {c.scene.objects.map((o) => (
            <ObjectBody
              key={o.id}
              object={o}
              c={c}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
          <Robot c={c} />
        </Physics>
        <Grid
          position={[0, 0.001, 0]}
          args={[20, 20]}
          cellSize={0.25}
          cellThickness={0.6}
          cellColor="#26353d"
          sectionSize={1}
          sectionThickness={0.8}
          sectionColor="#38515a"
          fadeDistance={9}
          infiniteGrid
        />
        <ContactShadows
          position={[0, 0.003, 0]}
          opacity={0.4}
          scale={10}
          blur={2}
          far={3}
        />
        <OrbitControls
          makeDefault
          target={[0, 0.88, 0.05]}
          minDistance={2}
          maxDistance={6}
          maxPolarAngle={Math.PI / 2 - 0.03}
          autoRotate={landing}
          autoRotateSpeed={0.35}
        />
      </Suspense>
    </Canvas>
  );
}
