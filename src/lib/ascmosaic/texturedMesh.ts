import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// See the cross-layer coupling note in ascmosaic/index.ts — same
// justification applies here. The fast path needs to tell the pool
// "a new consumer is using this video" so refcounted release works.
import { acquire as acquirePooledVideo } from '@/lib/videoPool';

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
   * Pre-warmed video element to reuse instead of fetching the URL.
   * When provided (and its readyState >= HAVE_CURRENT_DATA), the texture
   * wraps this element directly and skips the canplay wait.
   * Used by videoPool integration to eliminate re-download latency.
   */
  existingVideo?: HTMLVideoElement;
}

const DEFAULT_TEXTURE_URL = '/resource/earth.jpg';

declare global {
  interface Window {
    ASC_MOSAIC_BASE_URL?: string;
  }
}

function createVideoTexture(
  videoUrl: string,
  existingVideo?: HTMLVideoElement,
): Promise<THREE.VideoTexture> {
  // Fast path: reuse a pre-warmed video from videoPool.
  // acquirePooledVideo() bumps the pool's refcount AND resumes playback
  // (the pool leaves warmed videos paused after the initial prime — see
  // videoPool.ts lifecycle contract). The matching release() is called
  // from AscMosaic's dispose paths when the containing mosaic is
  // unmounted, so the refcount cleanly tracks active consumers.
  //
  // Safari Low Power Mode and backgrounded tab heuristics can still
  // reject play() inside acquire(); if that happens the VideoTexture
  // shows the last decoded frame rather than throwing — the lazy path
  // below would have failed on the same policy anyway.
  if (existingVideo && existingVideo.readyState >= 2) {
    const texture = new THREE.VideoTexture(existingVideo);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    acquirePooledVideo(existingVideo);
    return Promise.resolve(texture);
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    try {
      const baseUrl = (window.location.origin === 'null' || window.location.protocol === 'blob:')
        ? ((window as any).ASC_MOSAIC_BASE_URL || '')
        : window.location.origin;
      if (baseUrl) {
        const urlObj = new URL(videoUrl, baseUrl + '/');
        const currentOrigin = (window.location.origin === 'null' || window.location.protocol === 'blob:')
          ? new URL(baseUrl).origin
          : window.location.origin;
        if (urlObj.origin !== currentOrigin) {
          video.crossOrigin = 'anonymous';
        }
      }
    } catch {
      // ignore
    }
    video.src = videoUrl;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'auto';

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('Video load timeout'));
      }
    }, 10000);

    const cleanup = () => clearTimeout(timeout);

    video.addEventListener('canplay', () => {
      if (resolved) return;
      cleanup();
      video.play().then(() => {
        if (resolved) return;
        resolved = true;
        const texture = new THREE.VideoTexture(video);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        resolve(texture);
      }).catch((err) => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`Video play failed: ${err?.message || 'Unknown'}`));
        }
      });
    }, { once: true });

    video.addEventListener('error', () => {
      cleanup();
      if (!resolved) {
        resolved = true;
        const err = video.error;
        reject(new Error(err ? `Video load error (${err.code})` : 'Video load failed'));
      }
    }, { once: true });

    video.load();
  });
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
    }).catch(() => {
      const material = new THREE.MeshBasicMaterial({
        color: 0x4a90e2,
        side: shape === 'plane' ? THREE.DoubleSide : THREE.FrontSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'TexturedMesh';
      mesh.scale.setScalar(scale);
      return mesh;
    });
  }

  const textureLoader = new THREE.TextureLoader();
  let texture: THREE.Texture | null = null;
  let textureLoadFailed = false;

  try {
    texture = textureLoader.load(
      textureUrl,
      () => {
        if (texture) texture.needsUpdate = true;
      },
      undefined,
      () => {
        textureLoadFailed = true;
      }
    );
  } catch {
    textureLoadFailed = true;
  }

  const materialOptions: THREE.MeshBasicMaterialParameters = {
    color: 0xffffff,
    side: shape === 'plane' ? THREE.DoubleSide : THREE.FrontSide,
  };
  if (texture && !textureLoadFailed) {
    materialOptions.map = texture;
  } else {
    materialOptions.color = 0x4a90e2;
  }

  const material = new THREE.MeshBasicMaterial(materialOptions);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'TexturedMesh';
  mesh.scale.setScalar(scale);

  return Promise.resolve(mesh);
}
