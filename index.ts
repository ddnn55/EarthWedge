import { EarthWedgeElement } from './EarthWedgeElement';

const tagName = 'earth-wedge';

if (!customElements.get(tagName)) {
  customElements.define(tagName, EarthWedgeElement);
}

export { EarthWedgeElement };
export type { EarthWedgeSubject, EarthWedgeOutlinePoint, NormalizedOutlinePoint } from './types';
