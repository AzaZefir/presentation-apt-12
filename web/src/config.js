export const FLOORS = Array.from({ length: 15 }, (_, i) => i + 1); // 1..15

export const BLOCKS = Array.from({ length: 11 }, (_, i) => ({
  id: `b${String(i + 1).padStart(2, "0")}`,
  title: `Блок ${i + 1}`,
}));

// sha256("admin123")
export const DEFAULT_OPERATOR_PASSWORD_HASH = "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";
