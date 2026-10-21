// Research-only Pacific Megathrust Atlas utilities. No alerting, predictive model, or production routing.
// All earthquakes are historical/observed USGS catalog entries. Geographic filters are exploration windows, NOT fault geometry.
export const FEED_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson";
export const WGS_MAP_SERVICE = "https://gis.dnr.wa.gov/site3/rest/services/Geology/Tsunami_Hazard/MapServer";
export const SOURCES = Object.freeze({
  kurilStudy: "https://www.nature.com/articles/s43247-026-03297-2",
  usgs: "https://earthquake.usgs.gov/earthquakes/feed/",
  wgs: WGS_MAP_SERVICE,
  noaa: "https://www.ncei.noaa.gov/products/natural-hazards/tsunamis-earthquakes-volcanoes/tsunamis/global-historical-data"
});
export const ZONES = Object.freeze({
  kuril: { name: "Southwestern Kuril / Nemuro", minLat: 40, maxLat: 61, minLon: 138, maxLon: 168, center: [44.5, 148] },
  cascadia: { name: "Cascadia / Pacific Northwest", minLat: 39, maxLat: 53, minLon: -137, maxLon: -119, center: [46.7, -124] }
});
export const MODELED_WGS_LAYERS = Object.freeze({
  cascadiaInundation: 29,  // M9.0 Cascadia L1 Tsunami Inundation Extent, not a forecast
  evacuationRoutes: 20,   // WA DNR evacuation planning routes
  arrivalTimes: 34        // Scenario-specific modeling, not current wave arrival
});
export function inZone(lat, lon, zoneKey) {
  const b = ZONES[zoneKey];
  return Boolean(b && Number.isFinite(lat) && Number.isFinite(lon) && lat >= b.minLat &&
    lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon);
}
// Reposition eastern hemisphere points across the antimeridian for an ocean-centered view.
export function pacificDisplayLon(lon) {
  if (!Number.isFinite(lon)) return null;
  return lon > 0 ? lon - 360 : lon;
}
export function safeHttpsUrl(value) {
  try { const u = new URL(value); return u.protocol === "https:" ? u.href : null; }
  catch { return null; }
}
// Do not interpolate earthquake catalog events into fault-locking, stress or tsunami predictions.
export function normalizeUsgsFeed(payload, {limit=400}={}) {
  if (!payload || payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
    throw new Error("Invalid USGS GeoJSON FeatureCollection");
  }
  const records=[];
  for (const f of payload.features) {
    const coords=f?.geometry?.coordinates, p=f?.properties;
    if (f?.geometry?.type !== "Point" || !Array.isArray(coords) || coords.length<2 || !p) continue;
    const [lon,lat,depth]=coords, mag=p.mag, time=p.time;
    if (![lon,lat,mag,time].every(Number.isFinite)) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180 || mag < -2 || mag > 10 || time < 0) continue;
    if (p.type && p.type !== "earthquake") continue;
    const id=String(f.id||"").slice(0,100), url=safeHttpsUrl(p.url);
    if (!id || !url) continue;
    const zone = inZone(lat,lon,"kuril") ? "kuril" : inZone(lat,lon,"cascadia") ? "cascadia" : null;
    if (!zone) continue;
    records.push({
      id, lat, lon, displayLon:pacificDisplayLon(lon),
      depthKm: Number.isFinite(depth) && depth>=0 ? depth : null,
      magnitude:mag, time, zone, url,
      place: typeof p.place==="string" ? p.place.slice(0,220) : "USGS earthquake",
      evidenceState:"observed_catalog_event"
    });
  }
  records.sort((a,b)=>b.time-a.time);
  return {generatedAt: Number.isFinite(payload.metadata?.generated) ? payload.metadata.generated : null,
    dataset:"USGS M4.5+ past 7 days", events:records.slice(0,Math.max(0,Math.min(1000,limit)))};
}
export function feedFreshness(generatedAt, nowMs=Date.now(), maxAgeMinutes=180) {
  if (!Number.isFinite(generatedAt) || generatedAt<=0 || generatedAt>nowMs+300000) return "unknown";
  return nowMs-generatedAt <= maxAgeMinutes*60000 ? "recent" : "stale";
}
export function summarize(events) {
  const a=Array.isArray(events)?events:[];
  return {total:a.length,kuril:a.filter(x=>x.zone==="kuril").length,
    cascadia:a.filter(x=>x.zone==="cascadia").length};
}
export function htmlEscape(value) {
  return String(value).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
