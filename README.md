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

<earth-wedge way="32965412"></earth-wedge> <!-- fetches an OSM way -->

<script type="module">
  import './index.ts';
  // register the custom element once; every <earth-wedge> on the page shares the WebGL renderer
</script>
```

### Grid example (as used in `demo.html`)

```html
<p>&lt;earth-wedge&gt; uses a single webgl element for the entire page, so you can render a lot of buildings performantly.</p>
<input type="range" id="capitol-grid-slider" min="2" max="7" step="1" value="5" />
<div class="capitol-grid" data-capitol-grid></div>

<script type="module">
  import './index.ts';
  import capitols from './us_capitol_outlines.json';

  const grid = document.querySelector('[data-capitol-grid]');
  const slider = document.querySelector('#capitol-grid-slider');
  const updateColumns = (value) =>
    grid?.style.setProperty('--capitol-columns', Math.max(1, Number(value) || 5));
  slider?.addEventListener('input', (event) => updateColumns(event.target.value));
  updateColumns(slider?.value ?? 5);

  capitols.ways
    .slice()
    .sort((a, b) => (a.state || '').localeCompare(b.state || ''))
    .forEach((way) => {
      const card = document.createElement('div');
      const wedge = document.createElement('earth-wedge');
      const name = way.state || way.description || 'State Capitol';
      wedge.setAttribute('name', name);
      if (way.outline) wedge.setAttribute('outline', JSON.stringify(way.outline));
      else if (way.wayId) wedge.setAttribute('way', String(way.wayId));
      card.appendChild(wedge);
      grid?.appendChild(card);
    });
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
