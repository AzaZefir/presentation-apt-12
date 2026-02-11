import * as XLSX from "xlsx";
import { defaultSchemes } from "../schemes/defaultSchemes.js";
import {
  loadSchemeOverrides,
  resolveSchemeKey,
  getSvgText,
} from "../storage.js";

/* =========================================================
   HELPERS
   ========================================================= */

function normalizeText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function parseTranslateY(transform) {
  // transform="translate(0 288.48)" или "translate(2.59 834.81)"
  const m = String(transform || "").match(/translate\(\s*[-\d.]+\s+([-\d.]+)\s*\)/i);
  return m ? Number(m[1]) : null;
}

function tryFloorFromPosKey(posKey) {
  const m = String(posKey || "").match(/^apt_f(\d{1,2})_/i);
  return m ? Number(m[1]) : null;
}

function resolveFloorFallback(posKey, floorStr) {
  const fromPos = tryFloorFromPosKey(posKey);
  if (Number.isFinite(fromPos)) return fromPos;

  const fromKey = Number(floorStr);
  if (Number.isFinite(fromKey) && fromKey > 0) return fromKey;

  return 1;
}

/* =========================================================
   SVG -> (labelMap + floorMap)
   ========================================================= */

/**
 * Возвращает:
 *  - labelMap: rectId -> "2 ком.74.60м2(44кв)"
 *  - floorMap: rectId -> 1..15  (по координате Y)
 */
function buildAptMapsFromSvg(svgText) {
  const labelMap = new Map();
  const floorMap = new Map();

  if (!svgText) return { labelMap, floorMap };

  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return { labelMap, floorMap };

  // 1) Собираем подписи этажей слева: text.cls-3 с transform translate(x y)
  const floorMarks = Array.from(svg.querySelectorAll("text.cls-3"))
    .map((t) => {
      const y = parseTranslateY(t.getAttribute("transform"));
      const floor = Number(normalizeText(t.textContent));
      if (!Number.isFinite(y) || !Number.isFinite(floor)) return null;
      return { floor, y };
    })
    .filter(Boolean);

  // если почему-то классы другие — можно расширить селектор:
  // const floorMarks = ... querySelectorAll("text") ... фильтр по числу 1..40

  // 2) Квартиры: rect[id^="apt_"]
  const rects = Array.from(svg.querySelectorAll("rect[id^='apt_']"));

  for (const rect of rects) {
    const id = rect.getAttribute("id");
    if (!id) continue;

    // ----- LABEL (берём ближайший следующий <text> до следующего <rect>) -----
    let el = rect.nextElementSibling;
    let label = "";

    while (el) {
      const tag = el.tagName?.toLowerCase?.();
      if (tag === "rect") break;
      if (tag === "text") {
        label = normalizeText(el.textContent);
        break;
      }
      el = el.nextElementSibling;
    }

    if (label) labelMap.set(id, label);

    // ----- FLOOR (по y) -----
    const yRect = Number(rect.getAttribute("y"));
    const hRect = Number(rect.getAttribute("height")) || 0;
    const yCenter = Number.isFinite(yRect) ? (yRect + hRect / 2) : null;

    if (Number.isFinite(yCenter) && floorMarks.length) {
      // выбираем floor с ближайшим y (подпись этажа находится по центру полосы)
      let best = floorMarks[0];
      let bestDist = Math.abs(yCenter - best.y);

      for (let i = 1; i < floorMarks.length; i++) {
        const fm = floorMarks[i];
        const d = Math.abs(yCenter - fm.y);
        if (d < bestDist) {
          best = fm;
          bestDist = d;
        }
      }

      floorMap.set(id, best.floor);
    }
  }

  return { labelMap, floorMap };
}

async function loadAptMapsForBlock(blockId) {
  const overrides = loadSchemeOverrides();

  // Берём любой floor (у тебя один SVG на блок, содержащий все этажи)
  const key = resolveSchemeKey({
    kind: "block",
    blockId,
    floor: 1,
    defaults: defaultSchemes,
    overrides,
  });

  const svgText = await getSvgText(key);
  return buildAptMapsFromSvg(svgText);
}

/* =========================================================
   EXPORT
   ========================================================= */

async function exportOccupancyToExcel() {
  const raw = JSON.parse(
    localStorage.getItem("apt_presentation_occupancy_v1") || "{}",
  );

  const keys = Object.keys(raw);
  if (!keys.length) {
    alert("Нет занятых квартир для экспорта");
    return;
  }

  // блоки из данных
  const blockIds = Array.from(new Set(keys.map((k) => k.split("|")[0])));

  // грузим maps для каждого блока
  const mapsByBlock = {}; // blockId -> {labelMap, floorMap}
  for (const b of blockIds) {
    try {
      mapsByBlock[b] = await loadAptMapsForBlock(b);
    } catch {
      mapsByBlock[b] = { labelMap: new Map(), floorMap: new Map() };
    }
  }

  const rows = [];

  for (const key of keys) {
    const [blockId, floorStr, posKey] = key.split("|");
    const item = raw[key];

    const maps = mapsByBlock[blockId] || { labelMap: new Map(), floorMap: new Map() };

    // 1) Самый точный этаж — из SVG по Y
    // 2) fallback — из posKey / floorStr / 1
    const floor =
      maps.floorMap.get(posKey) ??
      resolveFloorFallback(posKey, floorStr);

    const aptLabel =
      maps.labelMap.get(posKey) ||
      posKey;

    rows.push({
      "Блок": blockId,
      "Этаж": Number(floor),
      "Квартира": aptLabel,
      "ФИО": item?.name || "",
      "Дата назначения": item?.at
        ? new Date(item.at).toLocaleString("ru-RU")
        : "",
    });
  }

  rows.sort((a, b) =>
    a.Блок.localeCompare(b.Блок) ||
    a.Этаж - b.Этаж ||
    String(a.Квартира).localeCompare(String(b.Квартира)),
  );

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Занятость квартир");

  const fileName =
    "Занятость_квартир_" +
    new Date().toISOString().slice(0, 10) +
    ".xlsx";

  XLSX.writeFile(wb, fileName);
}

export default exportOccupancyToExcel;
