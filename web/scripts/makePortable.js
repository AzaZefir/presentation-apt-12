import fs from "fs";
import path from "path";

const root = process.cwd();
const dist = path.join(root, "dist");
const portable = path.join(root, "portable");

if (!fs.existsSync(dist)) {
  console.error("Сначала выполните: npm run build");
  process.exit(1);
}

fs.rmSync(portable, { recursive: true, force: true });
fs.mkdirSync(portable, { recursive: true });

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const s = path.join(src, item);
    const d = path.join(dst, item);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

copyDir(dist, portable);

// Add a tiny README for customer
fs.writeFileSync(path.join(portable, "README.txt"), 
`Как открыть:
1) Откройте файл index.html двойным кликом.
2) Вход оператора: кнопка "Войти", пароль по умолчанию admin123.
3) Экспорт/Импорт - в верхней панели.

Важно:
- Не используйте режим инкогнито.
- Не очищайте данные браузера, иначе занятость исчезнет.`,
"utf-8");

console.log("Готово: web/portable (можно отдавать заказчику)");
