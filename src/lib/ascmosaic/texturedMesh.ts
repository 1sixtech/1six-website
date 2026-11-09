import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// See the cross-layer coupling note in ascmosaic/index.ts — same
// justification applies here. Every video comes from the pool, which has to
// know "a new consumer is using this video" so refcounted release works.
import { acquire as acquirePooledVideo, warmup as warmupPooledVideo } from '@/lib/videoPool';

export type TexturedMeshShape = 'sphere' | 'cube' | 'plane' | 'glb';

/**
 * 텍스처 메시 생성 옵션
 */
export interface TexturedMeshOptions {
  /** 도형 종류 */
  shape?: TexturedMeshShape;
  /** 텍스처 URL (shape가 glb가 아닐 때) */
  textureUrl?: string;
  /** 텍스처 타입: image 또는 video */
  textureType?: 'image' | 'video';
  /** GLB 모델 URL (shape: glb) */
  modelUrl?: string;
  /** 크기 배율 (모든 도형) */
  scale?: number;
  /** 구 반지름 (shape: sphere) */
  radius?: number;
  /** 구 세그먼트 (shape: sphere) */
  widthSegments?: number;
  heightSegments?: number;
  /** 큐브 한 변 길이 (shape: cube) */
  size?: number;
  /** 평면 가로 (shape: plane) */
  width?: number;
  /** 평면 세로 (shape: plane) */
  height?: number;
  /**
   * A video from videoPool with a decoded frame, already loaded by the caller.
   * Without it the texture loads `textureUrl` through the pool itself.
   */
  existingVideo?: HTMLVideoElement;
}

const DEFAULT_TEXTURE_URL = '/resource/earth.jpg';

/**
 * Wrap a pooled video. A source that cannot load rejects: there is no stand-in.
 * A solid-color material here is what the mosaic tiled as one repeated glyph
 * across the whole canvas, with nothing to ever replace it.
 */
async function createVideoTexture(
  videoUrl: string,
  existingVideo?: HTMLVideoElement,
): Promise<THREE.VideoTexture> {
  const video = existingVideo ?? await warmupPooledVideo(videoUrl);
  const texture = new THREE.VideoTexture(video);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // Bumps the refcount and resumes playback. Low Power Mode can still reject
  // play(); the mosaic then keeps showing the decoded frame.
  acquirePooledVideo(video);
  return texture;
}

function buildGeometry(shape: Exclude<TexturedMeshShape, 'glb'>, options: TexturedMeshOptions): THREE.BufferGeometry {
  const radius = options.radius ?? 2;
  const widthSegments = options.widthSegments ?? 64;
  const heightSegments = options.heightSegments ?? 32;
  const size = options.size ?? 4;
  const width = options.width ?? 4;
  const height = options.height ?? 4;

  switch (shape) {
    case 'sphere':
      return new THREE.SphereGeometry(radius, widthSegments, heightSegments);
    case 'cube':
      return new THREE.BoxGeometry(size, size, size);
    case 'plane':
      return new THREE.PlaneGeometry(width, height);
    default:
      return new THREE.SphereGeometry(radius, widthSegments, heightSegments);
  }
}

function loadGlbModel(url: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        const group = new THREE.Group();
        group.add(gltf.scene);
        resolve(group);
      },
      undefined,
      (error) => reject(error)
    );
  });
}

/**
 * 텍스처가 입혀진 메시 또는 GLB 모델을 생성합니다 (구/큐브/평면/glb).
 */
export function createTexturedMesh(options: TexturedMeshOptions = {}): Promise<THREE.Object3D> {
  const shape = options.shape ?? 'sphere';
  const scale = options.scale ?? 1;

  if (shape === 'glb') {
    const modelUrl = options.modelUrl ?? '';
    if (!modelUrl) {
      const fallback = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x888888 })
      );
      fallback.scale.setScalar(scale);
      return Promise.resolve(fallback);
    }
    return loadGlbModel(modelUrl).then((group) => {
      group.scale.setScalar(scale);
      group.name = 'TexturedMesh';
      return group;
    }).catch(() => {
      const fallback = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
      );
      fallback.scale.setScalar(scale);
      return fallback;
    });
  }

  const textureUrl = options.textureUrl ?? DEFAULT_TEXTURE_URL;
  const textureType = options.textureType ?? 'image';
  const geometry = buildGeometry(shape, options);

  if (textureType === 'video') {
    return createVideoTexture(textureUrl, options.existingVideo).then((texture) => {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: texture,
        side: shape === 'plane' ? THREE.DoubleSide : THREE.FrontSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'TexturedMesh';
      mesh.scale.setScalar(scale);
      return mesh;
    });
  }

  // A missing image has no pixels to report; AscMosaic.waitForSceneTextures
  // rejects at its deadline rather than letting the mosaic tile an empty map.
  const texture: THREE.Texture = new THREE.TextureLoader().load(textureUrl, () => {
    texture.needsUpdate = true;
  });

  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: texture,
    side: shape === 'plane' ? THREE.DoubleSide : THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'TexturedMesh';
  mesh.scale.setScalar(scale);

  return Promise.resolve(mesh);
}
