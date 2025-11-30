# EarthWedge

`<earth-wedge>` renders multiple 3D tiles on a single WebGL canvas while making it appear as if each element owns its own viewport. It measures the position of every instance, slices the renderer into scissors, and draws each subject into its region. Instances are coordinated by a singleton manager so you can drop multiple elements into any layout without worrying about renderer setup.

## Usage

```html
<earth-wedge
  name="Statue of Liberty"
  outline='[
    {"lat": 40.6899, "lon": -74.0455},
    {"lat": 40.6899, "lon": -74.0435},
    {"lat": 40.6885, "lon": -74.0435},
    {"lat": 40.6885, "lon": -74.0455}
  ]'
></earth-wedge>

<script type="module">
  import './EarthWedge/index.ts';
</script>
```

Place as many elements as you like. The singleton renderer is injected once (into `.earth-wedge-viewer` if present, otherwise appended to `body`) and is reused by all instances.

## Attributes / properties

- `outline` (required): JSON-encoded array of `{ lat, lon }` objects. Supports `lng`/`longitude` as aliases.
- `way` (optional): OpenStreetMap way id. If present, the element will fetch the way from Overpass, take the convex hull of its outline, and render that region.
- `name` (optional): Friendly label used in logs and diagnostics.
- `outline` property: you can assign an array of `{ lat, lon }` objects directly instead of using the attribute.

## Styling

`earth-wedge` defaults to `display: block`, `width: 100%`, and `aspect-ratio: 1 / 1` so it fills its container. Override these in CSS as needed. The shared renderer is attached to `.earth-wedge-viewer`; you can style that element (e.g., fixed position, pointer-events: none) to control where the canvas lives.

## Implementation notes

- All instances share a single `THREE.WebGLRenderer` with scissor rectangles per element.
- Bounding boxes are observed with `ResizeObserver` and refreshed on scroll/resize.
- Subject loading is delegated to the existing OGC tiles loader; outlines are converted to clip vertices internally.

## Future work

- Expose hooks for supplying custom loaders or renderers.
- Expand attribute set (camera tuning, rotation speed, background handling).
