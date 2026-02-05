import * as XLSX from "xlsx";

function exportOccupancyToExcel() {
  const raw = JSON.parse(
    localStorage.getItem("apt_presentation_occupancy_v1") || "{}",
  );

  const rows = [];

  for (const key of Object.keys(raw)) {
    const [blockId, floor, aptId] = key.split("|");
    const item = raw[key];

    rows.push({
      "Блок": blockId,
      "Этаж": Number(floor),
      "Квартира": aptId,
      "ФИО": item.name,
      "Дата назначения": item.at
        ? new Date(item.at).toLocaleString("ru-RU")
        : "",
    });
  }

  if (!rows.length) {
    alert("Нет занятых квартир для экспорта");
    return;
  }

  // сортировка для удобства
  rows.sort((a, b) =>
    a.Блок.localeCompare(b.Блок) ||
    a.Этаж - b.Этаж ||
    a.Квартира.localeCompare(b.Квартира),
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