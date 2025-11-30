import { Cartesian3, Plane, Intersect, Matrix3, OrientedBoundingBox, Cartographic, Math as CesiumMath } from 'cesium';
import runningAverage from './running_average';
import { cesiumToken, googleToken } from './secrets';

// needed? should eventually remove Cesium dependency entirely
// Cesium.Ion.defaultAccessToken = cesiumToken;
// Cesium.GoogleMaps.defaultApiKey = googleToken;

const MAX_GEOMETRIC_ERROR = 1;




function respectsMaxGeometricError(tile) {
    return tile.geometricError <= MAX_GEOMETRIC_ERROR;
}

function isLeaf(tile) {
    if (tile.children && tile.children.length) {
        return false;
    }
    if (tile.content && tile.content.uri.indexOf('.json') > -1) {
        return false;
    }
    return true;
}

export async function createLoader() {

    const res = await fetch('https://tile.googleapis.com/v1/3dtiles/root.json?key=' + googleToken);
    const rootData = await res.json();

    let session = null;

    return {
        async load(subject, { onVisitTile = () => {} } = {}) {
            if(!subject.clipVertices || subject.clipVertices.length < 3) {
                console.warn('Subject does not have enough clip vertices, skipping:', subject.state);
                return;
            }
            const clipVerticesCentroid = runningAverage(subject.clipVertices);
            const direction = new Cartesian3(clipVerticesCentroid.x, clipVerticesCentroid.y, clipVerticesCentroid.z);
            const halfEarthPlaneNormal = new Cartesian3();
            Cartesian3.normalize(direction, halfEarthPlaneNormal);
            const halfEarthPlane = new Plane(halfEarthPlaneNormal, 0);

            const tiles = [];
            let frontier = rootData.root.children.concat([]); // make a copy

            while (frontier.length) {
                // console.log('frontier', frontier);
                // console.log('tiles', tiles);
                const frontierTile = frontier.shift();
                // console.log(frontierTile)
                onVisitTile(frontierTile);
                if (respectsMaxGeometricError(frontierTile) || isLeaf(frontierTile)) {
                    if (intersectsSubject(frontierTile)) {
                        tiles.push(frontierTile);
                    }
                }
                else {
                    const childrenOfInterest = (await getChildren(frontierTile)).filter(intersectsSubject);
                    frontier = frontier.concat(childrenOfInterest);
                }
            }

            // console.log(`Found ${tiles.length} tiles intersecting subject ${subject.state}`);

            // Calculate combined bounding volume from all tiles
            const allCorners = [];
            tiles.forEach(tile => {
                const box = tile.boundingVolume.box;
                // Each box is an array of 12 numbers: [cx, cy, cz, hx, hy, hz, ux, uy, uz, wx, wy, wz]
                const [cx, cy, cz, hx, hy, hz, ux, uy, uz, wx, wy, wz] = box;
                const center = new Cartesian3(cx, cy, cz);
                const halfAxes = [
                    new Cartesian3(hx, hy, hz),
                    new Cartesian3(ux, uy, uz),
                    new Cartesian3(wx, wy, wz)
                ];

                // 8 corners: all combinations of +/- half-axes
                for (let dx of [-1, 1]) {
                    for (let dy of [-1, 1]) {
                        for (let dz of [-1, 1]) {
                            const corner = Cartesian3.clone(center);
                            Cartesian3.add(
                                corner,
                                Cartesian3.multiplyByScalar(halfAxes[0], dx, new Cartesian3()),
                                corner
                            );
                            Cartesian3.add(
                                corner,
                                Cartesian3.multiplyByScalar(halfAxes[1], dy, new Cartesian3()),
                                corner
                            );
                            Cartesian3.add(
                                corner,
                                Cartesian3.multiplyByScalar(halfAxes[2], dz, new Cartesian3()),
                                corner
                            );
                            allCorners.push(corner);
                        }
                    }
                }
            });

            // Calculate axis-aligned bounding box from all corners
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
            
            allCorners.forEach(corner => {
                minX = Math.min(minX, corner.x);
                minY = Math.min(minY, corner.y);
                minZ = Math.min(minZ, corner.z);
                maxX = Math.max(maxX, corner.x);
                maxY = Math.max(maxY, corner.y);
                maxZ = Math.max(maxZ, corner.z);
            });

            // Create combined bounding volume box
            const combinedCenter = new Cartesian3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
            const combinedHalfExtents = [
                (maxX - minX) / 2, 0, 0,  // X half-axis
                0, (maxY - minY) / 2, 0,  // Y half-axis  
                0, 0, (maxZ - minZ) / 2   // Z half-axis
            ];
            const combinedBoundingVolumeBox = [
                combinedCenter.x, combinedCenter.y, combinedCenter.z,
                ...combinedHalfExtents
            ];

            // Calculate height range from cartographic corners
            const cartographicCorners = allCorners.map(corner => {
                const carto = Cartographic.fromCartesian(corner);
                return {
                    latitude: CesiumMath.toDegrees(carto.latitude),
                    longitude: CesiumMath.toDegrees(carto.longitude),
                    height: carto.height
                };
            });

            const allHeights = cartographicCorners.map(corner => corner.height);
            const minHeight = allHeights.length > 0 ? Math.min(...allHeights) : 0;
            const maxHeight = allHeights.length > 0 ? Math.max(...allHeights) : 0;

            return {
                tiles: tiles.map(tile => {
                if (tile && tile.content && tile.content.uri) {
                    return ({ url: resolveContentUri(tile.content.uri).href });
                }
                else {
                    debugger;
                }
            }),
                boundingVolumeBox: combinedBoundingVolumeBox,
                cartographicCorners,
                heightRange: { minHeight, maxHeight }
            };

            /**
             * 
             * @param {*} contentUri 
             * @returns {URL}
             */
            function resolveContentUri(contentUri) {
                const url = new URL('https://tile.googleapis.com' + contentUri);
                url.searchParams.set('key', googleToken);
                if (session) {
                    url.searchParams.set('session', session);
                }
                else {
                    session = url.searchParams.get('session');
                }
                return url;
            }

            function intersectsSubject(child) {
                const childCenter = new Cartesian3();
                const childHalfAxes = new Matrix3();
                const childObb = new OrientedBoundingBox(
                    Cartesian3.fromArray(
                        child.boundingVolume.box,
                        0,
                        childCenter
                    ),
                    Matrix3.fromArray(child.boundingVolume.box, 3, childHalfAxes)
                );
                if (childObb.intersectPlane(halfEarthPlane) === Intersect.OUTSIDE) {
                    return false;
                }
                for (let i = 0; i < subject.clipVertices.length; i++) {
                    const direction = new Cartesian3();
                    const normal = new Cartesian3();
                    Cartesian3.cross(
                        subject.clipVertices[(i + 1) % subject.clipVertices.length],
                        subject.clipVertices[i],
                        direction
                    );
                    
                    // Check if direction vector has sufficient magnitude for normalization
                    const magnitude = Cartesian3.magnitude(direction);
                    if (magnitude < CesiumMath.EPSILON7) {
                        // Skip this edge if vertices are too close (collinear or duplicate)
                        continue;
                    }
                    
                    Cartesian3.normalize(direction, normal)
                    const plane = new Plane(normal, 0);
                    const intersection = childObb.intersectPlane(plane);
                    // possibilities are
                    // Intersect.INSIDE
                    // Intersect.INTERSECTING
                    // Intersect.OUTSIDE
                    if (intersection === Intersect.OUTSIDE) {
                        return false;
                    }
                }
                return true;
            }

            /**
             * 
             * @param {*} tile non-leaf OGC 3D tiles 
             */
            async function getChildren(tile) {
                if (tile.children) {
                    // console.log(tile)
                    return tile.children.concat([]); // make a copy
                }
                else {
                    const requestUrl = resolveContentUri(tile.content.uri);
                    const response = await fetch(requestUrl);
                    const responseData = await response.json();

                    // 2nd case is maybe not *really* a "child", it's more like a resolved reference,
                    // but this fixes a bug
                    return responseData.root.children || [responseData.root];
                }
            }
        }
    };


}