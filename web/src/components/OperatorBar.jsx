import React from "react";
import exportOccupancyToExcel from "../utils/exportOccupancyToExcel.js";

export default function OperatorBar({
  operatorEnabled,
  onLock,
  onExport,
  onImport,
  onReplaceSchemes,
}) {
  return (
    <div className="operatorBar">
      <div className="operatorLeft">
        <span className={operatorEnabled ? "badge on" : "badge"}>
          {operatorEnabled ? "Оператор: ВКЛ" : "Оператор: ВЫКЛ"}
        </span>
        <button className="btn" onClick={onLock}>
          {operatorEnabled ? "Выйти" : "Войти"}
        </button>
      </div>

      <div className="operatorRight">
        <button className="btn" onClick={onExport}>
          Экспорт backup
        </button>
        <button className="btn" onClick={exportOccupancyToExcel}>
          Экспорт в Excel
        </button>
        <button className="btn" onClick={onImport}>
          Импорт
        </button>
        <button className="btn" onClick={onReplaceSchemes}>
          Заменить SVG
        </button>
      </div>
    </div>
  );
}
