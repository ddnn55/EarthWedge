import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createLoader } from './ogcTilesClipLoader.js';
import type { EarthWedgeElement } from './EarthWedgeElement';
import type { EarthWedgeSubject, EarthWedgeViewport } from './types';

type Registration = {
  element: EarthWedgeElement;
  subject: EarthWedgeSubject;
  viewport: EarthWedgeViewport;
  resizeObserver: ResizeObserver;
  scene: THREE.Scene | null;
  loading?: Promise<void>;
};

const fixedAspect = 1;
const rotationSpeed = 0.125;
const cameraDistance = 173.2;

export class EarthWedgeManager {
  private static instance: EarthWedgeManager | null = null;

  static getInstance(): EarthWedgeManager {
    if (!EarthWedgeManager.instance) {
      EarthWedgeManager.instance = new EarthWedgeManager();
    }
    return EarthWedgeManager.instance;
  }

  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.OrthographicCamera;
  private readonly controls: OrbitControls;
  private readonly gltfLoader: GLTFLoader;
  private readonly up: THREE.Vector3 = new THREE.Vector3(0, -1, 0);
  private readonly registry = new Map<EarthWedgeElement, Registration>();
  private readonly loaderPromise = createLoader();
  private animationTime = 0;

  private constructor() {
    const container = document.createElement('div');
    container.className = 'earth-wedge-viewer';
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100vw';
    container.style.height = '100vh';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '1';
    document.body.appendChild(container);

    this.renderer = new THREE.WebGLRenderer({ alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.OrthographicCamera(-fixedAspect * 100, fixedAspect * 100, 100, -100, 0.1, 1000);
    this.camera.position.set(100, 100, 100);

    this.gltfLoader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('draco/');
    this.gltfLoader.setDRACOLoader(dracoLoader);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.minPolarAngle = (0 / 4) * Math.PI;
    this.controls.maxPolarAngle = (2 / 4) * Math.PI;
    this.controls.addEventListener('change', () => this.requestLayout());

    window.addEventListener('resize', () => this.handleResize());
    window.addEventListener('scroll', () => this.handleScroll());

    this.animate();
  }

  register(element: EarthWedgeElement, subject: EarthWedgeSubject) {
    let existing = this.registry.get(element);
    if (existing) {
      existing.subject = subject;
      this.loadScene(existing);
      this.updateViewportForElement(existing);
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      const entry = this.registry.get(element);
      if (!entry) return;
      this.updateViewportForElement(entry);
    });
    resizeObserver.observe(element);

    const registration: Registration = {
      element,
      subject,
      viewport: this.measureViewport(element),
      resizeObserver,
      scene: null,
    };

    this.registry.set(element, registration);
    this.loadScene(registration);
    this.requestLayout();
  }

  unregister(element: EarthWedgeElement) {
    const existing = this.registry.get(element);
    if (!existing) return;
    existing.resizeObserver.disconnect();
    this.registry.delete(element);
  }

  private requestLayout() {
    this.updateAllViewports();
  }

  private measureViewport(element: HTMLElement): EarthWedgeViewport {
    const rect = element.getBoundingClientRect();
    return {
      left: Math.floor(rect.left),
      bottom: Math.floor(window.innerHeight - rect.bottom),
      width: Math.floor(rect.width),
      height: Math.floor(rect.height),
    };
  }

  private updateViewportForElement(registration: Registration) {
    registration.viewport = this.measureViewport(registration.element);
  }

  private updateAllViewports() {
    this.registry.forEach((registration) => {
      this.updateViewportForElement(registration);
    });
  }

  private async loadScene(registration: Registration) {
    registration.scene = null;
    registration.loading = (async () => {
      const loader = await this.loaderPromise;
      const loaderResponse = await loader.load(registration.subject);
      if (!loaderResponse) {
        console.warn('earth-wedge: could not load subject', registration.subject.name ?? '');
        return;
      }

      const { tiles, boundingVolumeBox } = loaderResponse;
      const centroid = new THREE.Vector3(boundingVolumeBox[0], boundingVolumeBox[2], boundingVolumeBox[1]);

      const translationGroup = new THREE.Group();
      const rotationGroup = new THREE.Group();
      rotationGroup.add(translationGroup);
      translationGroup.position.set(-centroid.x, -centroid.y, centroid.z);

      const rotation = new THREE.Quaternion();
      rotation.setFromUnitVectors(translationGroup.position.clone().normalize(), this.up);
      rotationGroup.setRotationFromQuaternion(rotation);

      const scene = new THREE.Scene();
      scene.add(rotationGroup);

      if (!tiles.length) {
        registration.scene = scene;
        return;
      }

      let scenePopulated = false;
      tiles.forEach((tile) => {
        this.gltfLoader.load(
          tile.url,
          (gltf) => {
            translationGroup.add(gltf.scene);
            if (!scenePopulated) {
              registration.scene = scene;
              scenePopulated = true;
            }
          },
          undefined,
          (error) => {
            console.warn('earth-wedge: failed to load tile', error);
          }
        );
      });

      registration.scene = scene;
    })();
  }

  private handleResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.requestLayout();
  }

  private handleScroll() {
    this.requestLayout();
  }

  private animate() {
    requestAnimationFrame(() => this.animate());

    this.animationTime += 0.016;
    const angle = this.animationTime * rotationSpeed;
    this.camera.position.x = Math.cos(angle) * cameraDistance;
    this.camera.position.z = Math.sin(angle) * cameraDistance;
    this.camera.position.y = 100;
    this.camera.lookAt(0, 0, 0);

    this.controls.update();

    this.renderer.setScissorTest(false);
    this.renderer.clear(true, true, true);

    this.registry.forEach((registration) => {
      if (!registration.scene) return;
      const viewport = registration.viewport;
      if (viewport.width <= 0 || viewport.height <= 0) return;

      this.renderer.setViewport(viewport.left, viewport.bottom, viewport.width, viewport.height);
      this.renderer.setScissor(viewport.left, viewport.bottom, viewport.width, viewport.height);
      this.renderer.setScissorTest(true);

      this.renderer.render(registration.scene, this.camera);
    });
  }
}
