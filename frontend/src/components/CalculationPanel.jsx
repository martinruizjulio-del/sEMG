import "./CalculationPanel.css";

const CALCS = [
  { value: "media", label: "Media" },
  { value: "maximo", label: "Máximo" },
  { value: "mediana", label: "Mediana" },
  { value: "picos", label: "Picos" },
  { value: "frecuencia", label: "Frecuencia dominante" },
  { value: "fatiga", label: "Fatiga" },
  { value: "ratio_bilateral", label: "Ratio bilateral (R/L)" },
  { value: "normalizacion", label: "Normalización de activación (%)" },
];

export default function CalculationPanel({ calculations, onChangeCalculations, peakConfig, onChangePeakConfig }) {
  function toggle(value) {
    if (calculations.includes(value)) {
      onChangeCalculations(calculations.filter((c) => c !== value));
    } else {
      onChangeCalculations([...calculations, value]);
    }
  }

  return (
    <div className="calc-panel">
      <h3>Cálculos</h3>
      <div className="calc-grid">
        {CALCS.map((c) => (
          <button
            key={c.value}
            type="button"
            className={`calc-chip ${calculations.includes(c.value) ? "is-active" : ""}`}
            onClick={() => toggle(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {calculations.includes("picos") && (
        <div className="peak-config">
          <label>
            Nº de picos
            <input
              type="number"
              min="1"
              value={peakConfig.n_peaks || ""}
              onChange={(e) =>
                onChangePeakConfig({ ...peakConfig, n_peaks: e.target.value ? Number(e.target.value) : null })
              }
              placeholder="auto"
            />
          </label>
          <label>
            Distancia mín. (ms)
            <input
              type="number"
              min="0"
              value={peakConfig.min_peak_distance_ms || ""}
              onChange={(e) =>
                onChangePeakConfig({
                  ...peakConfig,
                  min_peak_distance_ms: e.target.value ? Number(e.target.value) : null,
                })
              }
              placeholder="0"
            />
          </label>
        </div>
      )}
      {(calculations.includes("ratio_bilateral") || calculations.includes("normalizacion")) && (
        <p className="calc-hint">
          {calculations.includes("ratio_bilateral") && (
            <>Ratio bilateral: necesita al menos un canal marcado como "Derecho (R)" y otro como "Izquierdo (L)" del mismo músculo, y que Media, Máximo o Mediana también estén marcados. </>
          )}
          {calculations.includes("normalizacion") && (
            <>Normalización: reparte el % entre todos los canales seleccionados para Media, Máximo o Mediana.</>
          )}
        </p>
      )}
    </div>
  );
}
