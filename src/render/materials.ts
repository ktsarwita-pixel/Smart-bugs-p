import * as THREE from 'three';

/**
 * Custom voxel shader.
 * Vertex attribute `alight` packs:
 *   r = block light (0..1), g = sky light (0..1), b = face shade * ambient occlusion
 * The sky contribution is multiplied by a global `uDay` uniform so the day/night
 * cycle animates without re-meshing chunks.
 */
export interface VoxelUniforms {
  uDay: { value: number };
  uFogColor: { value: THREE.Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
  uTime: { value: number };
}

const VOXEL_VERT = /* glsl */ `
  attribute vec3 alight;
  varying vec2 vUv;
  varying vec3 vLight;
  varying float vDepth;
  void main() {
    vUv = uv;
    vLight = alight;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const VOXEL_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uDay;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uTime;
  uniform float uAlphaTest;
  uniform float uOpacity;
  uniform float uWave;
  uniform vec3 uTint;
  varying vec2 vUv;
  varying vec3 vLight;
  varying float vDepth;

  void main() {
    vec2 uv = vUv;
    vec4 texel = texture2D(uMap, uv);
    if (texel.a < uAlphaTest) discard;

    float blockLight = vLight.r;
    float skyLight = vLight.g * uDay;
    float l = max(blockLight, skyLight);

    vec3 col = texel.rgb * vLight.b * (0.055 + l * 0.945);
    col *= uTint;

    // Gentle wave on liquid surfaces.
    if (uWave > 0.0) {
      float w = sin(uTime * 1.7 + vUv.x * 24.0 + vUv.y * 17.0) * 0.5 + 0.5;
      col += vec3(0.05, 0.09, 0.13) * w * uWave * vLight.b;
    }

    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    col = mix(col, uFogColor, fog);

    gl_FragColor = vec4(col, texel.a * uOpacity);
  }
`;

export interface VoxelMaterialSet {
  opaque: THREE.ShaderMaterial;
  cutout: THREE.ShaderMaterial;
  liquid: THREE.ShaderMaterial;
  uniforms: VoxelUniforms;
  setFog(color: THREE.Color, near: number, far: number): void;
  setDay(day: number): void;
}

function makeMaterial(
  map: THREE.Texture,
  uniforms: VoxelUniforms,
  opts: { alphaTest: number; opacity: number; transparent: boolean; side: THREE.Side; wave: number; tint: number },
): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uDay: uniforms.uDay,
      uFogColor: uniforms.uFogColor,
      uFogNear: uniforms.uFogNear,
      uFogFar: uniforms.uFogFar,
      uTime: uniforms.uTime,
      uAlphaTest: { value: opts.alphaTest },
      uOpacity: { value: opts.opacity },
      uWave: { value: opts.wave },
      uTint: { value: new THREE.Color(opts.tint, opts.tint, opts.tint) },
    },
    vertexShader: VOXEL_VERT,
    fragmentShader: VOXEL_FRAG,
    transparent: opts.transparent,
    side: opts.side,
    depthWrite: opts.transparent ? false : true,
  });
  return mat;
}

export function createVoxelMaterials(map: THREE.Texture): VoxelMaterialSet {
  const uniforms: VoxelUniforms = {
    uDay: { value: 1 },
    uFogColor: { value: new THREE.Color(0x9fb4c8) },
    uFogNear: { value: 18 },
    uFogFar: { value: 78 },
    uTime: { value: 0 },
  };

  const opaque = makeMaterial(map, uniforms, {
    alphaTest: 0,
    opacity: 1,
    transparent: false,
    side: THREE.FrontSide,
    wave: 0,
    tint: 1,
  });
  const cutout = makeMaterial(map, uniforms, {
    alphaTest: 0.5,
    opacity: 1,
    transparent: false,
    side: THREE.DoubleSide,
    wave: 0,
    tint: 1,
  });
  const liquid = makeMaterial(map, uniforms, {
    alphaTest: 0.02,
    opacity: 0.78,
    transparent: true,
    side: THREE.DoubleSide,
    wave: 1,
    tint: 1,
  });

  return {
    opaque,
    cutout,
    liquid,
    uniforms,
    setFog(color: THREE.Color, near: number, far: number) {
      uniforms.uFogColor.value.copy(color);
      uniforms.uFogNear.value = near;
      uniforms.uFogFar.value = far;
    },
    setDay(day: number) {
      uniforms.uDay.value = day;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Sky dome                                                            */
/* ------------------------------------------------------------------ */

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_Position.z = gl_Position.w * 0.999999;
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uStars;
  uniform float uSunSize;
  uniform float uTime;
  varying vec3 vDir;

  float hash13(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 dir = normalize(vDir);
    float h = dir.y;

    vec3 col = mix(uHorizon, uZenith, clamp(pow(max(h, 0.0), 0.55), 0.0, 1.0));
    col = mix(col, uGround, clamp(-h * 2.4, 0.0, 1.0));

    // Sun glow + disc.
    float sd = dot(dir, normalize(uSunDir));
    float glow = pow(max(sd, 0.0), 32.0) * 0.55 + pow(max(sd, 0.0), 6.0) * 0.16;
    col += uSunColor * glow;

    float disc = smoothstep(uSunSize - 0.004, uSunSize + 0.002, sd);
    col = mix(col, uSunColor * 1.25, disc);

    // Moon opposite the sun.
    float md = dot(dir, normalize(-uSunDir));
    float moon = smoothstep(0.9965, 0.9985, md);
    col = mix(col, vec3(0.92, 0.94, 1.0), moon * uStars * 1.4);

    // Stars.
    if (uStars > 0.01 && h > -0.05) {
      vec3 sp = floor(dir * 190.0);
      float r = hash13(sp);
      float star = smoothstep(0.9975, 0.9995, r) * uStars;
      float twinkle = 0.65 + 0.35 * sin(uTime * 2.0 + r * 60.0);
      col += vec3(star * twinkle);
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

export interface SkyMaterial extends THREE.ShaderMaterial {
  uniforms: {
    uZenith: { value: THREE.Color };
    uHorizon: { value: THREE.Color };
    uGround: { value: THREE.Color };
    uSunColor: { value: THREE.Color };
    uSunDir: { value: THREE.Vector3 };
    uStars: { value: number };
    uSunSize: { value: number };
    uTime: { value: number };
  };
}

export function createSkyMaterial(): SkyMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color(0x2f6fd0) },
      uHorizon: { value: new THREE.Color(0xa8c8ea) },
      uGround: { value: new THREE.Color(0x2a2419) },
      uSunColor: { value: new THREE.Color(0xfff0c0) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.7, 0.3) },
      uStars: { value: 0 },
      uSunSize: { value: 0.9975 },
      uTime: { value: 0 },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  }) as SkyMaterial;
  return mat;
}
