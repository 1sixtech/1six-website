import * as THREE from 'three';

/**
 * 모자이크 셀 아틀라스 결과
 */
interface MosaicAtlasResult {
  /** 텍스처 */
  texture: THREE.Texture;
  /** 셀 개수 */
  cellCount: number;
}

/**
 * 모자이크 필터 옵션
 */
export interface AsciiMosaicFilterOptions {
  /** 모자이크 블록 크기 (픽셀 단위) */
  mosaicSize?: number;
  /** 모자이크 셀 텍스처 URL (mosaic_cell.png 이미지 아틀라스 사용) */
  mosaicCellTextureUrl?: string;
  /** 모자이크 셀 아틀라스의 셀 개수 (가로 방향, 1행 N열) */
  cellCount?: number;
  /** 노이즈 강도 (0.0 ~ 1.0, 기본값: 0.0) */
  noiseIntensity?: number;
  /** 노이즈 업데이트 FPS (기본값: 15) */
  noiseFPS?: number;
  /** 노이즈 FPS 랜덤 업데이트 (0~5초, 기본값: 0). 0이면 정확한 간격, 값만큼의 초 단위 랜덤 시간 추가 */
  noiseFPSRandom?: number;
  /** 세트(행) 개수 - 셀 이미지를 나눌 행 개수 (기본값: 1) */
  setCount?: number;
  /** 세트 선택 모드 (기본값: 'first') */
  setSelectionMode?: 'first' | 'random' | 'cycle' | 'offsetRow';
  /** 세트변경(offsetRow) 시 마우스 영향 범위 픽셀 (기본값: 80) */
  offsetRowRadius?: number;
  /** 회피하기: 셀이 마우스를 피해 이동 (기본값: false) */
  avoid?: boolean;
  /** 마우스 영향 범위(픽셀) (기본값: 80) */
  avoidRadius?: number;
  /** 이동 강도 (기본값: 0.15) */
  avoidStrength?: number;
  /** 셀 순서조정: 회피하기 시 z 위치와 알파 디스카드로 순서 조정 (기본값: false) */
  adjustCellOrder?: boolean;
  /** 최소 밝기 (0~100, 기본값: 20) */
  minBrightness?: number;
  /** 최대 밝기 (0~100, 기본값: 80) */
  maxBrightness?: number;
}

/**
 * 모자이크 필터 클래스
 * InstancedMesh로 각 모자이크 셀을 하나의 평면으로 렌더링합니다.
 */
export class AsciiMosaicFilter {
  private renderer: THREE.WebGLRenderer;
  private renderTarget: THREE.WebGLRenderTarget;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private instancedMesh: THREE.InstancedMesh | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private atlasResult!: MosaicAtlasResult;
  private mosaicSize: number;
  private noiseIntensity: number;
  private noiseFPS: number;
  private noiseFPSRandom: number;
  private setCount: number;
  private setSelectionMode: 'first' | 'random' | 'cycle' | 'offsetRow';
  private offsetRowRadius: number;
  /** 세트변경 화면 출입 시 보간 (0~1) */
  private effectiveOffsetRowStrength: number = 0;
  private time: number = 0.0;
  private lastNoiseUpdateTime: number = 0.0;
  /** 다음 노이즈 업데이트 시각 (0이면 아직 미설정) */
  private nextNoiseUpdateTime: number = 0;
  private isEnabled: boolean = false;
  private width: number;
  private height: number;
  private instanceCount: number = 0;
  private maxInstanceCount: number = 0;
  private instanceSampleUVs: Float32Array | null = null;
  private instanceCenterNDCs: Float32Array | null = null;
  private planeGeometry: THREE.PlaneGeometry | null = null;
  private avoid: boolean;
  private avoidRadius: number;
  private avoidStrength: number;
  private adjustCellOrder: boolean;
  private minBrightness: number;
  private maxBrightness: number;
  private mouseX: number = -10000;
  private mouseY: number = -10000;
  private mouseIsInside: boolean = false;
  /** 화면 출입 시 갑작스러운 변화 방지용 보간된 이동 강도 (0 ~ avoidStrength) */
  private effectiveAvoidStrength: number = 0;
  private lastRenderTime: number = 0;
  private mouseMoveBound: ((e: MouseEvent) => void) | null = null;
  private mouseLeaveBound: (() => void) | null = null;
  private mouseEnterBound: (() => void) | null = null;

  private static readonly VERTEX_SHADER = `
    attribute vec2 instanceSampleUV;
    attribute vec2 instanceCenterNDC;
    varying vec2 vSampleUV;
    varying vec2 vLocalUV;
    
    uniform vec2 uMouse;
    uniform vec2 uMousePx;
    uniform vec2 uResolution;
    uniform float uAvoidEnabled;
    uniform float uAvoidRadius;
    uniform float uAvoidStrength;
    uniform float uAdjustCellOrder;
    
    void main() {
      vSampleUV = instanceSampleUV;
      vLocalUV = uv;
      vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      
      vec2 centerPx = vec2((instanceCenterNDC.x + 1.0) * 0.5 * uResolution.x, (1.0 - instanceCenterNDC.y) * 0.5 * uResolution.y);
      float distPx = length(uMousePx - centerPx);
      vec2 toMouse = uMouse - instanceCenterNDC;
      vec2 offset = vec2(0.0);
      if (uAvoidEnabled > 0.5 && uAvoidRadius > 0.0 && distPx < uAvoidRadius && distPx > 0.001) {
        vec2 dir = normalize(toMouse);
        float pushPx = (1.0 - distPx / uAvoidRadius) * uAvoidStrength;
        float lenPx = length(vec2(dir.x * uResolution.x * 0.5, dir.y * uResolution.y * 0.5));
        offset = -dir * pushPx / max(lenPx, 0.001);
      }
      gl_Position.xy += offset;
      
      if (uAdjustCellOrder > 0.5) {
        gl_Position.z = -length(offset) * 0.0001;
      }
    }
  `;

  private static readonly FRAGMENT_SHADER = `
    uniform sampler2D tDiffuse;
    uniform sampler2D tAtlas;
    uniform float uMosaicSize;
    uniform float uCellCount;
    uniform float uRowCount;
    uniform float uSetCount;
    uniform float uSetSelectionMode;
    uniform vec2 uResolution;
    uniform float uNoiseIntensity;
    uniform float uTime;
    uniform vec2 uMouse;
    uniform vec2 uMousePx;
    uniform float uOffsetRowRadius;
    uniform float uEffectiveOffsetRowStrength;
    uniform float uAdjustCellOrder;
    uniform float uMinBrightness;
    uniform float uMaxBrightness;
    
    varying vec2 vSampleUV;
    varying vec2 vLocalUV;
    
    float rgbToBrightness(vec3 color) {
      return dot(color, vec3(0.299, 0.587, 0.114));
    }
    
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }
    
    float noise(vec2 coord, float time) {
      vec2 timeCoord = coord + vec2(time * 0.1, time * 0.15);
      float h = hash(timeCoord);
      return h * 2.0 - 1.0;
    }
    
    void main() {
      vec2 sampleCoord = vSampleUV;
      vec4 color = texture2D(tDiffuse, sampleCoord);
      float brightness = rgbToBrightness(color.rgb);
      float backgroundThreshold = 0.9;
      
      if (brightness >= backgroundThreshold) {
        discard;
      }
      
      vec2 mosaicCoord = floor(vSampleUV * uResolution / uMosaicSize) * uMosaicSize;
      float noiseValue = noise(mosaicCoord, uTime) * uNoiseIntensity;
      float noisyBrightness = brightness + noiseValue;
      noisyBrightness = clamp(noisyBrightness, 0.0, 1.0);
      
      // 최소/최대 밝기 범위로 remap (0~100을 0.0~1.0으로 변환)
      float minBrightnessNorm = uMinBrightness / 100.0;
      float maxBrightnessNorm = uMaxBrightness / 100.0;
      float remappedBrightness = minBrightnessNorm + noisyBrightness * (maxBrightnessNorm - minBrightnessNorm);
      remappedBrightness = clamp(remappedBrightness, 0.0, 1.0);
      
      float invertedBrightness = 1.0 - remappedBrightness;
      float cellIndex = floor(invertedBrightness * uCellCount);
      cellIndex = clamp(cellIndex, 0.0, uCellCount - 1.0);
      
      float selectedRow = 0.0;
      if (uSetSelectionMode < 0.5) {
        selectedRow = 0.0;
      } else if (uSetSelectionMode < 1.5) {
        vec2 timeCoord = mosaicCoord + vec2(uTime * 0.1, uTime * 0.15);
        float rand = hash(timeCoord);
        selectedRow = floor(rand * uSetCount);
      } else if (uSetSelectionMode < 2.5) {
        // 순회: 모든 셀이 같은 세트(열)를 사용하고, 시간에 따라 0 -> 1 -> 2 -> ... 순차 전환
        float timeOffset = floor(uTime * 10.0);
        selectedRow = mod(timeOffset, uSetCount);
      } else {
        // 세트변경(offsetRow): 세트 선택은 첫번째만 고정, 마우스 거리(픽셀)로 행 0~max 결정 (원형 범위)
        // centerPx 계산: mosaicCoord는 픽셀 좌표계이므로 그대로 사용 (회피하기와 동일한 픽셀 좌표계)
        vec2 centerPx = vec2(
          mosaicCoord.x + 0.5 * uMosaicSize,
          uResolution.y - (mosaicCoord.y + 0.5 * uMosaicSize)
        );
        float distPx = length(uMousePx - centerPx);
        float rowFromMouse = 0.0;
        if (uOffsetRowRadius > 0.0 && distPx < uOffsetRowRadius) {
          float t = 1.0 - distPx / uOffsetRowRadius;
          rowFromMouse = floor(t * uSetCount);
          rowFromMouse = clamp(rowFromMouse, 0.0, uSetCount - 1.0);
        }
        // 1->2->3 처럼 정수 행만 전환 (스크롤되지 않도록)
        float stepRow = floor(uEffectiveOffsetRowStrength * (rowFromMouse + 1.0));
        selectedRow = min(stepRow, rowFromMouse);
      }
      selectedRow = clamp(selectedRow, 0.0, uSetCount - 1.0);
      
      float uMin = cellIndex / uCellCount;
      float uMax = (cellIndex + 1.0) / uCellCount;
      float vMin = selectedRow / uRowCount;
      float vMax = (selectedRow + 1.0) / uRowCount;
      
      vec2 atlasUV = vec2(mix(uMin, uMax, vLocalUV.x), mix(vMax, vMin, vLocalUV.y));
      vec4 atlasColor = texture2D(tAtlas, atlasUV);
      
      if (uAdjustCellOrder > 0.5) {
        if (atlasColor.a <= 0.5) {
          discard;
        }
      }
      
      gl_FragColor = atlasColor;
    }
  `;

  constructor(
    renderer: THREE.WebGLRenderer,
    width: number,
    height: number,
    options: AsciiMosaicFilterOptions = {}
  ) {
    this.renderer = renderer;
    this.width = width;
    this.height = height;
    this.mosaicSize = options.mosaicSize ?? 8;
    this.noiseIntensity = options.noiseIntensity ?? 0.0;
    this.noiseFPS = options.noiseFPS ?? 15;
    this.noiseFPSRandom = Math.max(0, Math.min(5, options.noiseFPSRandom ?? 0));
    this.setCount = Math.max(1, options.setCount ?? 1);
    this.setSelectionMode = options.setSelectionMode ?? 'first';
    this.offsetRowRadius = Math.max(0, options.offsetRowRadius ?? 80);
    this.avoid = options.avoid ?? false;
    this.avoidRadius = Math.max(0, options.avoidRadius ?? 80);
    this.avoidStrength = Math.max(0, options.avoidStrength ?? 0.15);
    this.adjustCellOrder = options.adjustCellOrder ?? false;
    this.minBrightness = Math.max(0, Math.min(100, options.minBrightness ?? 20));
    this.maxBrightness = Math.max(0, Math.min(100, options.maxBrightness ?? 80));
    this.lastNoiseUpdateTime = performance.now();

    this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();

    this.initAtlas(options).then(() => {
      this.buildInstancedMesh(width, height);
    });
    
  }

  private async initAtlas(
    options: AsciiMosaicFilterOptions
  ): Promise<void> {
    const textureUrl = options.mosaicCellTextureUrl ?? '/resource/mosaic_cell.png';
    const cellCount = options.cellCount ?? 10;
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load(
      textureUrl,
      () => { texture.needsUpdate = true; },
      undefined,
      (error) => { console.warn('모자이크 셀 텍스처 로딩 실패:', error); }
    );
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    this.atlasResult = { texture, cellCount };
  }

  private getInstanceCount(w: number, h: number, size: number): number {
    const cols = Math.ceil(w / size);
    const rows = Math.ceil(h / size);
    return cols * rows;
  }

  private buildInstancedMesh(w: number, h: number): void {
    const size = this.mosaicSize;
    const count = this.getInstanceCount(w, h, size);
    this.maxInstanceCount = Math.max(this.maxInstanceCount, count);
    this.instanceCount = count;

    this.planeGeometry = new THREE.PlaneGeometry(1, 1);
    this.instanceSampleUVs = new Float32Array(this.maxInstanceCount * 2);
    this.instanceCenterNDCs = new Float32Array(this.maxInstanceCount * 2);

    const cols = Math.ceil(w / size);
    const rows = Math.ceil(h / size);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const idx = j * cols + i;
        const centerX = (i * size + 0.5 * size) / w;
        const centerY = (j * size + 0.5 * size) / h;
        this.instanceSampleUVs![idx * 2] = centerX;
        this.instanceSampleUVs![idx * 2 + 1] = centerY;
        this.instanceCenterNDCs![idx * 2] = centerX * 2 - 1;
        this.instanceCenterNDCs![idx * 2 + 1] = centerY * 2 - 1;
      }
    }

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.renderTarget.texture },
        tAtlas: { value: this.atlasResult.texture },
        uMosaicSize: { value: size },
        uCellCount: { value: this.atlasResult.cellCount },
        uRowCount: { value: this.setCount },
        uSetCount: { value: this.setCount },
        uSetSelectionMode: { value: this.setSelectionMode === 'first' ? 0 : this.setSelectionMode === 'random' ? 1 : this.setSelectionMode === 'cycle' ? 2 : 3 },
        uResolution: { value: new THREE.Vector2(w, h) },
        uNoiseIntensity: { value: this.noiseIntensity },
        uTime: { value: this.time },
        uMouse: { value: new THREE.Vector2(this.mouseX, this.mouseY) },
        uMousePx: { value: new THREE.Vector2(this.mouseX, this.mouseY) },
        uOffsetRowRadius: { value: this.offsetRowRadius },
        uEffectiveOffsetRowStrength: { value: this.effectiveOffsetRowStrength },
        uAvoidEnabled: { value: this.avoid ? 1 : 0 },
        uAvoidRadius: { value: this.avoidRadius },
        uAvoidStrength: { value: this.avoidStrength },
        uAdjustCellOrder: { value: (this.avoid && this.adjustCellOrder) ? 1 : 0 },
        uMinBrightness: { value: this.minBrightness },
        uMaxBrightness: { value: this.maxBrightness },
      },
      vertexShader: AsciiMosaicFilter.VERTEX_SHADER,
      fragmentShader: AsciiMosaicFilter.FRAGMENT_SHADER,
      transparent: true,
      // depthWrite: false,
      // depthTest: true,
      // wireframe: true, // 디버깅: 셀 경계 표시
    });

    const geometry = this.planeGeometry.clone();
    const sampleUVAttr = new THREE.InstancedBufferAttribute(this.instanceSampleUVs!, 2);
    (sampleUVAttr as THREE.BufferAttribute).usage = THREE.DynamicDrawUsage;
    geometry.setAttribute('instanceSampleUV', sampleUVAttr);
    const centerNDCAttr = new THREE.InstancedBufferAttribute(this.instanceCenterNDCs!, 2);
    (centerNDCAttr as THREE.BufferAttribute).usage = THREE.DynamicDrawUsage;
    geometry.setAttribute('instanceCenterNDC', centerNDCAttr);

    this.instancedMesh = new THREE.InstancedMesh(geometry, this.material, this.maxInstanceCount);
    this.instancedMesh.count = this.instanceCount;
    this.instancedMesh.frustumCulled = false;
    this.updateInstanceMatrices(w, h, size);
    this.scene.add(this.instancedMesh);
  }

  private updateInstanceMatrices(w: number, h: number, size: number): void {
    
    if (!this.instancedMesh) return;
    const cols = Math.ceil(w / size);
    const rows = Math.ceil(h / size);
    const scaleX = (size / w) * 2;
    const scaleY = (size / h) * 2;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3(scaleX, scaleY, 1);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const idx = j * cols + i;
        const centerX = (i * size + 0.5 * size) / w;
        const centerY = (j * size + 0.5 * size) / h;
        const ndcX = centerX * 2 - 1;
        const ndcY = centerY * 2 - 1;
        position.x = ndcX;
        position.y = ndcY;
        position.z = 0;
        quat.identity();
        matrix.compose(position, quat, scale);
        this.instancedMesh.setMatrixAt(idx, matrix);
        if (this.instanceCenterNDCs) {
          this.instanceCenterNDCs[idx * 2] = ndcX;
          this.instanceCenterNDCs[idx * 2 + 1] = ndcY;
        }
      }
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    const centerAttr = this.instancedMesh.geometry.attributes.instanceCenterNDC as THREE.InstancedBufferAttribute | undefined;
    if (centerAttr) centerAttr.needsUpdate = true;
  }

  private updateInstanceSampleUVs(w: number, h: number, size: number): void {
    if (!this.instanceSampleUVs || !this.instancedMesh) return;
    const cols = Math.ceil(w / size);
    const rows = Math.ceil(h / size);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const idx = j * cols + i;
        const centerX = (i * size + 0.5 * size) / w;
        const centerY = (j * size + 0.5 * size) / h;
        this.instanceSampleUVs[idx * 2] = centerX;
        this.instanceSampleUVs[idx * 2 + 1] = centerY;
      }
    }
    const attr = this.instancedMesh.geometry.attributes.instanceSampleUV as THREE.InstancedBufferAttribute;
    if (attr) attr.needsUpdate = true;
  }

  private updateMousePosition(e: MouseEvent): void {
    const el = this.renderer.domElement;
    const rect = el.getBoundingClientRect();
    const w = el.width;
    const h = el.height;
    if (w <= 0 || h <= 0) return;
    this.mouseIsInside = true;
    this.mouseX = ((e.clientX - rect.left) / rect.width) * w;
    this.mouseY = ((e.clientY - rect.top) / rect.height) * h;
  }

  private attachMouseListener(): void {
    if (this.mouseMoveBound !== null) return;
    const el = this.renderer.domElement;
    this.mouseIsInside = false;
    // 기본 마우스 위치는 화면 밖 (이동 강도/세트변경이 마우스 들어올 때까지 비활성)
    this.mouseX = -10000;
    this.mouseY = -10000;
    this.mouseMoveBound = (e: MouseEvent) => this.updateMousePosition(e);
    this.mouseLeaveBound = () => { this.mouseIsInside = false; };
    this.mouseEnterBound = () => { this.mouseIsInside = true; };
    el.addEventListener('mousemove', this.mouseMoveBound);
    el.addEventListener('mouseleave', this.mouseLeaveBound);
    el.addEventListener('mouseenter', this.mouseEnterBound);
  }

  /**
   * 마우스 리스너가 필요한지 확인 (회피하기 또는 세트변경이 활성화되어 있는지)
   */
  private needsMouseListener(): boolean {
    return this.avoid || this.setSelectionMode === 'offsetRow';
  }

  /**
   * 마우스 리스너 상태를 업데이트 (필요하면 연결, 불필요하면 제거)
   */
  private updateMouseListenerState(): void {
    if (!this.isEnabled) {
      this.detachMouseListener();
      return;
    }
    if (this.needsMouseListener()) {
      this.attachMouseListener();
    } else {
      this.detachMouseListener();
    }
  }

  private detachMouseListener(): void {
    const el = this.renderer.domElement;
    if (this.mouseMoveBound !== null) {
      el.removeEventListener('mousemove', this.mouseMoveBound);
      this.mouseMoveBound = null;
    }
    if (this.mouseLeaveBound !== null) {
      el.removeEventListener('mouseleave', this.mouseLeaveBound);
      this.mouseLeaveBound = null;
    }
    if (this.mouseEnterBound !== null) {
      el.removeEventListener('mouseenter', this.mouseEnterBound);
      this.mouseEnterBound = null;
    }
  }

  renderToTarget(scene: THREE.Scene, camera: THREE.Camera): void {
    const oldRenderTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(oldRenderTarget);
  }

  render(): void {
    if (!this.material || !this.instancedMesh || !this.atlasResult) return;

    const currentTime = performance.now();
    const minInterval = 1000.0 / this.noiseFPS;
    const shouldUpdate =
      this.nextNoiseUpdateTime === 0 || currentTime >= this.nextNoiseUpdateTime;
    if (shouldUpdate) {
      this.time = currentTime * 0.001;
      this.lastNoiseUpdateTime = currentTime;
      if (this.material) this.material.uniforms.uTime.value = this.time;
      const randomOffset =
        this.noiseFPSRandom > 0
          ? Math.random() * this.noiseFPSRandom * 1000
          : 0;
      this.nextNoiseUpdateTime = currentTime + minInterval + randomOffset;
    }

    this.material.uniforms.tDiffuse.value = this.renderTarget.texture;
    this.material.uniforms.uMosaicSize.value = this.mosaicSize;
    this.material.uniforms.uRowCount.value = this.setCount;
    this.material.uniforms.uSetCount.value = this.setCount;
    this.material.uniforms.uSetSelectionMode.value =
      this.setSelectionMode === 'first' ? 0 : this.setSelectionMode === 'random' ? 1 : this.setSelectionMode === 'cycle' ? 2 : 3;
    const mouseNdcX = (this.mouseX / this.width) * 2 - 1;
    // WebGL NDC 좌표계: y=1이 위, y=-1이 아래 (화면 좌표계와 반대)
    const mouseNdcY = 1.0 - (this.mouseY / this.height) * 2;
    this.material.uniforms.uMouse.value.set(mouseNdcX, mouseNdcY);
    this.material.uniforms.uMousePx.value.set(this.mouseX, this.mouseY);
    this.material.uniforms.uAvoidEnabled.value = this.avoid ? 1 : 0;
    this.material.uniforms.uAvoidRadius.value = this.avoidRadius;
    this.material.uniforms.uOffsetRowRadius.value = this.offsetRowRadius;
    this.material.uniforms.uMinBrightness.value = this.minBrightness;
    this.material.uniforms.uMaxBrightness.value = this.maxBrightness;

    const now = performance.now();
    const deltaSec = this.lastRenderTime > 0 ? (now - this.lastRenderTime) / 1000 : 0.016;
    this.lastRenderTime = now;
    const targetStrength = this.avoid && this.mouseIsInside ? this.avoidStrength : 0;
    const lerpSpeed = 6.0;
    this.effectiveAvoidStrength += (targetStrength - this.effectiveAvoidStrength) * Math.min(1, deltaSec * lerpSpeed);
    this.material.uniforms.uAvoidStrength.value = this.effectiveAvoidStrength;

    const targetOffsetRow = this.setSelectionMode === 'offsetRow' && this.mouseIsInside ? 1 : 0;
    this.effectiveOffsetRowStrength += (targetOffsetRow - this.effectiveOffsetRowStrength) * Math.min(1, deltaSec * lerpSpeed);
    this.material.uniforms.uEffectiveOffsetRowStrength.value = this.effectiveOffsetRowStrength;

    this.renderer.render(this.scene, this.camera);
  }

  isReady(): boolean {
    return !!(this.material && this.instancedMesh && this.atlasResult);
  }

  setSize(width: number, height: number): void {
    this.renderTarget.setSize(width, height);
    this.width = width;
    this.height = height;
    if (this.material) {
      this.material.uniforms.uResolution.value.set(width, height);
    }
    this.setMosaicSize(this.mosaicSize);
  }

  setMosaicSize(size: number): void {
    this.mosaicSize = size;
    const w = this.width;
    const h = this.height;
    const newCount = this.getInstanceCount(w, h, size);

    if (!this.instancedMesh) return;

    if (newCount > this.maxInstanceCount) {
      this.maxInstanceCount = newCount;
      this.instanceSampleUVs = new Float32Array(this.maxInstanceCount * 2);
      this.instanceCenterNDCs = new Float32Array(this.maxInstanceCount * 2);
      const cols = Math.ceil(w / size);
      const rows = Math.ceil(h / size);
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const idx = j * cols + i;
          const centerX = (i * size + 0.5 * size) / w;
          const centerY = (j * size + 0.5 * size) / h;
          this.instanceSampleUVs[idx * 2] = centerX;
          this.instanceSampleUVs[idx * 2 + 1] = centerY;
          this.instanceCenterNDCs[idx * 2] = centerX * 2 - 1;
          this.instanceCenterNDCs[idx * 2 + 1] = centerY * 2 - 1;
        }
      }
      const newGeometry = this.planeGeometry!.clone();
      const newSampleUVAttr = new THREE.InstancedBufferAttribute(this.instanceSampleUVs, 2);
      (newSampleUVAttr as THREE.BufferAttribute).usage = THREE.DynamicDrawUsage;
      newGeometry.setAttribute('instanceSampleUV', newSampleUVAttr);
      const newCenterNDCAttr = new THREE.InstancedBufferAttribute(this.instanceCenterNDCs, 2);
      (newCenterNDCAttr as THREE.BufferAttribute).usage = THREE.DynamicDrawUsage;
      newGeometry.setAttribute('instanceCenterNDC', newCenterNDCAttr);

      this.scene.remove(this.instancedMesh);
      this.instancedMesh.geometry.dispose();
      this.instancedMesh = new THREE.InstancedMesh(newGeometry, this.material!, this.maxInstanceCount);
      this.instancedMesh.frustumCulled = false;
      this.scene.add(this.instancedMesh);
    } else {
      this.updateInstanceSampleUVs(w, h, size);
    }

    this.instanceCount = newCount;
    this.instancedMesh.count = newCount;
    this.updateInstanceMatrices(w, h, size);
  }

  setNoiseIntensity(intensity: number): void {
    this.noiseIntensity = Math.max(0.0, Math.min(1.0, intensity));
    if (this.material) {
      this.material.uniforms.uNoiseIntensity.value = this.noiseIntensity;
    }
  }

  setNoiseFPS(fps: number): void {
    this.noiseFPS = Math.max(1.0, fps);
    this.lastNoiseUpdateTime = performance.now();
    this.nextNoiseUpdateTime = 0;
  }

  setNoiseFPSRandom(random: number): void {
    this.noiseFPSRandom = Math.max(0, Math.min(5, random));
    this.nextNoiseUpdateTime = 0;
  }

  setSetCount(setCount: number): void {
    this.setCount = Math.max(1, setCount);
    if (this.material) {
      this.material.uniforms.uRowCount.value = this.setCount;
      this.material.uniforms.uSetCount.value = this.setCount;
    }
  }

  setSetSelectionMode(mode: 'first' | 'random' | 'cycle' | 'offsetRow'): void {
    this.setSelectionMode = mode;
    if (this.material) {
      this.material.uniforms.uSetSelectionMode.value =
        mode === 'first' ? 0 : mode === 'random' ? 1 : mode === 'cycle' ? 2 : 3;
    }
    if (this.isEnabled) {
      this.updateMouseListenerState();
    }
  }

  setOffsetRowRadius(radius: number): void {
    this.offsetRowRadius = Math.max(0, radius);
    if (this.material) {
      this.material.uniforms.uOffsetRowRadius.value = this.offsetRowRadius;
    }
  }

  setAvoid(enabled: boolean): void {
    this.avoid = enabled;
    if (this.material) {
      this.material.uniforms.uAvoidEnabled.value = enabled ? 1 : 0;
      // uAdjustCellOrder는 회피하기와 셀 순서조정이 모두 활성화되어 있을 때만 1
      this.material.uniforms.uAdjustCellOrder.value = (this.avoid && this.adjustCellOrder) ? 1 : 0;
    }
    if (this.isEnabled) {
      this.updateMouseListenerState();
    }
  }

  setAdjustCellOrder(enabled: boolean): void {
    if (this.adjustCellOrder === enabled) return;
    this.adjustCellOrder = enabled;
    // uniform 값만 업데이트
    if (this.material) {
      this.material.uniforms.uAdjustCellOrder.value = (this.avoid && this.adjustCellOrder) ? 1 : 0;
    }
  }

  setAvoidRadius(radius: number): void {
    this.avoidRadius = Math.max(0, radius);
    if (this.material) {
      this.material.uniforms.uAvoidRadius.value = this.avoidRadius;
    }
  }

  setAvoidStrength(strength: number): void {
    this.avoidStrength = Math.max(0, strength);
    if (this.material) {
      this.material.uniforms.uAvoidStrength.value = this.avoidStrength;
    }
  }

  setMinBrightness(brightness: number): void {
    this.minBrightness = Math.max(0, Math.min(100, brightness));
    if (this.material) {
      this.material.uniforms.uMinBrightness.value = this.minBrightness;
    }
  }

  setMaxBrightness(brightness: number): void {
    this.maxBrightness = Math.max(0, Math.min(100, brightness));
    if (this.material) {
      this.material.uniforms.uMaxBrightness.value = this.maxBrightness;
    }
  }

  getRenderTarget(): THREE.WebGLRenderTarget {
    return this.renderTarget;
  }

  enable(): void {
    this.isEnabled = true;
    this.updateMouseListenerState();
  }

  disable(): void {
    this.detachMouseListener();
    this.isEnabled = false;
  }

  getEnabled(): boolean {
    return this.isEnabled;
  }

  dispose(): void {
    this.detachMouseListener();
    if (this.instancedMesh) {
      this.instancedMesh.geometry.dispose();
      if (this.instancedMesh.material instanceof THREE.Material) {
        this.instancedMesh.material.dispose();
      }
      this.scene.remove(this.instancedMesh);
      this.instancedMesh = null;
    }
    if (this.planeGeometry) {
      this.planeGeometry.dispose();
      this.planeGeometry = null;
    }
    this.renderTarget.dispose();
    if (this.atlasResult?.texture) {
      this.atlasResult.texture.dispose();
    }
    this.material = null;
  }
}
