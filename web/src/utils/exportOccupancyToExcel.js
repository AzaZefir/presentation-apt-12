import * as XLSX from "xlsx";
import { defaultSchemes } from "../schemes/defaultSchemes.js";
import { loadSchemeOverrides, resolveSchemeKey, getSvgText } from "../storage.js";

function floorFromPosKey(posKey) {
  const m = String(posKey).match(/^apt_f(\d{2})_/i);
  return m ? Number(m[1]) : 1;
}

// aptId -> "текст внутри tiny"
function buildAptLabelMapFromSvg(svgText) {
  const map = new Map();
  if (!svgText) return map;

  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return map;

  // В твоём SVG: <rect id="apt_..."/> затем сразу <text class="tiny">...</text>
  const elems = Array.from(svg.children);

  for (let i = 0; i < elems.length - 1; i++) {
    const el = elems[i];
    if (el.tagName.toLowerCase() !== "rect") continue;

    const id = el.getAttribute("id");
    if (!id || !id.startsWith("apt_")) continue;

    const next = elems[i + 1];
    if (next?.tagName?.toLowerCase() !== "text") continue;

    const cls = (next.getAttribute("class") || "").trim();
    if (!cls.includes("tiny")) continue;

    const label = (next.textContent || "").trim();
    if (label) map.set(id, label);
  }

  return map;
}

async function loadAptLabelsForBlock(blockId) {
  const overrides = loadSchemeOverrides();

  // floor неважен, потому что у тебя один SVG содержит все этажи
  const key = resolveSchemeKey({
    kind: "block",
    blockId,
    floor: 1,
    defaults: defaultSchemes,
    overrides,
  });

  const svgText = await getSvgText(key);
  return buildAptLabelMapFromSvg(svgText);
}

async function exportOccupancyToExcel() {
  const raw = JSON.parse(
    localStorage.getItem("apt_presentation_occupancy_v1") || "{}",
  );

  const keys = Object.keys(raw);
  if (!keys.length) {
    alert("Нет занятых квартир для экспорта");
    return;
  }

  // ✅ соберём список блоков и для каждого подгрузим map id->label
  const blockIds = Array.from(new Set(keys.map((k) => k.split("|")[0])));
  const labelMaps = {}; // blockId -> Map

  for (const b of blockIds) {
    try {
      labelMaps[b] = await loadAptLabelsForBlock(b);
    } catch {
      labelMaps[b] = new Map();
    }
  }

  const rows = [];

  for (const key of keys) {
    const [blockId, floorStr, aptId] = key.split("|");
    const floor = Number(floorStr) || floorFromPosKey(aptId);
    const item = raw[key];

    const aptLabel = labelMaps[blockId]?.get(aptId) || aptId; // fallback

    rows.push({
      "Блок": blockId,
      "Этаж": Number(floor),
      "Квартира": aptLabel, // ✅ вместо id пишем текст из <text class="tiny">
      "ФИО": item?.name || "",
      "Дата назначения": item?.at
        ? new Date(item.at).toLocaleString("ru-RU")
        : "",
    });
  }

  // сортировка для удобства
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
