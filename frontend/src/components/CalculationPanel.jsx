import "./CalculationPanel.css";

const GENERAL_CALCS = [
  { value: "media", label: "Media" },
  { value: "maximo", label: "Máximo" },
  { value: "mediana", label: "Mediana" },
  { value: "ratio_bilateral", label: "Ratio bilateral (índice simetría)" },
  { value: "normalizacion", label: "Normalización de activación (%)" },
  { value: "frecuencia", label: "Frecuencia dominante" },
  { value: "fatiga", label: "Fatiga" },
  { value: "orden_activacion", label: "Orden de activación" },
];

export default function CalculationPanel({
  calculations,
  onChangeCalculations,
  peakConfig,
  onChangePeakConfig,
  onDetectPeaks,
}) {
  function toggle(value) {
    if (calculations.includes(value)) {
      onChangeCalculations(calculations.filter((c) => c !== value));
    } else {
      onChangeCalculations([...calculations, value]);
    }
  }

  return (
    <div className="calc-panel">
      <div className="calc-section-label">Opciones generales</div>
      <div className="calc-grid">
        {GENERAL_CALCS.map((c) => (
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
      {(calculations.includes("ratio_bilateral") || calculations.includes("normalizacion") || calculations.includes("orden_activacion")) && (
        <p className="calc-hint">
          {calculations.includes("ratio_bilateral") && (
            <>Ratio bilateral: índice de simetría (siempre entre 0 y 1, 1 = simetría perfecta). Necesita al menos un canal marcado como "Derecho (R)" y otro como "Izquierdo (L)" del mismo músculo, y que Media, Máximo o Mediana también estén marcados. </>
          )}
          {calculations.includes("normalizacion") && (
            <>Normalización: reparte el % entre todos los canales seleccionados para Media, Máximo o Mediana. </>
          )}
          {calculations.includes("orden_activacion") && (
            <>Orden de activación: necesita que "Picos" también esté marcado -usa el primer pico de cada canal para ordenarlos-.</>
          )}
        </p>
      )}

      <div className="calc-section-label calc-section-label-picos">Picos</div>
      <div className="calc-grid">
        <button
          type="button"
          className={`calc-chip ${calculations.includes("picos") ? "is-active" : ""}`}
          onClick={() => toggle("picos")}
        >
          Picos
        </button>
      </div>

      {calculations.includes("picos") && (
        <>
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
          {onDetectPeaks && (
            <button
              type="button"
              className="workspace-btn-ghost calc-detect-btn"
              onClick={onDetectPeaks}
              title="Detecta los picos automáticamente y los muestra en el gráfico para poder ajustarlos a mano, sin guardar todavía"
            >
              🎯 Detectar y ajustar picos
            </button>
          )}
        </>
      )}
    </div>
  );
}
