import { compressToUTF16, decompressFromUTF16 } from "lz-string";
const OCC_KEY = "apt_presentation_occupancy_v1";
const SETTINGS_KEY = "apt_presentation_settings_v1";
const SCHEMES_KEY = "apt_presentation_schemes_override_v1";
export function loadOccupancyMap() {
  try { return JSON.parse(localStorage.getItem(OCC_KEY) || "{}"); }
  catch { return {}; }
}

export function saveOccupancyMap(map) {
  localStorage.setItem(OCC_KEY, JSON.stringify(map));
}

export function makeOccKey(blockId, floor, posKey) {
  return `${blockId}|${floor}|${posKey}`;
}

export function getOccupancy(blockId, floor, posKey) {
  const map = loadOccupancyMap();
  return map[makeOccKey(blockId, floor, posKey)] || null;
}

export function setOccupied(blockId, floor, posKey, fullName) {
  const map = loadOccupancyMap();
  map[makeOccKey(blockId, floor, posKey)] = {
    name: fullName,
    at: new Date().toISOString()
  };
  saveOccupancyMap(map);
}

export function releaseOccupied(blockId, floor, posKey) {
  const map = loadOccupancyMap();
  delete map[makeOccKey(blockId, floor, posKey)];
  saveOccupancyMap(map);
}

export function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); }
  catch { return {}; }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function saveSchemeOverrides(overrides) {
  const packed = compressToUTF16(JSON.stringify(overrides));
  localStorage.setItem(SCHEMES_KEY, packed);
}

export function loadSchemeOverrides() {
  try {
    const packed = localStorage.getItem(SCHEMES_KEY);
    if (!packed) return {};
    const json = decompressFromUTF16(packed);
    return JSON.parse(json || "{}");
  } catch {
    return {};
  }
}
export function buildBackupJson() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    occupancy: loadOccupancyMap(),
    settings: loadSettings(),
    schemesOverride: loadSchemeOverrides()
  };
}

export function restoreFromBackupJson(obj) {
  if (!obj || typeof obj !== "object") throw new Error("Некорректный файл");
  localStorage.setItem(OCC_KEY, JSON.stringify(obj.occupancy || {}));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(obj.settings || {}));
  localStorage.setItem(SCHEMES_KEY, JSON.stringify(obj.schemesOverride || {}));
}
