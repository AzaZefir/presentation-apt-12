import React from "react";
import exportOccupancyToExcel from "../utils/exportOccupancyToExcel.js";

export default function OperatorBar({ onExport, onImport, onReplaceSchemes }) {
  return (
    <div className="operatorBar">
      <div className="operatorLeft">
        <span className="badge on">Оператор: ВКЛ</span>
      </div>

      <div className="operatorRight">
        <button className="btn" onClick={exportOccupancyToExcel}>
          Экспорт в Excel
        </button>
        <button className="btn" onClick={onExport}>
          Экспорт
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
