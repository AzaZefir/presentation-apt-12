// storage.js
// ВАЖНО: оставь твои существующие buildBackupJson/restoreFromBackupJson/getOccupancy/setOccupied/releaseOccupied/loadSettings/saveSettings
// ниже я добавляю/заменяю только схемы + резолвер + getSvgText.

const SCHEMES_KEY = "apt_presentation_schemes_v2";

// -------------------- Schemes overrides --------------------
export function loadSchemeOverrides() {
  try {
    const raw = localStorage.getItem(SCHEMES_KEY);
    const v = raw ? JSON.parse(raw) : {};

    if (v?.blocks) {
      for (const k of Object.keys(v.blocks)) {
        const val = v.blocks[k];

        // старый формат
        if (typeof val === "string") {
          v.blocks[k] = { default: val, floors: {} };
        }

        // гарантируем floors
        if (!v.blocks[k].floors) {
          v.blocks[k].floors = {};
        }
      }
    }

    return v;
  } catch {
    return {};
  }
}

export function saveSchemeOverrides(over) {
  localStorage.setItem(SCHEMES_KEY, JSON.stringify(over || {}));
}

// svgText может быть и URL ("/schemes/...") и "<svg...>"
export async function getSvgText(svgOrUrl) {
  if (!svgOrUrl) return "";
  const s = String(svgOrUrl).trim();
  if (s.startsWith("<")) return s;
  const r = await fetch(s);
  return await r.text();
}

/**
 * Приоритет выбора:
 * master:
 *  1) override master
 *  2) default master
 *
 * block+floor:
 *  1) override floor
 *  2) override block default
 *  3) default floor (если задана)
 *  4) default block default
 */
export function resolveSchemeKey({ kind, blockId, floor, defaults, overrides }) {
  if (kind === "master") {
    return overrides?.master || defaults?.master || "";
  }

  const oBlock = overrides?.blocks?.[blockId] ?? {};
  const dBlock = defaults?.blocks?.[blockId] ?? {};

  const floorKey = String(floor);

  if (oBlock.floors && oBlock.floors[floorKey]) return oBlock.floors[floorKey];
  if (oBlock.default) return oBlock.default;
  if (dBlock.floors && dBlock.floors[floorKey]) return dBlock.floors[floorKey];

  return dBlock.default || "";
}

// -------------------- Backup --------------------
export function buildBackupJson() {
  const occupancy = JSON.parse(
    localStorage.getItem("apt_presentation_occupancy_v1") || "{}",
  );
  const schemes = loadSchemeOverrides();
  const settings = loadSettings();

  return {
    v: 2,
    occupancy,
    schemes,
    settings,
  };
}

export function restoreFromBackupJson(obj) {
  if (!obj || typeof obj !== "object") return;

  if (obj.occupancy) {
    localStorage.setItem(
      "apt_presentation_occupancy_v1",
      JSON.stringify(obj.occupancy),
    );
  }
  if (obj.schemes) {
    saveSchemeOverrides(obj.schemes);
  }
  if (obj.settings) {
    saveSettings(obj.settings);
  }
}

// -------------------- Occupancy + Settings --------------------
const OCC_KEY = "apt_presentation_occupancy_v1";
const SETTINGS_KEY = "apt_presentation_settings_v1";

export function getOccupancy(blockId, floor, posKey) {
  const map = JSON.parse(localStorage.getItem(OCC_KEY) || "{}");
  return map[`${blockId}|${floor}|${posKey}`] || null;
}

export function setOccupied(blockId, floor, posKey, name) {
  const map = JSON.parse(localStorage.getItem(OCC_KEY) || "{}");
  map[`${blockId}|${floor}|${posKey}`] = { name, at: Date.now() };
  localStorage.setItem(OCC_KEY, JSON.stringify(map));
}

export function releaseOccupied(blockId, floor, posKey) {
  const map = JSON.parse(localStorage.getItem(OCC_KEY) || "{}");
  delete map[`${blockId}|${floor}|${posKey}`];
  localStorage.setItem(OCC_KEY, JSON.stringify(map));
}

export function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s || {}));
}

// ✅ занятые id по ВСЕМ этажам блока (если нужно подсветить блок целиком)
export function collectOccupiedIdsByBlock(blockId) {
  const map = JSON.parse(localStorage.getItem(OCC_KEY) || "{}");
  const ids = [];
  const prefix = `${blockId}|`;
  for (const k of Object.keys(map)) {
    if (k.startsWith(prefix)) {
      const parts = k.split("|");
      const posKey = parts[2];
      if (posKey) ids.push(posKey);
    }
  }
  return ids;
}