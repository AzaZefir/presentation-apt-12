import { useEffect, useRef } from "react";

function paint(el, on, operatorEnabled) {
  if (!el) return;

  const drawables = el.matches("path,rect,polygon,polyline,circle,ellipse")
    ? [el]
    : Array.from(
        el.querySelectorAll("path,rect,polygon,polyline,circle,ellipse"),
      );

  const targets = drawables.length ? drawables : [el];

  for (const t of targets) {
    if (on) {
      t.setAttribute("data-occupied", "1");
      t.style.setProperty("fill", "#ff0d00", "important");
      t.style.setProperty("fill-opacity", "0.55", "important");
      t.style.setProperty("stroke", "#ff3b30", "important");
      t.style.setProperty("stroke-opacity", "0.9", "important");
      t.style.setProperty(
        "cursor",
        operatorEnabled ? "pointer" : "default",
        "important",
      );
    } else {
      t.removeAttribute("data-occupied");
      t.style.removeProperty("fill");
      t.style.removeProperty("fill-opacity");
      t.style.removeProperty("stroke");
      t.style.removeProperty("stroke-opacity");
      t.style.removeProperty("cursor");
    }
  }
}

export default function SvgPlan({
  svgText,
  operatorEnabled,
  onApartmentClick,
  occupiedIds = [],
}) {
  const ref = useRef(null);

  // ✅ клики
  // ✅ клики (ВАЖНО: зависит от svgText, иначе при первом появлении SVG handler не повесится)
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const handler = (e) => {
      if (!operatorEnabled) return;
      const el = e.target?.closest?.('[id^="apt_"], [id^="apt_f"]');
      if (el && root.contains(el)) onApartmentClick?.(el.id);
    };

    root.addEventListener("click", handler);
    return () => root.removeEventListener("click", handler);
  }, [operatorEnabled, onApartmentClick, svgText]);

  // ✅ заставляем SVG вписываться в контейнер
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const svg = root.querySelector("svg");
    if (!svg) return;

    // убираем жёсткие размеры из SVG (у тебя 4096x2383)
    svg.removeAttribute("width");
    svg.removeAttribute("height");

    // если viewBox нет — задаём из исходных размеров (иначе масштабирование ломается)
    if (!svg.getAttribute("viewBox")) {
      svg.setAttribute("viewBox", "0 0 4096 2383");
    }

    // ключевые стили "вписать в контейнер"
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.maxWidth = "100%";
    svg.style.maxHeight = "100%";
    svg.style.display = "block";
    svg.style.objectFit = "contain"; // вписывать целиком
    svg.style.overflow = "visible";
    svg.style.touchAction = "manipulation";
  }, [svgText]);

  // ✅ закраска
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    root
      .querySelectorAll('[data-occupied="1"]')
      .forEach((el) => paint(el, false, operatorEnabled));

    for (const id of occupiedIds) {
      const el = root.querySelector(`#${CSS.escape(id)}`);
      if (el) paint(el, true, operatorEnabled);
    }
  }, [svgText, occupiedIds, operatorEnabled]);

  // ✅ включим кликабельность для apt_*
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.querySelectorAll('[id^="apt_"], [id^="apt_f"]')
      .forEach((el) => (el.style.pointerEvents = "all"));
  }, [svgText]);

  if (!svgText) return <div style={{ padding: 20 }}>Нет схемы…</div>;

  return (
    <div className="planFit">
      <div
        ref={ref}
        className="planSvg"
        dangerouslySetInnerHTML={{ __html: svgText }}
      />
    </div>
  );
}
