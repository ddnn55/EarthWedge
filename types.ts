import type { Vector3 } from 'three';

export type EarthWedgeOutlinePoint = {
  lat: number;
  lon?: number;
  lng?: number;
  longitude?: number;
  latitude?: number;
};

export type NormalizedOutlinePoint = {
  lat: number;
  lon: number;
};

export type EarthWedgeSubject = {
  name?: string;
  state?: string;
  clipVertices: Vector3[];
};

export type EarthWedgeViewport = {
  left: number;
  bottom: number;
  width: number;
  height: number;
};
