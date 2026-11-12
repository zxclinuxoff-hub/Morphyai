"use client";

import { MAX_OUTPUT_TOKENS, type Settings } from "@/lib/settings";

interface Props {
  value: Settings;
  onChange: (next: Settings) => void;
  onClose: () => void;
}

export function SettingsPanel({ value, onChange, onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Настройки" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>Настройки</strong>
          <button type="button" className="icon" onClick={onClose}>Закрыть</button>
        </div>

        <label>
          Системный промпт
          <textarea
            rows={5}
            value={value.systemPrompt}
            onChange={(e) => onChange({ ...value, systemPrompt: e.target.value.slice(0, 8000) })}
            placeholder="Например: отвечай кратко и по делу"
          />
        </label>

        <label>
          Temperature: {value.temperature.toFixed(1)}
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={value.temperature}
            onChange={(e) => onChange({ ...value, temperature: Number(e.target.value) })}
          />
        </label>

        <label>
          Макс. токенов в ответе
          <input
            type="number"
            min={256}
            max={MAX_OUTPUT_TOKENS}
            step={512}
            value={value.maxTokens}
            onChange={(e) =>
              onChange({
                ...value,
                maxTokens: Math.min(
                  MAX_OUTPUT_TOKENS,
                  Math.max(256, Math.round(Number(e.target.value) || 4096)),
                ),
              })
            }
          />
        </label>
      </div>
    </div>
  );
}
