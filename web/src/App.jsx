import React, { useMemo, useState } from "react";
import { BLOCKS, FLOORS, DEFAULT_OPERATOR_PASSWORD_HASH } from "./config.js";
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
} from "./storage.js";
import { sha256Hex } from "./crypto.js";

import Carousel from "./components/Carousel.jsx";
import SlideFrame from "./components/SlideFrame.jsx";
import SvgPlan from "./components/SvgPlan.jsx";
import Modal from "./components/Modal.jsx";
import OperatorBar from "./components/OperatorBar.jsx";

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

export default function App() {
  const [slide, setSlide] = useState(0);

  const [operatorEnabled, setOperatorEnabled] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignCtx, setAssignCtx] = useState(null); // {blockId, floor, posKey}
  const [fullName, setFullName] = useState("");

  const [schemeOpen, setSchemeOpen] = useState(false);

 const [schemesVersion, setSchemesVersion] = useState(0);
const schemesOverride = useMemo(() => loadSchemeOverrides(), [schemesVersion]);

  const schemes = useMemo(() => {
    const merged = JSON.parse(JSON.stringify(defaultSchemes));
    if (schemesOverride.master) merged.master = schemesOverride.master;
    if (schemesOverride.blocks) {
      for (const k of Object.keys(schemesOverride.blocks))
        merged.blocks[k] = schemesOverride.blocks[k];
    }
    return merged;
  }, [schemesOverride]);

  const slides = useMemo(() => {
    return [
      { kind: "master", title: "Схема 11 блоков" },
      ...BLOCKS.map((b) => ({ kind: "block", blockId: b.id, title: b.title })),
    ];
  }, []);

  function prev() {
    setSlide((s) => Math.max(0, s - 1));
  }
  function next() {
    setSlide((s) => Math.min(slides.length - 1, s + 1));
  }

  async function doLogin(password) {
    const settings = loadSettings();
    const savedHash =
      settings.operatorPasswordHash || DEFAULT_OPERATOR_PASSWORD_HASH;
    const h = await sha256Hex(password);
    if (h === savedHash) {
      setOperatorEnabled(true);
      setLoginOpen(false);
      return true;
    }
    return false;
  }

  function logout() {
    setOperatorEnabled(false);
  }

  function requestAssign(blockId, floor, posKey) {
    const existing = getOccupancy(blockId, floor, posKey);
    if (existing) {
      const ok = confirm(
        `Квартира уже занята на имя: ${existing.name}.\nОсвободить?`,
      );
      if (ok) {
        releaseOccupied(blockId, floor, posKey);
        // перерисовка произойдет автоматически через чтение из localStorage при следующем render
        // (для простоты - дернем state)
        setSlide((s) => s);
      }
      return;
    }

    setAssignCtx({ blockId, floor, posKey });
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

  function exportBackup() {
    const name = `backup_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
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

  function replaceSchemes() {
    setSchemeOpen(true);
  }

  function saveScheme(kind, blockId, svgText) {
    const over = loadSchemeOverrides();
    if (kind === "master") {
      over.master = svgText;
    } else {
      over.blocks = over.blocks || {};
      over.blocks[blockId] = svgText;
    }
    saveSchemeOverrides(over);
setSchemesVersion(v => v + 1);
alert("Схема сохранена.");
    alert("Схема сохранена. Перезагрузите страницу.");
  }

  function changePassword() {
    const p = prompt("Новый пароль оператора (запомните его!):");
    if (!p) return;
    sha256Hex(p).then((h) => {
      const s = loadSettings();
      s.operatorPasswordHash = h;
      saveSettings(s);
      alert("Пароль изменён. Перезагрузите страницу.");
    });
  }

  const current = slides[slide];

  return (
    <div className="app">
      <OperatorBar
        operatorEnabled={operatorEnabled}
        onLock={() => (operatorEnabled ? logout() : setLoginOpen(true))}
        onExport={exportBackup}
        onImport={importBackup}
        onReplaceSchemes={replaceSchemes}
      />

      <div className="topActions">
        {operatorEnabled && (
          <button className="btn" onClick={changePassword}>
            Сменить пароль
          </button>
        )}
      </div>

      <Carousel index={slide} count={slides.length} onPrev={prev} onNext={next}>
        {current.kind === "master" && (
          <SlideFrame title="Слайд 0: Схема 11 блоков">
            <div
              className="svgOnly"
              dangerouslySetInnerHTML={{ __html: schemes.master }}
            />
          </SlideFrame>
        )}

        {current.kind === "block" && (
          <SlideFrame title={`Слайд: ${current.title} (этажи 2-15)`}>
            <div className="floorsList">
              {FLOORS.map((floor) => {
                // occupiedIds for this floor and block
                const occupiedIds = [];
                // loadOccupancy each time? ok (small). We'll scan by trying ids apt_01..apt_50 by DOM? Not.
                // We'll just brute: the SVG uses apt_01..apt_04 in placeholder. In real SVG, operator clicks create keys.
                // We'll build occupiedIds by reading localStorage map and filtering prefix.
                const map = JSON.parse(
                  localStorage.getItem("apt_presentation_occupancy_v1") || "{}",
                );
                const prefix = `${current.blockId}|${floor}|`;
                for (const k of Object.keys(map)) {
                  if (k.startsWith(prefix)) {
                    occupiedIds.push(k.slice(prefix.length));
                  }
                }

                return (
                  <div className="floorCard" key={floor}>
                    <div className="floorHeader">Этаж {floor}</div>
                    <SvgPlan
                      svgText={schemes.blocks[current.blockId]}
                      occupiedIds={occupiedIds}
                      operatorEnabled={operatorEnabled}
                      onApartmentClick={(posKey) =>
                        requestAssign(current.blockId, floor, posKey)
                      }
                    />
                  </div>
                );
              })}
            </div>
          </SlideFrame>
        )}
      </Carousel>

      <Modal
        open={loginOpen}
        title="Вход оператора"
        onClose={() => setLoginOpen(false)}
      >
        <LoginForm onLogin={doLogin} />
        <div className="hint">
          Пароль по умолчанию: <b>admin123</b> (после входа можно поменять)
        </div>
      </Modal>

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
            Блок <b>{assignCtx.blockId}</b>, этаж <b>{assignCtx.floor}</b>,
            позиция <b>{assignCtx.posKey}</b>
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
        <SchemeReplace schemes={schemes} onSave={saveScheme} />
        <div className="hint">
          Важно: квартиры в SVG должны иметь id вида <b>apt_01</b>,{" "}
          <b>apt_02</b> ... чтобы оператор мог кликать по ним.
        </div>
      </Modal>
    </div>
  );
}

function LoginForm({ onLogin }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    const ok = await onLogin(pw);
    if (!ok) setErr("Неверный пароль");
  }

  return (
    <div>
      <div className="formRow">
        <div className="label">Пароль</div>
        <input
          className="input"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
      </div>
      {err && <div className="error">{err}</div>}
      <div className="formActions">
        <button className="btn" onClick={submit} disabled={!pw}>
          Войти
        </button>
      </div>
    </div>
  );
}

function SchemeReplace({ schemes, onSave }) {
  const [mode, setMode] = useState("master");
  const [blockId, setBlockId] = useState("b01");

  function pickAndSave() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".svg,image/svg+xml";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const txt = await f.text();
      if (mode === "master") onSave("master", null, txt);
      else onSave("block", blockId, txt);
    };
    input.click();
  }

  return (
    <div>
      <div className="formRow">
        <div className="label">Что заменить</div>
        <select
          className="input"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="master">Генплан (11 блоков)</option>
          <option value="block">Типовой этаж блока</option>
        </select>
      </div>

      {mode === "block" && (
        <div className="formRow">
          <div className="label">Блок</div>
          <select
            className="input"
            value={blockId}
            onChange={(e) => setBlockId(e.target.value)}
          >
            {Array.from(
              { length: 11 },
              (_, i) => `b${String(i + 1).padStart(2, "0")}`,
            ).map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="formActions">
        <button className="btn" onClick={pickAndSave}>
          Выбрать SVG и сохранить
        </button>
      </div>
    </div>
  );
}
