// exportOccupancyToExcel.js
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

function parseTranslateXY(transform) {
  // transform="translate(2.59 834.81)"
  const m = String(transform || "").match(
    /translate\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i,
  );
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

function tryFloorFromPosKey(posKey) {
  // ловим _f15_ / -f15- / f15 / etc — главное чтобы было f + число
  const m = String(posKey || "").match(
    /(?:^|[^a-z0-9])f(\d{1,2})(?:[^a-z0-9]|$)/i,
  );
  if (m) return Number(m[1]);

  // частый кейс: apt_b02_f07_a05
  const m2 = String(posKey || "").match(/_f(\d{1,2})_/i);
  return m2 ? Number(m2[1]) : null;
}

function resolveFloorFallback(posKey, floorStr) {
  const fromPos = tryFloorFromPosKey(posKey);
  if (Number.isFinite(fromPos)) return fromPos;

  const fromKey = Number(floorStr);
  if (Number.isFinite(fromKey) && fromKey > 0) return fromKey;

  return 1;
}

function normalizeAptKey(s) {
  return String(s || "").trim();
}

function makeAliasKeys(blockId, rectId, dataName) {
  const keys = new Set();

  const id = normalizeAptKey(rectId);
  const dn = normalizeAptKey(dataName);

  if (id) keys.add(id);
  if (dn) keys.add(dn);

  // если rectId = apt_f07_a05  -> alias = apt_b02_f07_a05
  if (blockId && id.startsWith("apt_") && !id.startsWith(`apt_${blockId}_`)) {
    keys.add(`apt_${blockId}_${id.slice(4)}`);
  }

  // если posKey = apt_b02_f07_a05, а rectId = apt_f07_a05 — дадим обратный алиас
  if (blockId && id.startsWith(`apt_${blockId}_`)) {
    keys.add(`apt_${id.slice(`apt_${blockId}_`.length)}`);
  }

  // то же самое для data-name
  if (blockId && dn.startsWith("apt_") && !dn.startsWith(`apt_${blockId}_`)) {
    keys.add(`apt_${blockId}_${dn.slice(4)}`);
  }
  if (blockId && dn.startsWith(`apt_${blockId}_`)) {
    keys.add(`apt_${dn.slice(`apt_${blockId}_`.length)}`);
  }

  return Array.from(keys);
}

function isAptLabelTextNode(t) {
  // В BLOK2 подписи = cls-5 и находятся внизу отдельно.
  // Для универсальности берём:
  // 1) class включает cls-5 ИЛИ tiny/label (если вдруг есть)
  // 2) текст похож на "2 ком.74.60м2(49кв)"
  const cls = (t.getAttribute("class") || "").trim();
  const txt = normalizeText(t.textContent);

  const looksLikeApt =
    txt.includes("ком.") && (txt.includes("м2(") || txt.includes("м²("));

  if (!looksLikeApt) return false;

  if (cls.includes("cls-5")) return true;
  if (cls.includes("tiny")) return true;
  if (cls.includes("label")) return true;

  // если класс не распознан — всё равно пропускаем только "похожее на подпись"
  return true;
}

function buildLabelsByGeometry(svg, blockId) {
  // Возвращает map, где ключи — разные алиасы квартиры, значение — подпись
  const rects = Array.from(svg.querySelectorAll("rect[id^='apt_']"))
    .map((r) => {
      const id = r.getAttribute("id");
      const dataName = r.getAttribute("data-name") || "";
      const x = Number(r.getAttribute("x"));
      const y = Number(r.getAttribute("y"));
      const w = Number(r.getAttribute("width"));
      const h = Number(r.getAttribute("height"));
      if (!id || !Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        id,
        dataName,
        x,
        y,
        w: Number.isFinite(w) ? w : 0,
        h: Number.isFinite(h) ? h : 0,
        cx: x + (Number.isFinite(w) ? w : 0) / 2,
        cy: y + (Number.isFinite(h) ? h : 0) / 2,
      };
    })
    .filter(Boolean);

  const labels = Array.from(svg.querySelectorAll("text"))
    .filter(isAptLabelTextNode)
    .map((t) => {
      const tr = parseTranslateXY(t.getAttribute("transform"));
      if (!tr || !Number.isFinite(tr.x) || !Number.isFinite(tr.y)) return null;
      const text = normalizeText(t.textContent);
      if (!text) return null;
      return { x: tr.x, y: tr.y, text };
    })
    .filter(Boolean);

  const map = new Map(); // key(alias) -> label

  for (const lab of labels) {
    // 1) сначала пытаемся найти rect, в который попадает (x,y) текста
    // допуски чуть расширены, потому что baseline текста может быть внутри/ниже
    let hit = rects.find(
      (r) =>
        lab.x >= r.x - 8 &&
        lab.x <= r.x + r.w + 8 &&
        lab.y >= r.y - 20 &&
        lab.y <= r.y + r.h + 60,
    );

    // 2) если не попал — берём ближайший по расстоянию
    if (!hit) {
      let best = null;
      let bestD = Infinity;
      for (const r of rects) {
        const dx = lab.x - r.cx;
        const dy = lab.y - r.cy;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = r;
        }
      }
      hit = best;
    }

    if (!hit) continue;

    const keys = makeAliasKeys(blockId, hit.id, hit.dataName);
    for (const k of keys) {
      if (!map.has(k)) map.set(k, lab.text);
    }
  }

  return map;
}

/* =========================================================
   SVG -> (labelMap + floorMap + entranceMap)
   ========================================================= */

function buildAptMapsFromSvg(svgText, blockId) {
  const labelMap = new Map(); // key -> label
  const floorMap = new Map(); // key -> floor
  const entranceMap = new Map(); // key -> подъезд (1/2)

  if (!svgText) return { labelMap, floorMap, entranceMap };

  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return { labelMap, floorMap, entranceMap };

  // ---------- divider X (для блока 3: линия-разделитель подъездов) ----------
  let dividerX = null;
  const dividerLine = Array.from(svg.querySelectorAll("line")).find((ln) => {
    const x1 = Number(ln.getAttribute("x1"));
    const x2 = Number(ln.getAttribute("x2"));
    return (
      Number.isFinite(x1) && Number.isFinite(x2) && Math.abs(x1 - x2) < 0.001
    );
  });
  if (dividerLine) dividerX = Number(dividerLine.getAttribute("x1"));

  // ---------- floor marks: text с translate(x y) и числом 1..60 ----------
  const floorMarks = Array.from(svg.querySelectorAll("text"))
    .map((t) => {
      const tr = parseTranslateXY(t.getAttribute("transform"));
      if (!tr || !Number.isFinite(tr.y)) return null;

      const txt = normalizeText(t.textContent);
      if (!/^\d{1,2}$/.test(txt)) return null;

      const floor = Number(txt);
      if (!Number.isFinite(floor) || floor < 1 || floor > 60) return null;

      return { floor, y: tr.y };
    })
    .filter(Boolean);

  // ---------- geometry labels (нужно для BLOK2 и похожих) ----------
  // строим один раз на весь SVG
  const geometryLabelMap = buildLabelsByGeometry(svg, blockId);

  // ---------- apartments ----------
  const rects = Array.from(svg.querySelectorAll("rect[id^='apt_']"));

  for (const rect of rects) {
    const rectId = rect.getAttribute("id");
    if (!rectId) continue;

    const dataName = rect.getAttribute("data-name") || "";

    // LABEL:
    // 1) старый способ: ближайший следующий <text> до следующего <rect>
    // 2) если не нашли — берём из геометрического маппинга (BLOK2)
    let el = rect.nextElementSibling;
    let label = "";

    while (el) {
      const tag = el.tagName?.toLowerCase?.();
      if (tag === "rect") break;
      if (tag === "text") {
        const txt = normalizeText(el.textContent);
        // Подписи этажей тоже text, поэтому фильтруем
        if (txt && !(txt.length <= 2 && /^\d{1,2}$/.test(txt))) {
          // если это похоже на подпись квартиры — берём
          if (txt.includes("ком.") || txt.includes("м2(") || txt.includes("м²(")) {
            label = txt;
            break;
          }
        }
      }
      el = el.nextElementSibling;
    }

    // геометрический fallback
    if (!label) {
      label = geometryLabelMap.get(rectId) || "";
    }

    // FLOOR: по y-center + ближайшей отметке
    const yRect = Number(rect.getAttribute("y"));
    const hRect = Number(rect.getAttribute("height")) || 0;
    const yCenter = Number.isFinite(yRect) ? yRect + hRect / 2 : null;

    let bestFloor = null;
    if (Number.isFinite(yCenter) && floorMarks.length) {
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
      bestFloor = best.floor;
    }

    // ENTRANCE (подъезд): по x-center относительно dividerX (только если divider найден)
    const xRect = Number(rect.getAttribute("x"));
    const wRect = Number(rect.getAttribute("width")) || 0;
    const xCenter = Number.isFinite(xRect) ? xRect + wRect / 2 : null;

    const entrance =
      Number.isFinite(dividerX) && Number.isFinite(xCenter)
        ? xCenter < dividerX
          ? 1
          : 2
        : 1;

    // алиасы ключей (чтобы совпадало с posKey из storage)
    const keys = makeAliasKeys(blockId, rectId, dataName);

    for (const k of keys) {
      if (label) labelMap.set(k, label);
      if (Number.isFinite(bestFloor)) floorMap.set(k, bestFloor);
      entranceMap.set(k, entrance);
    }
  }

  return { labelMap, floorMap, entranceMap };
}

async function loadAptMapsForBlock(blockId) {
  const overrides = loadSchemeOverrides();

  // один SVG на блок (все этажи внутри)
  const key = resolveSchemeKey({
    kind: "block",
    blockId,
    floor: 1,
    defaults: defaultSchemes,
    overrides,
  });

  const svgText = await getSvgText(key);
  return buildAptMapsFromSvg(svgText, blockId);
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
  const mapsByBlock = {}; // blockId -> {labelMap, floorMap, entranceMap}
  for (const b of blockIds) {
    try {
      mapsByBlock[b] = await loadAptMapsForBlock(b);
    } catch {
      mapsByBlock[b] = {
        labelMap: new Map(),
        floorMap: new Map(),
        entranceMap: new Map(),
      };
    }
  }

  const rows = [];

  for (const key of keys) {
    const [blockId, floorStr, posKey] = key.split("|");
    const item = raw[key];

    const maps = mapsByBlock[blockId] || {
      labelMap: new Map(),
      floorMap: new Map(),
      entranceMap: new Map(),
    };

    const floor =
      maps.floorMap.get(posKey) ?? resolveFloorFallback(posKey, floorStr);

    const entrance = maps.entranceMap?.get(posKey) ?? 1;

    const aptLabel = maps.labelMap.get(posKey) || posKey;

    rows.push({
      "Блок": blockId,
      "Подъезд": blockId === "b03" ? Number(entrance) : "",
      "Этаж": Number(floor),
      "Квартира": aptLabel,
      "ФИО": item?.name || "",
      "Дата назначения": item?.at
        ? new Date(item.at).toLocaleString("ru-RU")
        : "",
    });
  }

  rows.sort(
    (a, b) =>
      a.Блок.localeCompare(b.Блок) ||
      Number(a.Подъезд || 0) - Number(b.Подъезд || 0) ||
      a.Этаж - b.Этаж ||
      String(a.Квартира).localeCompare(String(b.Квартира)),
  );

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Занятость квартир");

  const fileName =
    "Занятость_квартир_" + new Date().toISOString().slice(0, 10) + ".xlsx";

  XLSX.writeFile(wb, fileName);
}

export default exportOccupancyToExcel;
