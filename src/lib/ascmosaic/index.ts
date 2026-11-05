import {
  AsciiMosaicFilter,
  AsciiMosaicFilterOptions,
} from './asciiMosaicFilter';
import { createTexturedMesh, TexturedMeshOptions } from './texturedMesh';
import { OrbitControls, OrbitControlsOptions } from './orbitControls';
import * as THREE from 'three';
// Cross-layer coupling: ascmosaic is a self-contained WebGL library, but
// this project shares HTMLVideoElement instances via a global pool so
// multiple sections can reuse pre-warmed videos. The dispose paths below
// route pooled videos through videoPool.release() (refcounted pause)
// instead of the normal kill path (pause + src reset + load), so shared
// videos survive section unmounts AND stop decoding when no live consumer
// remains. Non-pooled videos still get the full teardown. If ascmosaic is
// ever extracted as a standalone library, convert to injected predicates
// on AscMosaicOptions (`isShared: (v) => boolean`, `onRelease: (v) => void`)
// instead of importing the pool directly.
import * as videoPool from '@/lib/videoPool';

/** AscMosaic 생성 옵션 */
export interface AscMosaicOptions {
  /** true면 오소(Orthographic) 카메라 사용, 기본값: false (원근 카메라) */
  orthographic?: boolean;
  /** 모델 자동 회전 활성화, 기본값: true */
  autoRotate?: boolean;
  /** 모델 자동 회전 속도 (rad/frame), 기본값: 0.005 */
  autoRotateSpeed?: number;
  /** Multisample the drawing buffer (WebGLRenderer antialias). Default: true */
  antialias?: boolean;
}

/**
 * AscMosaic 라이브러리 메인 클래스
 */
export class AscMosaic {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private model: THREE.Object3D | null = null;
  private modelOptions: TexturedMeshOptions | null = null;
  private orbitControls: OrbitControls | null = null;
  private lastOrbitOptions: OrbitControlsOptions | undefined = undefined;
  private tiltControlsEnabled: boolean = false;
  private tiltMouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  private tiltMouseLeaveHandler: (() => void) | null = null;
  private tiltResetAnimationId: number | null = null;
  private tiltTargetRotationX: number = 0;
  private tiltTargetRotationY: number = 0;
  private tiltAnimationId: number | null = null;
  private tiltMaxAngle: number = Math.PI / 6;
  private tiltSmoothness: number = 0.15;
  private resizeHandler: (() => void) | null = null;
  private contextLostHandler: ((e: Event) => void) | null = null;
  private contextRestoredHandler: (() => void) | null = null;
  private container: HTMLElement;
  private asciiMosaicFilter: AsciiMosaicFilter | null = null;
  /** Render at container_size × renderScale for denser mosaic grids. */
  private renderScale: number = 1;
  private animationFrameId: number | null = null;
  private isAnimating: boolean = false;
  private useOrthographic: boolean = false;
  private orthoSize: number = 5;
  /** 모델 자동 회전 여부 */
  private modelAutoRotate: boolean = true;
  /** 모델 자동 회전 속도 (rad/frame) */
  private modelAutoRotateSpeed: number = 0.005;
  /** Draw only frames that can differ from the last (see setRenderOnDemand). */
  private renderOnDemand: boolean = false;
  /** A frame is owed: a new model, size, filter or context, or a restarted loop. */
  private renderPending: boolean = true;
  /** The model's image texture has arrived; until then on-demand mode watches for it. */
  private sceneTexturesSettled: boolean = false;
  /** Set by the first dispose(); a repeat call has nothing left to free. */
  private disposed: boolean = false;

  constructor(container: HTMLElement, options?: AscMosaicOptions) {
    this.container = container;
    this.useOrthographic = options?.orthographic ?? false;
    this.modelAutoRotate = options?.autoRotate ?? true;
    this.modelAutoRotateSpeed = options?.autoRotateSpeed ?? 0.005;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);

    const width = container.clientWidth;
    const height = container.clientHeight;
    const aspect = width / height;
    if (this.useOrthographic) {
      const halfH = this.orthoSize;
      const halfW = halfH * aspect;
      this.camera = new THREE.OrthographicCamera(
        -halfW, halfW, halfH, -halfH, 0.1, 1000
      );
    } else {
      this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    }
    this.camera.position.z = 5;

    this.renderer = new THREE.WebGLRenderer({
      antialias: options?.antialias ?? true,
      alpha: true,
    });
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.LinearToneMapping;
    this.renderer.toneMappingExposure = 2.0;
    container.appendChild(this.renderer.domElement);

    // WebGL context loss recovery. Mobile browsers evict contexts on tab switch
    // or memory pressure. Three.js re-uploads textures/shaders internally on
    // restore, but we must pause/resume the animation loop.
    this.contextLostHandler = (e: Event) => { e.preventDefault(); this.stopAnimate(); };
    this.contextRestoredHandler = () => {
      if (this.asciiMosaicFilter) {
        const w = this.renderer.domElement.width;
        const h = this.renderer.domElement.height;
        this.asciiMosaicFilter.setSize(w, h);
      }
      this.renderPending = true;
      this.animate();
    };
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLostHandler);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.contextRestoredHandler);

    // Resize handler: only fires on width changes to avoid flicker from
    // mobile address bar show/hide (height-only changes).
    let lastContainerWidth = container.clientWidth;
    this.resizeHandler = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === lastContainerWidth) return;
      lastContainerWidth = w;

      const rw = Math.round(w * this.renderScale);
      const rh = Math.round(h * this.renderScale);
      if (this.camera instanceof THREE.PerspectiveCamera) {
        this.camera.aspect = w / h;
      } else {
        const halfH = this.orthoSize;
        const halfW = halfH * (w / h);
        this.camera.left = -halfW;
        this.camera.right = halfW;
        this.camera.top = halfH;
        this.camera.bottom = -halfH;
      }
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(rw, rh);
      if (this.renderScale !== 1) {
        const canvas = this.renderer.domElement;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
      }
      if (this.asciiMosaicFilter) {
        this.asciiMosaicFilter.setSize(rw, rh);
      }
      this.renderPending = true;
    };
    window.addEventListener('resize', this.resizeHandler);
  }

  async addModel(options?: TexturedMeshOptions): Promise<THREE.Object3D> {
    const opts = options ?? {};
    // Any model change redraws, and an image texture arrives after the mesh.
    this.renderPending = true;
    this.sceneTexturesSettled = false;
    const newShape = opts.shape ?? 'sphere';
    const newScale = opts.scale ?? 1;

    if (this.model && this.modelOptions && this.modelOptions.shape === newShape) {
      const oldScale = this.modelOptions.scale ?? 1;
      const textureChanged =
        this.modelOptions.textureUrl !== opts.textureUrl ||
        this.modelOptions.textureType !== opts.textureType ||
        this.modelOptions.modelUrl !== opts.modelUrl;

      const geometryChanged =
        this.modelOptions.radius !== opts.radius ||
        this.modelOptions.size !== opts.size ||
        this.modelOptions.width !== opts.width ||
        this.modelOptions.height !== opts.height;

      if (!textureChanged && geometryChanged && newShape !== 'glb') {
        this.model.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.geometry) {
            const oldGeometry = obj.geometry;
            const radius = opts.radius ?? 2;
            const widthSegments = opts.widthSegments ?? 64;
            const heightSegments = opts.heightSegments ?? 32;
            const size = opts.size ?? 4;
            const width = opts.width ?? 4;
            const height = opts.height ?? 4;

            let newGeometry: THREE.BufferGeometry;
            switch (newShape) {
              case 'sphere':
                newGeometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
                break;
              case 'cube':
                newGeometry = new THREE.BoxGeometry(size, size, size);
                break;
              case 'plane':
                newGeometry = new THREE.PlaneGeometry(width, height);
                break;
              default:
                newGeometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
            }

            obj.geometry = newGeometry;
            if (obj.material instanceof THREE.MeshBasicMaterial) {
              obj.material.side = newShape === 'plane' ? THREE.DoubleSide : THREE.FrontSide;
            }
            oldGeometry.dispose();
          }
        });
        this.model.scale.setScalar(newScale);
        this.modelOptions = { ...opts };
        return this.model;
      }

      if (!textureChanged && !geometryChanged && oldScale !== newScale) {
        this.model.scale.setScalar(newScale);
        this.modelOptions = { ...opts };
        return this.model;
      }
    }

    const hadExistingModel = this.model !== null;

    if (this.model) {
      this.scene.remove(this.model);
      this.model.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (obj.material instanceof THREE.Material) {
            if (obj.material instanceof THREE.MeshBasicMaterial && obj.material.map instanceof THREE.VideoTexture) {
              const videoTexture = obj.material.map as THREE.VideoTexture;
              const video = videoTexture.image as HTMLVideoElement;
              if (video) {
                if (videoPool.isPooled(video)) {
                  // Pooled videos are shared — decrement refcount so
                  // the pool can pause the element when no live
                  // VideoTexture references it anymore.
                  videoPool.release(video);
                } else {
                  // One-off: fully tear down.
                  video.pause();
                  video.src = '';
                  video.load();
                }
              }
              videoTexture.dispose();
            } else if (obj.material instanceof THREE.MeshBasicMaterial && obj.material.map) {
              obj.material.map.dispose();
            }
            obj.material.dispose();
          }
        }
      });
      this.model = null;
    }

    const model = await createTexturedMesh(opts);
    // Disposed while the texture loaded (a theme switch, or the page left):
    // free what arrived instead of attaching it to a released scene, where
    // its video would decode on with nothing left to stop it.
    if (this.disposed) {
      this.disposeModel(model);
      return model;
    }
    this.model = model;
    this.scene.add(this.model);
    this.modelOptions = { ...opts };

    if (!hadExistingModel && this.model) {
      const box = new THREE.Box3().setFromObject(this.model);
      if (!box.isEmpty()) {
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        let distance: number;
        if (opts.shape === 'plane') {
          if (this.camera instanceof THREE.PerspectiveCamera) {
            // Perspective: unscaled 기준 고정 거리 — scale이 zoom level을 제어
            // PDF의 cameraPosition distance ≈ 10 = unscaledMaxDim * 2.5 (plane 4×4 기준)
            const modelScale = opts.scale ?? 1;
            const unscaledMaxDim = Math.max(size.x, size.y) / modelScale;
            distance = unscaledMaxDim * 2.5;
          } else {
            // Orthographic: 거리는 시각적 크기에 영향 없음 (orthoSize가 결정)
            const diagonal = Math.sqrt(size.x * size.x + size.y * size.y);
            distance = Math.max(diagonal * 1.5, 5);
          }
          this.camera.position.set(center.x, center.y, center.z + distance);
        } else {
          const maxDim = Math.max(size.x, size.y, size.z);
          distance = Math.max(maxDim * 3, 5);
          this.camera.position.set(center.x, center.y, center.z + distance);
        }

        this.camera.lookAt(center);
        this.camera.updateProjectionMatrix();
      } else {
        this.camera.position.set(0, 0, 5);
        this.camera.lookAt(0, 0, 0);
      }
    }

    return this.model;
  }

  setupOrbitControls(options?: OrbitControlsOptions): OrbitControls {
    if (this.orbitControls) {
      this.orbitControls.dispose();
    }

    let target: THREE.Vector3 | undefined;
    if (this.model) {
      const box = new THREE.Box3().setFromObject(this.model);
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        target = center;
      }
    }

    const orbitOptions: OrbitControlsOptions = {
      ...options,
      target: target || options?.target,
    };
    this.lastOrbitOptions = orbitOptions;

    this.orbitControls = new OrbitControls(
      this.camera,
      this.renderer.domElement,
      orbitOptions
    );

    return this.orbitControls;
  }

  setupTiltControls(
    invertX: boolean = false,
    invertY: boolean = false,
    maxTiltAngle: number = Math.PI / 6,
    smoothness: number = 0.15
  ): void {
    if (this.orbitControls) {
      this.orbitControls.dispose();
      this.orbitControls = null;
    }
    this.disableTiltControls();

    this.tiltControlsEnabled = true;
    this.tiltMaxAngle = maxTiltAngle;
    this.tiltSmoothness = Math.max(0.01, Math.min(1, smoothness));

    this.tiltTargetRotationX = 0;
    this.tiltTargetRotationY = 0;
    if (this.model) {
      this.model.rotation.x = 0;
      this.model.rotation.y = 0;
    }

    const animateToTarget = () => {
      if (!this.model || !this.tiltControlsEnabled) {
        this.tiltAnimationId = null;
        return;
      }

      const currentX = this.model.rotation.x;
      const currentY = this.model.rotation.y;
      const targetX = this.tiltTargetRotationX;
      const targetY = this.tiltTargetRotationY;

      const newX = currentX + (targetX - currentX) * this.tiltSmoothness;
      const newY = currentY + (targetY - currentY) * this.tiltSmoothness;

      if (Math.abs(newX - targetX) < 0.001 && Math.abs(newY - targetY) < 0.001) {
        this.model.rotation.x = targetX;
        this.model.rotation.y = targetY;
        this.tiltAnimationId = null;
      } else {
        this.model.rotation.x = newX;
        this.model.rotation.y = newY;
        this.tiltAnimationId = requestAnimationFrame(animateToTarget);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!this.tiltControlsEnabled || !this.model) return;

      if (this.tiltResetAnimationId !== null) {
        cancelAnimationFrame(this.tiltResetAnimationId);
        this.tiltResetAnimationId = null;
      }

      const rect = this.container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const mouseX = e.clientX - centerX;
      const mouseY = e.clientY - centerY;

      const maxDistance = Math.min(rect.width, rect.height) / 2;
      let normalizedX = Math.max(-1, Math.min(1, mouseX / maxDistance));
      let normalizedY = Math.max(-1, Math.min(1, -mouseY / maxDistance));

      if (invertX) normalizedX = -normalizedX;
      if (invertY) normalizedY = -normalizedY;

      this.tiltTargetRotationY = -normalizedX * this.tiltMaxAngle;
      this.tiltTargetRotationX = normalizedY * this.tiltMaxAngle;

      if (this.tiltAnimationId === null) {
        this.tiltAnimationId = requestAnimationFrame(animateToTarget);
      }
    };

    const handleMouseLeave = () => {
      if (!this.model) return;

      if (this.tiltResetAnimationId !== null) {
        cancelAnimationFrame(this.tiltResetAnimationId);
        this.tiltResetAnimationId = null;
      }

      this.tiltTargetRotationX = 0;
      this.tiltTargetRotationY = 0;

      if (this.tiltAnimationId === null) {
        this.tiltAnimationId = requestAnimationFrame(animateToTarget);
      }
    };

    this.tiltMouseMoveHandler = handleMouseMove;
    this.tiltMouseLeaveHandler = handleMouseLeave;
    this.container.addEventListener('mousemove', handleMouseMove);
    this.container.addEventListener('mouseleave', handleMouseLeave);
  }

  disableTiltControls(): void {
    this.tiltControlsEnabled = false;

    if (this.tiltResetAnimationId !== null) {
      cancelAnimationFrame(this.tiltResetAnimationId);
      this.tiltResetAnimationId = null;
    }
    if (this.tiltAnimationId !== null) {
      cancelAnimationFrame(this.tiltAnimationId);
      this.tiltAnimationId = null;
    }

    this.tiltTargetRotationX = 0;
    this.tiltTargetRotationY = 0;

    if (this.tiltMouseMoveHandler) {
      this.container.removeEventListener('mousemove', this.tiltMouseMoveHandler);
      this.tiltMouseMoveHandler = null;
    }
    if (this.tiltMouseLeaveHandler) {
      this.container.removeEventListener('mouseleave', this.tiltMouseLeaveHandler);
      this.tiltMouseLeaveHandler = null;
    }
  }

  addLights(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 3.0);
    this.scene.add(ambientLight);
  }

  /**
   * Force a paused video's decoded frame onto the GPU.
   *
   * three.js VideoTexture relies on requestVideoFrameCallback, which only
   * fires while the video is actively presenting frames (i.e. playing). On
   * iOS Low Power Mode (and under autoplay policy) play() is rejected and the
   * element stays paused, so rVFC never fires and the decoded first frame is
   * never uploaded — the mosaic samples an empty texture and renders blank.
   * Bumping needsUpdate while paused-with-a-frame makes the renderer re-upload
   * the current frame, so a static-but-correct ASCII frame shows instead.
   * Playing videos keep video.paused === false, so this is a no-op for them.
   */
  private refreshPausedVideoFrame(): void {
    if (!this.model) return;
    this.model.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh &&
        obj.material instanceof THREE.MeshBasicMaterial &&
        obj.material.map instanceof THREE.VideoTexture
      ) {
        const video = obj.material.map.image as HTMLVideoElement;
        // HAVE_CURRENT_DATA (2) means a frame exists to upload.
        if (video && video.paused && video.readyState >= 2) {
          obj.material.map.needsUpdate = true;
        }
      }
    });
  }

  private render(): void {
    if (this.asciiMosaicFilter && this.asciiMosaicFilter.getEnabled()) {
      this.refreshPausedVideoFrame();
      this.asciiMosaicFilter.renderToTarget(this.scene, this.camera);
      this.asciiMosaicFilter.render();
    } else {
      this.refreshPausedVideoFrame();
      this.renderer.render(this.scene, this.camera);
    }
  }

  animate(): void {
    if (this.isAnimating) return;

    this.isAnimating = true;
    // A restarted loop (back on screen, restored context) draws at once.
    this.renderPending = true;
    const animate = () => {
      if (!this.isAnimating) return;

      this.animationFrameId = requestAnimationFrame(animate);

      // 모델 자동 회전 (옵션으로 제어 가능)
      if (this.modelAutoRotate && this.model) {
        this.model.rotation.y += this.modelAutoRotateSpeed;
      }

      if (this.orbitControls) {
        this.orbitControls.update();
      }

      if (this.renderOnDemand && !this.isRenderDue()) return;
      this.render();
    };

    animate();
  }

  /**
   * Draw only the frames that can differ from the last one. For a still
   * image source the mosaic changes only when its noise clock ticks (9 times
   * a second for the world map), so the loop skips the display's other
   * 50-230 frames a second; a canvas left alone keeps showing its last
   * frame. Anything that moves the scene on its own (auto-rotate, orbit or
   * tilt controls, a video texture) keeps every frame. Callers that change
   * the scene in other ways must re-enable this or call renderOnce().
   */
  setRenderOnDemand(enabled: boolean): void {
    this.renderOnDemand = enabled;
    this.renderPending = true;
  }

  private isRenderDue(): boolean {
    if ((this.modelAutoRotate && this.model) || this.orbitControls || this.tiltControlsEnabled) {
      return true;
    }
    if (!this.sceneTexturesSettled) {
      const state = this.sceneTextureState();
      if (state === 'video') return true;
      if (state === 'ready') {
        // The first frame after the texture arrives uploads and shows it.
        this.sceneTexturesSettled = true;
        this.renderPending = true;
      }
    }
    if (this.renderPending) {
      this.renderPending = false;
      return true;
    }
    // A disabled filter draws nothing, so it owes no frames (render() then
    // draws the scene directly, which renderPending already covers).
    const filter = this.asciiMosaicFilter;
    return filter && filter.getEnabled() ? filter.wantsFrame(performance.now()) : false;
  }

  /** Whether the model's textures are still loading, all loaded, or include a video. */
  private sceneTextureState(): 'loading' | 'ready' | 'video' {
    if (!this.model) return 'loading';
    let state: 'loading' | 'ready' | 'video' = 'ready';
    this.model?.traverse((obj) => {
      if (state === 'video') return;
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshBasicMaterial && obj.material.map) {
        const map = obj.material.map;
        if (map instanceof THREE.VideoTexture) {
          state = 'video';
          return;
        }
        const image = map.image as { width?: number } | null | undefined;
        if (!image || !image.width) state = 'loading';
      }
    });
    return state;
  }

  stopAnimate(): void {
    this.isAnimating = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Pause or resume the model's video texture WITHOUT disposing the WebGL
   * context. AsciiCanvas calls this to stop decoder work for eager canvases
   * that have scrolled off-screen.
   *
   * Why this exists: iOS has a hard limit on simultaneously decoding
   * <video> elements (and WKWebView / Chrome iOS gets an even smaller
   * media+memory budget than Safari). The homepage mounts every ASCII
   * canvas as `eager`, so without this they all keep decoding at once even
   * while off-screen. On memory-constrained devices that starves the
   * decoders, the VideoTexture never receives a frame, and the mosaic
   * tiles a single brightness-derived cell — the garbled "dots everywhere"
   * output reported on iPhone 15 / Chrome-iOS.
   *
   * Pauses the <video> directly rather than via videoPool.release():
   * release() is refcount/lifetime bookkeeping for disposal, whereas this
   * is a transient play-state toggle for a still-mounted consumer. On the
   * homepage each video URL has exactly one live consumer, so a direct
   * pause/play here cannot affect another canvas.
   */
  setVideoPlaying(playing: boolean): void {
    if (!this.model) return;
    this.model.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh &&
        obj.material instanceof THREE.MeshBasicMaterial &&
        obj.material.map instanceof THREE.VideoTexture
      ) {
        const video = obj.material.map.image as HTMLVideoElement;
        if (!video) return;
        if (playing) {
          void video.play().catch(() => {});
        } else {
          try {
            video.pause();
          } catch {
            // Some mobile browsers reject pause() right after play();
            // safe to ignore — the decoder still stops.
          }
        }
      }
    });
  }

  renderOnce(): void {
    this.render();
  }

  /** 모델 자동 회전 on/off */
  setAutoRotate(enabled: boolean): void {
    this.modelAutoRotate = enabled;
  }

  /** 모델 자동 회전 속도 설정 (rad/frame) */
  setAutoRotateSpeed(speed: number): void {
    this.modelAutoRotateSpeed = speed;
  }

  async enableAsciiMosaicFilter(
    options?: AsciiMosaicFilterOptions
  ): Promise<void> {
    if (this.asciiMosaicFilter) {
      this.asciiMosaicFilter.disable();
      this.asciiMosaicFilter.dispose();
    }

    const width = this.renderer.domElement.width;
    const height = this.renderer.domElement.height;

    const filter = new AsciiMosaicFilter(
      this.renderer,
      width,
      height,
      options
    );
    this.asciiMosaicFilter = filter;

    await new Promise<void>((resolve, reject) => {
      const maxAttempts = 500; // 5 seconds at 10ms intervals
      let attempts = 0;
      const checkReady = () => {
        if (this.asciiMosaicFilter !== filter) {
          // Disposed or replaced while getting ready: give the caller its
          // turn back now instead of holding it until the timeout.
          reject(new Error('AsciiMosaicFilter: replaced or disposed before ready'));
        } else if (filter.isReady()) {
          resolve();
        } else if (++attempts >= maxAttempts) {
          reject(new Error('AsciiMosaicFilter: timed out waiting for ready state'));
        } else {
          setTimeout(checkReady, 10);
        }
      };
      checkReady();
    });

    filter.enable();
    this.renderPending = true;
  }

  disableAsciiMosaicFilter(): void {
    if (this.asciiMosaicFilter) {
      this.asciiMosaicFilter.disable();
    }
    this.renderPending = true;
  }

  async toggleAsciiMosaicFilter(
    options?: AsciiMosaicFilterOptions
  ): Promise<void> {
    if (this.isAsciiMosaicFilterEnabled()) {
      this.disableAsciiMosaicFilter();
    } else {
      await this.enableAsciiMosaicFilter(options);
    }
  }

  isAsciiMosaicFilterEnabled(): boolean {
    return this.asciiMosaicFilter?.getEnabled() ?? false;
  }

  setMosaicSize(size: number): void {
    if (this.asciiMosaicFilter) {
      this.asciiMosaicFilter.setMosaicSize(size);
    }
  }

  setNoiseIntensity(intensity: number): void {
    if (this.asciiMosaicFilter) {
      this.asciiMosaicFilter.setNoiseIntensity(intensity);
    }
  }

  setNoiseFPS(fps: number): void {
    if (this.asciiMosaicFilter) {
      this.asciiMosaicFilter.setNoiseFPS(fps);
    }
  }

  setNoiseFPSRandom(random: number): void {
    if (this.asciiMosaicFilter) {
      this.asciiMosaicFilter.setNoiseFPSRandom(random);
    }
  }

  setSetCount(setCount: number): void {
    if (this.asciiMosaicFilter) {
      this.asciiMosaicFilter.setSetCount(setCount);
    }
  }

  setSetSelectionMode(mode: 'first' | 'random' | 'cycle' | 'offsetRow'): void {
    if (this.asciiMosaicFilter) {
      this.asciiMosaicFilter.setSetSelectionMode(mode);
    }
  }

  setMinBrightness(brightness: number): void {
    if (this.asciiMosaicFilter) {
      this.asciiMosaicFilter.setMinBrightness(brightness);
    }
  }

  setMaxBrightness(brightness: number): void {
    if (this.asciiMosaicFilter) {
      this.asciiMosaicFilter.setMaxBrightness(brightness);
    }
  }

  setOffsetRowRadius(radius: number): void {
    if (this.asciiMosaicFilter) {
      this.asciiMosaicFilter.setOffsetRowRadius(radius);
    }
  }

  setAvoid(enabled: boolean): void {
    if (this.asciiMosaicFilter) {
      this.asciiMosaicFilter.setAvoid(enabled);
    }
  }

  setAvoidRadius(radius: number): void {
    if (this.asciiMosaicFilter) {
      this.asciiMosaicFilter.setAvoidRadius(radius);
    }
  }

  setAvoidStrength(strength: number): void {
    if (this.asciiMosaicFilter) {
      this.asciiMosaicFilter.setAvoidStrength(strength);
    }
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  getCamera(): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    return this.camera;
  }

  isOrthographic(): boolean {
    return this.useOrthographic;
  }

  setUseOrthographic(use: boolean): void {
    if (this.useOrthographic === use) return;
    this.renderPending = true;
    const orbit = this.orbitControls;
    let savedState: { target: THREE.Vector3; distance: number; theta: number; phi: number; orthoZoom?: number } | null = null;
    if (orbit) {
      savedState = orbit.getCameraState();
      orbit.dispose();
      this.orbitControls = null;
    }
    this.useOrthographic = use;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const aspect = width / height;
    const pos = this.camera.position.clone();
    const quat = this.camera.quaternion.clone();
    if (use) {
      const halfH = this.orthoSize;
      const halfW = halfH * aspect;
      this.camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 1000);
    } else {
      this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    }
    this.camera.position.copy(pos);
    this.camera.quaternion.copy(quat);
    this.camera.updateProjectionMatrix();
    if (orbit && this.lastOrbitOptions != null && savedState != null) {
      const state = savedState;
      const opts = this.lastOrbitOptions;
      this.orbitControls = new OrbitControls(
        this.camera,
        this.renderer.domElement,
        { ...opts, target: state.target, orthoZoom: state.orthoZoom }
      );
      this.orbitControls.setCameraState(
        state.target,
        state.distance,
        state.theta,
        state.phi,
        state.orthoZoom
      );
    }
  }

  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  setCanvasSize(width: number, height: number): void {
    const aspect = width / height;
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = aspect;
    } else {
      const halfH = this.orthoSize;
      const halfW = halfH * aspect;
      this.camera.left = -halfW;
      this.camera.right = halfW;
      this.camera.top = halfH;
      this.camera.bottom = -halfH;
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    if (this.asciiMosaicFilter) {
      this.asciiMosaicFilter.setSize(width, height);
    }
    this.renderPending = true;
  }

  /**
   * Set render scale multiplier. The WebGL renderer and mosaic filter will
   * render at container_size × scale, while the canvas CSS stays at 100% of
   * the container. Higher values produce denser mosaic grids.
   */
  setRenderScale(scale: number): void {
    this.renderScale = scale;
    // Immediately apply to current container size
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const rw = Math.round(w * scale);
    const rh = Math.round(h * scale);
    this.renderer.setSize(rw, rh);
    const canvas = this.renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    if (this.asciiMosaicFilter) {
      this.asciiMosaicFilter.setSize(rw, rh);
    }
    this.renderPending = true;
  }

  getOrbitControls(): OrbitControls | null {
    return this.orbitControls;
  }

  getAsciiMosaicFilter(): AsciiMosaicFilter | null {
    return this.asciiMosaicFilter;
  }

  /**
   * Frees a model's geometry, material and texture, and stops its video if
   * it is a one-off (a pooled one stays with the pool). dispose()'s model
   * teardown, also used for a model that arrives after dispose().
   */
  private disposeModel(model: THREE.Object3D): void {
    model.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (obj.material instanceof THREE.Material) {
          if (obj.material instanceof THREE.MeshBasicMaterial && obj.material.map instanceof THREE.VideoTexture) {
            const videoTexture = obj.material.map as THREE.VideoTexture;
            const video = videoTexture.image as HTMLVideoElement;
            if (video && !videoPool.isPooled(video)) {
              video.pause();
              video.src = '';
              video.load();
            }
            videoTexture.dispose();
          } else if (obj.material instanceof THREE.MeshBasicMaterial && obj.material.map) {
            obj.material.map.dispose();
          }
          obj.material.dispose();
        }
      }
    });
  }

  dispose(): void {
    // AsciiCanvas can dispose a mosaic twice: on teardown, then again when
    // the init that built it finds it was superseded. A model still loading
    // at the first call is freed by addModel when it arrives.
    if (this.disposed) return;
    this.disposed = true;
    this.stopAnimate();

    if (this.model) this.disposeModel(this.model);

    if (this.orbitControls) {
      this.orbitControls.dispose();
      this.orbitControls = null;
    }

    this.disableTiltControls();

    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }

    if (this.contextLostHandler) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLostHandler);
      this.contextLostHandler = null;
    }
    if (this.contextRestoredHandler) {
      this.renderer.domElement.removeEventListener('webglcontextrestored', this.contextRestoredHandler);
      this.contextRestoredHandler = null;
    }

    if (this.asciiMosaicFilter) {
      this.asciiMosaicFilter.dispose();
      this.asciiMosaicFilter = null;
    }

    // Remove canvas from DOM before disposing renderer
    const canvas = this.renderer.domElement;
    if (canvas.parentElement) {
      canvas.parentElement.removeChild(canvas);
    }

    this.renderer.dispose();
    // dispose() frees three.js's resources but leaves the context itself to
    // garbage collection; lose it now so its drawing buffer and the browser's
    // context slot are released at once (a theme switch rebuilds canvases).
    // A context the browser already took back (its live-context limit, or a
    // GPU reset) has nothing left to release.
    if (!this.renderer.getContext().isContextLost()) {
      this.renderer.forceContextLoss();
    }
  }
}

