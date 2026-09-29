const DEFAULT_CELL_DEGREES = 1;

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function collectPoints(value, out = []) {
  if (!Array.isArray(value)) return out;
  if (value.length >= 2 && finite(value[0]) !== null && finite(value[1]) !== null) {
    out.push([finite(value[0]), finite(value[1])]);
    return out;
  }
  for (const item of value) collectPoints(item, out);
  return out;
}

export function coarseCellFromPoint(longitude, latitude, cellDegrees = DEFAULT_CELL_DEGREES) {
  const lon = finite(longitude);
  const lat = finite(latitude);
  const size = Number(cellDegrees);
  if (lon === null || lat === null) return null;
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(size) || size <= 0 || size > 10) {
    throw new TypeError('cellDegrees must be greater than 0 and no more than 10');
  }

  const latIndex = Math.floor((lat + 90) / size);
  const lonIndex = Math.floor((lon + 180) / size);
  return 'coarse-grid:' + String(size) + 'deg:' + latIndex + ':' + lonIndex;
}

export function coarseCellFromGeometry(geometry, cellDegrees = DEFAULT_CELL_DEGREES) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return null;
  const points = collectPoints(geometry.coordinates);
  if (!points.length) return null;

  let lonSum = 0;
  let latSum = 0;
  let validCount = 0;
  for (const [lon, lat] of points) {
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) continue;
    lonSum += lon;
    latSum += lat;
    validCount += 1;
  }

  if (!validCount) return null;
  return coarseCellFromPoint(lonSum / validCount, latSum / validCount, cellDegrees);
}
