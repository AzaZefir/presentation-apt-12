// utils/aptLabelFromSvg.js
export function buildAptLabelMapFromSvg(svgText) {
  const map = new Map();
  if (!svgText) return map;

  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return map;

  // В твоём SVG структура такая:
  // <rect class="apt" id="apt_f01_a01" ... />
  // <text class="tiny" ...>пример</text>
  // то есть подпись идёт СРАЗУ ПОСЛЕ rect
  const nodes = Array.from(svg.childNodes).filter((n) => n.nodeType === 1); // только элементы

  for (let i = 0; i < nodes.length - 1; i++) {
    const el = nodes[i];
    if (el.tagName?.toLowerCase() !== "rect") continue;

    const id = el.getAttribute("id");
    if (!id || !id.startsWith("apt_")) continue;

    const next = nodes[i + 1];
    if (next?.tagName?.toLowerCase() === "text") {
      const cls = (next.getAttribute("class") || "").trim();
      // берём именно tiny (это номер квартиры внутри прямоугольника)
      if (cls.includes("tiny")) {
        const label = (next.textContent || "").trim();
        if (label) map.set(id, label);
      }
    }
  }

  return map;
}
