import * as THREE from 'three';

/**
 * OrbitControls 옵션
 */
export interface OrbitControlsOptions {
  /** 최소 거리 */
  minDistance?: number;
  /** 최대 거리 */
  maxDistance?: number;
  /** 회전 속도 */
  rotateSpeed?: number;
  /** 줌 속도 */
  zoomSpeed?: number;
  /** 수직 각도 최소값 (라디안) */
  minPolarAngle?: number;
  /** 수직 각도 최대값 (라디안) */
  maxPolarAngle?: number;
  /** 자동 회전 활성화 */
  autoRotate?: boolean;
  /** 자동 회전 속도 */
  autoRotateSpeed?: number;
  /** 초기 수평 각도 (라디안, 기본값: 카메라 위치에서 계산) */
  initialTheta?: number;
  /** 타겟 위치 (기본값: 카메라가 보고 있는 지점 추정) */
  target?: THREE.Vector3;
  /** 오소 카메라일 때 초기 줌 (복원용) */
  orthoZoom?: number;
}

const ORTHO_ZOOM_MIN = 0.1;
const ORTHO_ZOOM_MAX = 10;

export class OrbitControls {
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private domElement: HTMLElement;
  private target: THREE.Vector3;

  private minDistance: number;
  private maxDistance: number;
  private rotateSpeed: number;
  private zoomSpeed: number;
  private minPolarAngle: number;
  private maxPolarAngle: number;
  private autoRotate: boolean;
  private autoRotateSpeed: number;

  private isMouseDown: boolean = false;
  private mouseX: number = 0;
  private mouseY: number = 0;
  private theta: number = 0;
  private phi: number = Math.PI / 2;
  private distance: number = 5;

  private onMouseDownHandler: (event: MouseEvent) => void;
  private onMouseMoveHandler: (event: MouseEvent) => void;
  private onMouseUpHandler: () => void;
  private onWheelHandler: (event: WheelEvent) => void;

  constructor(
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
    domElement: HTMLElement,
    options: OrbitControlsOptions = {}
  ) {
    this.camera = camera;
    this.domElement = domElement;

    if (options.target) {
      this.target = options.target.clone();
    } else {
      const cameraDirection = new THREE.Vector3();
      this.camera.getWorldDirection(cameraDirection);
      const cameraDistance = this.camera.position.length();
      const estimatedLookAtDistance = cameraDistance > 0.1 ? cameraDistance : 5;
      const estimatedTarget = new THREE.Vector3()
        .copy(this.camera.position)
        .add(cameraDirection.multiplyScalar(estimatedLookAtDistance));
      this.target = estimatedTarget;
    }

    this.minDistance = options.minDistance ?? 2;
    this.maxDistance = options.maxDistance ?? 10;
    this.rotateSpeed = options.rotateSpeed ?? 1.0;
    this.zoomSpeed = options.zoomSpeed ?? 0.1;
    this.minPolarAngle = options.minPolarAngle ?? Math.PI / 6;
    this.maxPolarAngle = options.maxPolarAngle ?? (5 * Math.PI) / 6;
    this.autoRotate = options.autoRotate ?? false;
    this.autoRotateSpeed = options.autoRotateSpeed ?? 1.0;

    if (this.camera instanceof THREE.OrthographicCamera && options.orthoZoom != null) {
      this.camera.zoom = Math.max(ORTHO_ZOOM_MIN, Math.min(ORTHO_ZOOM_MAX, options.orthoZoom));
      this.camera.updateProjectionMatrix();
    }

    const relativePos = new THREE.Vector3()
      .subVectors(this.camera.position, this.target);

    this.distance = relativePos.length();
    if (this.distance < 0.001) {
      this.distance = this.camera.position.length() || 5;
    }

    const normalizedY = relativePos.y / this.distance;
    const clampedY = Math.max(-1, Math.min(1, normalizedY));
    this.phi = Math.acos(clampedY);

    const sinPhi = Math.sin(this.phi);
    if (Math.abs(sinPhi) > 0.001) {
      const calculatedTheta = Math.atan2(relativePos.z, relativePos.x);
      this.theta = options.initialTheta !== undefined ? options.initialTheta : calculatedTheta;
    } else {
      this.theta = options.initialTheta !== undefined ? options.initialTheta : 0;
    }

    this.onMouseDownHandler = this.onMouseDown.bind(this);
    this.onMouseMoveHandler = this.onMouseMove.bind(this);
    this.onMouseUpHandler = this.onMouseUp.bind(this);
    this.onWheelHandler = this.onWheel.bind(this);

    this.domElement.addEventListener('mousedown', this.onMouseDownHandler);
    this.domElement.addEventListener('mousemove', this.onMouseMoveHandler);
    this.domElement.addEventListener('mouseup', this.onMouseUpHandler);
    this.domElement.addEventListener('mouseleave', this.onMouseUpHandler);
    this.domElement.addEventListener('wheel', this.onWheelHandler);

    const originalPosition = this.camera.position.clone();
    this.updateCamera();
    const calculatedPosition = this.camera.position.clone();
    const positionDiff = originalPosition.distanceTo(calculatedPosition);

    if (positionDiff > 0.01) {
      this.camera.position.copy(originalPosition);
      const relativePos2 = new THREE.Vector3()
        .subVectors(this.camera.position, this.target);
      this.distance = relativePos2.length();
      if (this.distance > 0.001) {
        const normalizedY2 = relativePos2.y / this.distance;
        const clampedY2 = Math.max(-1, Math.min(1, normalizedY2));
        this.phi = Math.acos(clampedY2);
        const sinPhi2 = Math.sin(this.phi);
        if (Math.abs(sinPhi2) > 0.001) {
          this.theta = Math.atan2(relativePos2.z, relativePos2.x);
        } else {
          this.theta = options.initialTheta !== undefined ? options.initialTheta : 0;
        }
      }
    } else {
      this.camera.position.copy(originalPosition);
    }
  }

  private onMouseDown(event: MouseEvent): void {
    this.isMouseDown = true;
    this.mouseX = event.clientX;
    this.mouseY = event.clientY;
    this.domElement.style.cursor = 'grabbing';
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.isMouseDown) return;
    const deltaX = event.clientX - this.mouseX;
    const deltaY = event.clientY - this.mouseY;
    this.theta -= (deltaX * this.rotateSpeed * 0.01);
    this.phi += (deltaY * this.rotateSpeed * 0.01);
    this.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this.phi));
    this.mouseX = event.clientX;
    this.mouseY = event.clientY;
    this.updateCamera();
  }

  private onMouseUp(): void {
    this.isMouseDown = false;
    this.domElement.style.cursor = 'grab';
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    if (this.camera instanceof THREE.OrthographicCamera) {
      const delta = event.deltaY > 0 ? -1 : 1;
      this.camera.zoom *= 1 + delta * this.zoomSpeed;
      this.camera.zoom = Math.max(ORTHO_ZOOM_MIN, Math.min(ORTHO_ZOOM_MAX, this.camera.zoom));
      this.camera.updateProjectionMatrix();
    } else {
      const delta = event.deltaY > 0 ? 1 : -1;
      this.distance += delta * this.zoomSpeed;
      this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
      this.updateCamera();
    }
  }

  private updateCamera(): void {
    const x = this.distance * Math.sin(this.phi) * Math.cos(this.theta);
    const y = this.distance * Math.cos(this.phi);
    const z = this.distance * Math.sin(this.phi) * Math.sin(this.theta);
    this.camera.position.set(this.target.x + x, this.target.y + y, this.target.z + z);
    this.camera.lookAt(this.target);
  }

  update(): void {
    if (this.autoRotate) {
      this.theta += this.autoRotateSpeed * 0.01;
      this.updateCamera();
    }
  }

  setTarget(target: THREE.Vector3): void {
    this.target.copy(target);
    this.updateCamera();
  }

  getTarget(): THREE.Vector3 {
    return this.target.clone();
  }

  setDistance(distance: number): void {
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, distance));
    this.updateCamera();
  }

  getDistance(): number {
    return this.distance;
  }

  setTheta(theta: number): void {
    this.theta = theta;
    this.updateCamera();
  }

  getTheta(): number {
    return this.theta;
  }

  setPhi(phi: number): void {
    this.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, phi));
    this.updateCamera();
  }

  getPhi(): number {
    return this.phi;
  }

  setCameraState(
    target: THREE.Vector3,
    distance: number,
    theta: number,
    phi: number,
    orthoZoom?: number
  ): void {
    this.target.copy(target);
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, distance));
    this.theta = theta;
    this.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, phi));
    this.updateCamera();
    if (this.camera instanceof THREE.OrthographicCamera && orthoZoom != null) {
      this.camera.zoom = Math.max(ORTHO_ZOOM_MIN, Math.min(ORTHO_ZOOM_MAX, orthoZoom));
      this.camera.updateProjectionMatrix();
    }
  }

  getCameraState(): {
    target: THREE.Vector3;
    distance: number;
    theta: number;
    phi: number;
    orthoZoom?: number;
  } {
    const state: {
      target: THREE.Vector3;
      distance: number;
      theta: number;
      phi: number;
      orthoZoom?: number;
    } = {
      target: this.target.clone(),
      distance: this.distance,
      theta: this.theta,
      phi: this.phi,
    };
    if (this.camera instanceof THREE.OrthographicCamera) {
      state.orthoZoom = this.camera.zoom;
    }
    return state;
  }

  setAutoRotate(enabled: boolean): void {
    this.autoRotate = enabled;
  }

  dispose(): void {
    this.domElement.removeEventListener('mousedown', this.onMouseDownHandler);
    this.domElement.removeEventListener('mousemove', this.onMouseMoveHandler);
    this.domElement.removeEventListener('mouseup', this.onMouseUpHandler);
    this.domElement.removeEventListener('mouseleave', this.onMouseUpHandler);
    this.domElement.removeEventListener('wheel', this.onWheelHandler);
    this.domElement.style.cursor = '';
  }
}
