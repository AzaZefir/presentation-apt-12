// App.jsx
import React, { useMemo, useState, useEffect } from "react";
import { BLOCKS, FLOORS } from "./config.js";
import { defaultSchemes } from "./schemes/defaultSchemes.js";
import {
  buildBackupJson,
  restoreFromBackupJson,
  loadSchemeOverrides,
  saveSchemeOverrides,
  getOccupancy,
  setOccupied,
  releaseOccupied,
  loadSettings,
  saveSettings,
  getSvgText,
  resolveSchemeKey,
  collectOccupiedIdsByBlock,
} from "./storage.js";
import { sha256Hex } from "./crypto.js";

import Carousel from "./components/Carousel.jsx";
import SlideFrame from "./components/SlideFrame.jsx";
import SvgPlan from "./components/SvgPlan.jsx";
import Modal from "./components/Modal.jsx";
import OperatorBar from "./components/OperatorBar.jsx";
import SchemeReplace from "./components/SchemeReplace.jsx";

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function floorFromPosKey(posKey) {
  const m = String(posKey).match(/^apt_f(\d{2})_/i);
  return m ? Number(m[1]) : 1;
}

function exportBackup() {
  const name = `backup_${new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, "-")}.json`;
  downloadJson(name, buildBackupJson());
}

function importBackup() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    const txt = await f.text();
    const obj = JSON.parse(txt);
    restoreFromBackupJson(obj);
    alert("Импорт выполнен. Перезагрузите страницу.");
  };
  input.click();
}

function FloorPlan({
  blockId,
  floor,
  operatorEnabled,
  occupiedIds,
  onApartmentClick,
  schemesOverride,
}) {
  const [svgText, setSvgText] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const key = resolveSchemeKey({
        kind: "block",
        blockId,
        floor,
        defaults: defaultSchemes,
        overrides: schemesOverride,
      });
      const txt = await getSvgText(key);
      if (alive) setSvgText(txt);
    })();
    return () => {
      alive = false;
    };
  }, [blockId, floor, schemesOverride]);

  return (
    <SvgPlan
      svgText={svgText}
      occupiedIds={occupiedIds}
      operatorEnabled={operatorEnabled}
      onApartmentClick={onApartmentClick}
    />
  );
}

export default function App() {
  const [slide, setSlide] = useState(0);
  const [presentationMode, setPresentationMode] = useState(false);
  const [presentationIndex, setPresentationIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoMs, setAutoMs] = useState(10000);

  // ✅ Оператор всегда включен (логика логина удалена)
  const operatorEnabled = true;

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignCtx, setAssignCtx] = useState(null);
  const [fullName, setFullName] = useState("");

  const [schemeOpen, setSchemeOpen] = useState(false);

  const [schemesVersion, setSchemesVersion] = useState(0);
  const schemesOverride = useMemo(
    () => loadSchemeOverrides(),
    [schemesVersion],
  );

  const slides = useMemo(() => {
    return [
      { kind: "master", title: "Схема 11 блоков" },
      ...BLOCKS.map((b) => ({ kind: "block", blockId: b.id, title: b.title })),
    ];
  }, []);

  const presentationSlides = useMemo(() => {
    return [
      { kind: "master", title: "Схема 11 блоков" },
      ...BLOCKS.map((b) => ({ kind: "block", blockId: b.id, title: b.title })),
    ];
  }, []);

  const [masterSvgText, setMasterSvgText] = useState("");

  useEffect(() => {
    if (!presentationMode || !autoPlay) return;

    const t = setInterval(() => {
      setPresentationIndex((i) => (i + 1) % presentationSlides.length);
    }, autoMs);

    return () => clearInterval(t);
  }, [presentationMode, autoPlay, autoMs, presentationSlides.length]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const key = resolveSchemeKey({
        kind: "master",
        defaults: defaultSchemes,
        overrides: schemesOverride,
      });
      const txt = await getSvgText(key);
      if (alive) setMasterSvgText(txt);
    })();
    return () => {
      alive = false;
    };
  }, [schemesOverride]);

  function prev() {
    setSlide((s) => Math.max(0, s - 1));
  }
  function next() {
    setSlide((s) => Math.min(slides.length - 1, s + 1));
  }

  useEffect(() => {
    function onKey(e) {
      // если открыт любой модал — не вмешиваемся
      if (assignOpen || schemeOpen) return;

      // ENTER запускает презентацию
      if (!presentationMode && e.key === "Enter") {
        e.preventDefault();
        setPresentationMode(true);
        setPresentationIndex(0);
        return;
      }

      if (presentationMode && e.key === "Escape") {
        e.preventDefault();
        setPresentationMode(false);
        setAutoPlay(false);
        return;
      }

      // Навигация внутри презентации
      if (presentationMode) {
        const len = presentationSlides.length;

        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setPresentationIndex((i) => (i - 1 + len) % len);
        }

        if (e.key === "ArrowRight" || e.key === " ") {
          e.preventDefault();
          setPresentationIndex((i) => (i + 1) % len);
        }

        if (e.key === "a" || e.key === "A") {
          e.preventDefault();
          setAutoPlay((v) => !v);
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presentationMode, presentationSlides.length, assignOpen, schemeOpen]);

  function requestAssign(blockId, _floorIgnored, posKey) {
    const realFloor = floorFromPosKey(posKey);

    const existing = getOccupancy(blockId, realFloor, posKey);
    if (existing) {
      const ok = confirm(
        `Квартира уже занята на имя: ${existing.name}.\nОсвободить?`,
      );
      if (ok) {
        releaseOccupied(blockId, realFloor, posKey);
        setSlide((s) => s);
      }
      return;
    }

    setAssignCtx({ blockId, floor: realFloor, posKey });
    setFullName("");
    setAssignOpen(true);
  }

  function confirmAssign() {
    if (!assignCtx) return;
    if (!fullName.trim()) return;

    setOccupied(
      assignCtx.blockId,
      assignCtx.floor,
      assignCtx.posKey,
      fullName.trim(),
    );

    setAssignOpen(false);
    setAssignCtx(null);
    setSlide((s) => s);
  }

  function replaceSchemes() {
    setSchemeOpen(true);
  }

  function saveScheme({ kind, blockId, floor, svgText }) {
    const over = loadSchemeOverrides();
    over.blocks = over.blocks || {};

    if (kind === "master") {
      over.master = svgText;
    }

    if (kind === "blockDefault") {
      over.blocks[blockId] = over.blocks[blockId] || { floors: {} };
      over.blocks[blockId].default = svgText;
    }

    if (kind === "blockFloor") {
      over.blocks[blockId] = over.blocks[blockId] || { floors: {} };
      over.blocks[blockId].floors = over.blocks[blockId].floors || {};
      over.blocks[blockId].floors[String(floor)] = svgText;
    }

    saveSchemeOverrides(over);
    setSchemesVersion((v) => v + 1);
    alert("Схема сохранена.");
  }

  const current = slides[slide];

  return (
    <div className="app">
      <OperatorBar
        operatorEnabled={operatorEnabled}
        onExport={exportBackup}
        onImport={importBackup}
        onReplaceSchemes={replaceSchemes}
      />

      {presentationMode ? (
        (() => {
          const p = presentationSlides[presentationIndex];

          if (p.kind === "master") {
            return (
              <PresentationOverlay title="Схема 11 блоков">
                <SvgPlan
                  svgText={masterSvgText}
                  occupiedIds={[]}
                  operatorEnabled={false}
                  onApartmentClick={() => {}}
                />
              </PresentationOverlay>
            );
          }

          return (
            <PresentationOverlay title={p.title}>
              <FloorPlan
                blockId={p.blockId}
                floor={1}
                schemesOverride={schemesOverride}
                occupiedIds={collectOccupiedIdsByBlock(p.blockId)}
                operatorEnabled={false}
                onApartmentClick={() => {}}
              />
            </PresentationOverlay>
          );
        })()
      ) : (
        <Carousel
          index={slide}
          count={slides.length}
          onPrev={prev}
          onNext={next}
        >
          {current.kind === "master" && (
            <SlideFrame title="Слайд 0: Схема 11 блоков">
              <SvgPlan
                svgText={masterSvgText}
                occupiedIds={[]}
                operatorEnabled={false}
                onApartmentClick={() => {}}
              />
            </SlideFrame>
          )}

          {current.kind === "block" && (
            <SlideFrame title={`Слайд: ${current.title}`}>
              <div className="floorCard">
                <FloorPlan
                  blockId={current.blockId}
                  floor={1}
                  schemesOverride={schemesOverride}
                  occupiedIds={collectOccupiedIdsByBlock(current.blockId)}
                  operatorEnabled={operatorEnabled}
                  onApartmentClick={(posKey) =>
                    requestAssign(current.blockId, 1, posKey)
                  }
                />
              </div>
            </SlideFrame>
          )}
        </Carousel>
      )}

      <Modal
        open={assignOpen}
        title="Записать квартиру"
        onClose={() => setAssignOpen(false)}
      >
        <div className="formRow">
          <div className="label">ФИО</div>
          <input
            className="input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Например: Иванов Иван Иванович"
          />
        </div>

        {assignCtx && (
          <div className="hint">
            Блок <b>{assignCtx.blockId}</b>, этаж <b>{assignCtx.floor}</b>
          </div>
        )}

        <div className="formActions">
          <button
            className="btn"
            onClick={confirmAssign}
            disabled={!fullName.trim()}
          >
            Сохранить
          </button>
          <button className="btn" onClick={() => setAssignOpen(false)}>
            Отмена
          </button>
        </div>
      </Modal>

      <Modal
        open={schemeOpen}
        title="Заменить SVG (сохранится на этом ноутбуке)"
        onClose={() => setSchemeOpen(false)}
      >
        <SchemeReplace onSave={saveScheme} floors={FLOORS} />
        <div className="hint">
          Важно: квартиры в SVG должны иметь id вида <b>apt_01</b>,{" "}
          <b>apt_02</b> ... чтобы оператор мог кликать по ним.
        </div>
      </Modal>
    </div>
  );
}

function PresentationOverlay({ title, children }) {
  return (
    <div className="pptOverlay">
      <div className="pptTop">
        <div className="pptTitle">{title}</div>
        <div className="pptHint">←/→ или Space • Esc выход • Enter старт</div>
      </div>

      <div className="pptStage">{children}</div>
    </div>
  );
}
