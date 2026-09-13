const EARTH_RADIUS_M = 6371000
const toRad = (deg) => (deg * Math.PI) / 180

/** Great-circle distance between two [lat, lng] points, in meters. */
export function haversineMeters(a, b) {
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const lat1 = toRad(a[0])
  const lat2 = toRad(b[0])

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Arithmetic mean of [lat, lng] points (good enough at city scale). */
export function centroidOf(points) {
  if (points.length === 0) return null
  const sum = points.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0])
  return [sum[0] / points.length, sum[1] / points.length]
}

/** [minLat, minLng, maxLat, maxLng] of a list of [lat, lng] points. */
export function bboxOf(points) {
  if (points.length === 0) return null
  return points.reduce(
    (box, [lat, lng]) => [
      Math.min(box[0], lat),
      Math.min(box[1], lng),
      Math.max(box[2], lat),
      Math.max(box[3], lng),
    ],
    [Infinity, Infinity, -Infinity, -Infinity]
  )
}

export const METERS_PER_KM = 1000
