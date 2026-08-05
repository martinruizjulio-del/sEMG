import "./ModeSwitch.css";

const MODES = [
  { value: "raw", label: "Raw" },
  { value: "filtered", label: "Filtrado" },
  { value: "rms", label: "RMS" },
];

export default function ModeSwitch({ value, onChange }) {
  return (
    <div className="mode-switch" role="radiogroup" aria-label="Modo de visualización">
      {MODES.map((m) => (
        <button
          key={m.value}
          role="radio"
          aria-checked={value === m.value}
          className={`mode-switch-btn ${value === m.value ? "is-active" : ""}`}
          onClick={() => onChange(m.value)}
          type="button"
        >
          {m.label}
        </button>
      ))}
      <span className="mode-switch-thumb" style={{ "--idx": MODES.findIndex((m) => m.value === value) }} />
    </div>
  );
}
