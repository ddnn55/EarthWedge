import { Vector3 } from 'three';
import { convexHull, getPolygonWinding, latLngToXYZ, normalizePolygonWinding } from './geometry.js';
import { EarthWedgeManager } from './manager';
import type { EarthWedgeOutlinePoint, EarthWedgeSubject, NormalizedOutlinePoint } from './types';

function coerceNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numberValue = typeof value === 'string' ? parseFloat(value) : (value as number);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeOutlinePoint(point: EarthWedgeOutlinePoint): NormalizedOutlinePoint | null {
  const lat =
    coerceNumber(point.lat) ??
    coerceNumber((point as Record<string, unknown>).latitude);
  const lon =
    coerceNumber(point.lon) ??
    coerceNumber(point.lng) ??
    coerceNumber((point as Record<string, unknown>).longitude);

  if (lat === null || lon === null) {
    return null;
  }

  return { lat, lon };
}

export class EarthWedgeElement extends HTMLElement {
  static get observedAttributes() {
    return ['outline', 'name', 'way'];
  }

  private outlinePoints: NormalizedOutlinePoint[] | null = null;
  private manager: EarthWedgeManager | null = null;
  private wayRequestToken: string | null = null;

  connectedCallback() {
    if (!this.manager) {
      this.manager = EarthWedgeManager.getInstance();
    }
    // Provide sensible defaults without stomping user styles.
    if (!this.style.display) {
      this.style.display = 'block';
    }
    if (!this.style.aspectRatio) {
      this.style.aspectRatio = '1 / 1';
    }
    if (!this.style.width) {
      this.style.width = '100%';
    }

    this.syncFromAttributes();
  }

  disconnectedCallback() {
    this.manager?.unregister(this);
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue === newValue) return;
    if (name === 'outline' || name === 'name' || name === 'way') {
      this.syncFromAttributes();
    }
  }

  get outline(): NormalizedOutlinePoint[] | null {
    return this.outlinePoints;
  }

  set outline(value: NormalizedOutlinePoint[] | null) {
    this.outlinePoints = value;
    this.registerWithManager();
  }

  private syncFromAttributes() {
    this.outlinePoints = null;

    const wayId = this.getAttribute('way');
    if (wayId) {
      this.loadWayOutline(wayId);
      return;
    }

    const outlineAttribute = this.getAttribute('outline');
    if (outlineAttribute) {
      try {
        const parsed = JSON.parse(outlineAttribute);
        if (Array.isArray(parsed)) {
          this.outlinePoints = parsed
            .map((point) => normalizeOutlinePoint(point))
            .filter((point): point is NormalizedOutlinePoint => Boolean(point));
        } else {
          console.warn('earth-wedge outline attribute must be a JSON array');
          this.outlinePoints = null;
        }
      } catch (error) {
        console.warn('earth-wedge could not parse outline attribute', error);
        this.outlinePoints = null;
      }
    }

    this.registerWithManager();
  }

  private async loadWayOutline(wayId: string) {
    const requestToken = `${Date.now()}-${wayId}`;
      this.wayRequestToken = requestToken;

    try {
      const query = `[out:json];way(${wayId});(._;>;);out;`;
      const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Overpass request failed with status ${response.status}`);
      }
      const data = await response.json();
      if (this.wayRequestToken !== requestToken) {
        return;
      }

      const wayElement = data.elements?.find((el: any) => el.type === 'way' && String(el.id) === String(wayId));
      if (!wayElement || !Array.isArray(wayElement.nodes)) {
        console.warn('earth-wedge: way not found or has no nodes', wayId);
        return;
      }

      const nodeMap = new Map<string, { lat: number; lon: number }>();
      data.elements
        .filter((el: any) => el.type === 'node')
        .forEach((node: any) => {
          if (typeof node.lat === 'number' && typeof node.lon === 'number') {
            nodeMap.set(String(node.id), { lat: node.lat, lon: node.lon });
          }
        });

      const outline = wayElement.nodes
        .map((nodeId: any) => nodeMap.get(String(nodeId)))
        .filter(Boolean) as NormalizedOutlinePoint[];

      if (outline.length < 3) {
        console.warn('earth-wedge: way outline too small', wayId);
        return;
      }

      this.outlinePoints = outline;
      this.wayRequestToken = null;
      this.registerWithManager();
    } catch (error) {
      if (this.wayRequestToken !== requestToken) return;
      console.warn('earth-wedge: failed to load way', wayId, error);
    }
  }

  private registerWithManager() {
    if (!this.manager) return;
    const subject = this.buildSubject();
    if (!subject) {
      return;
    }
    this.manager.register(this, subject);
  }

  private buildSubject(): EarthWedgeSubject | null {
    if (!this.outlinePoints || this.outlinePoints.length < 3) {
      return null;
    }

    const outlineCopy = this.outlinePoints.map((point) => ({ ...point }));
    const hull = convexHull(outlineCopy);
    const clipVertices = hull.map((point) => {
      const coords = latLngToXYZ(point.lat, point.lon);
      return new Vector3(coords.x, coords.y, coords.z);
    });
    const winding = getPolygonWinding(clipVertices);
    const normalizedClipVertices = winding < 0 ? normalizePolygonWinding(clipVertices) : clipVertices;

    return {
      name: this.getAttribute('name') ?? undefined,
      state: this.getAttribute('name') ?? undefined,
      clipVertices: normalizedClipVertices,
    };
  }
}
