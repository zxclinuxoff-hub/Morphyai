// Допущение: формат тела POST /feedback в документации Coarena не подтверждён.
// Здесь он задан в одном месте. Если API ожидает другой формат, правится только эта функция.
export function feedbackBody(p: { model: string; rating: "up" | "down" }): Record<string, unknown> {
  return {
    model: p.model,
    rating: p.rating === "up" ? 1 : -1,
  };
}
