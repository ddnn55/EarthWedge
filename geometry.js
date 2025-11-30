// Convert latitude/longitude coordinates to XYZ coordinates using WGS84 ellipsoid
export function latLngToXYZ(lat, lng, height = 0) {
    const a = 6378137.0; // WGS84 semi-major axis
    const f = 1/298.257223563; // WGS84 flattening
    const e2 = 2*f - f*f; // First eccentricity squared
    
    const latRad = lat * Math.PI / 180;
    const lngRad = lng * Math.PI / 180;
    
    const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) * Math.sin(latRad));
    
    const x = (N + height) * Math.cos(latRad) * Math.cos(lngRad);
    const y = (N + height) * Math.cos(latRad) * Math.sin(lngRad);
    const z = (N * (1 - e2) + height) * Math.sin(latRad);
    
    return { x, y, z };
}

// Calculate polygon winding order using the shoelace formula
export function getPolygonWinding(vertices) {
    if (vertices.length < 3) return 0;
    
    // Project 3D vertices to 2D plane for winding calculation
    // Use the first three non-collinear vertices to define the plane
    let normal = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < vertices.length - 2; i++) {
        const v1 = vertices[i];
        const v2 = vertices[i + 1];
        const v3 = vertices[i + 2];
        
        // Calculate cross product to get normal
        const edge1 = { x: v2.x - v1.x, y: v2.y - v1.y, z: v2.z - v1.z };
        const edge2 = { x: v3.x - v1.x, y: v3.y - v1.y, z: v3.z - v1.z };
        
        normal.x = edge1.y * edge2.z - edge1.z * edge2.y;
        normal.y = edge1.z * edge2.x - edge1.x * edge2.z;
        normal.z = edge1.x * edge2.y - edge1.y * edge2.x;
        
        // If we found a non-zero normal, break
        const magnitude = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
        if (magnitude > 1e-10) {
            normal.x /= magnitude;
            normal.y /= magnitude;
            normal.z /= magnitude;
            break;
        }
    }
    
    // Choose the best 2D projection plane based on normal
    let signedArea = 0;
    const absNormal = { x: Math.abs(normal.x), y: Math.abs(normal.y), z: Math.abs(normal.z) };
    
    if (absNormal.z >= absNormal.x && absNormal.z >= absNormal.y) {
        // Project to XY plane
        for (let i = 0; i < vertices.length; i++) {
            const j = (i + 1) % vertices.length;
            signedArea += (vertices[j].x - vertices[i].x) * (vertices[j].y + vertices[i].y);
        }
    } else if (absNormal.y >= absNormal.x) {
        // Project to XZ plane
        for (let i = 0; i < vertices.length; i++) {
            const j = (i + 1) % vertices.length;
            signedArea += (vertices[j].x - vertices[i].x) * (vertices[j].z + vertices[i].z);
        }
    } else {
        // Project to YZ plane
        for (let i = 0; i < vertices.length; i++) {
            const j = (i + 1) % vertices.length;
            signedArea += (vertices[j].y - vertices[i].y) * (vertices[j].z + vertices[i].z);
        }
    }
    
    return signedArea;
}

// Normalize polygon winding to counter-clockwise (positive winding)
export function normalizePolygonWinding(vertices) {
    const winding = getPolygonWinding(vertices);
    if (winding < 0) {
        // Clockwise winding, reverse to make counter-clockwise
        return [...vertices].reverse();
    }
    return vertices;
}

// Normalize polygon winding to clockwise (negative winding) - opposite of normalizePolygonWinding
export function normalizePolygonWindingOpposite(vertices) {
    const winding = getPolygonWinding(vertices);
    if (winding > 0) {
        // Counter-clockwise winding, reverse to make clockwise
        return [...vertices].reverse();
    }
    return vertices;
}

// Calculate convex hull of a set of 2D points using Andrew's monotone chain algorithm
export function convexHull(points) {
    if (points.length < 3) return points;

    // Sort points lexicographically (by x, then by y)
    points.sort((a, b) => a.lon === b.lon ? a.lat - b.lat : a.lon - b.lon);

    const cross = (o, a, b) => (a.lon - o.lon) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lon - o.lon);

    const lower = [];
    for (const point of points) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
            lower.pop();
        }
        lower.push(point);
    }

    const upper = [];
    for (let i = points.length - 1; i >= 0; i--) {
        const point = points[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
            upper.pop();
        }
        upper.push(point);
    }

    // Remove the last point of each half because it's repeated at the beginning of the other half
    upper.pop();
    lower.pop();

    return lower.concat(upper);
}