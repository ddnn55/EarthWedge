/**
 * Iteratively calculates average to avoid possible overflow from suming too many large numbers.
 * @param {*} points 
 * @returns Average {x, y, z} of points[]
 */
export default function runningAverage(points) {
    let { x, y, z } = points[0];
    for (let i = 1; i < points.length; i++) {
        x = (i / (i + 1)) * x + (1 / (i + 1)) * points[i].x;
        y = (i / (i + 1)) * y + (1 / (i + 1)) * points[i].y;
        z = (i / (i + 1)) * z + (1 / (i + 1)) * points[i].z;
    }
    return {x, y, z};
}