// components/SchemeReplace.jsx
import React, { useState } from "react";

export default function SchemeReplace({ onSave, floors = [] }) {
  const [mode, setMode] = useState("master");
  const [blockId, setBlockId] = useState("b01");
  const [floor, setFloor] = useState(floors?.[0] ?? 1);

  function pickAndSave() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".svg,image/svg+xml";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const txt = await f.text();

      if (mode === "master") onSave({ kind: "master", svgText: txt });
      if (mode === "blockDefault")
        onSave({ kind: "blockDefault", blockId, svgText: txt });
      if (mode === "blockFloor")
        onSave({
          kind: "blockFloor",
          blockId,
          floor: Number(floor),
          svgText: txt,
        });
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
          <option value="blockDefault">Типовая схема блока</option>
          <option value="blockFloor">Схема конкретного этажа</option>
        </select>
      </div>

      {(mode === "blockDefault" || mode === "blockFloor") && (
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

      {mode === "blockFloor" && (
        <div className="formRow">
          <div className="label">Этаж</div>

          {floors?.length ? (
            <select
              className="input"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
            >
              {floors.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="input"
              type="number"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
            />
          )}
        </div>
      )}

      <div className="formActions">
        <button className="btn" onClick={pickAndSave}>
          Выбрать SVG и сохранить
        </button>
      </div>

      <div className="hint" style={{ marginTop: 10 }}>
        Поддерживаются 3 уровня: master, типовая блока, этажная (блок+этаж).
      </div>
    </div>
  );
}
