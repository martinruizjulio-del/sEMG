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
  onManualPlace,
  smooth,
  onChangeSmooth,
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

      <label className="calc-smooth-toggle">
        <input type="checkbox" checked={smooth} onChange={(e) => onChangeSmooth(e.target.checked)} />
        Suavizado (smoothdata)
      </label>
      {smooth && (
        <p className="calc-hint calc-hint-smooth">
          Se aplica sobre el tramo de tiempo seleccionado, tras el RMS y antes de calcular media/máximo/picos -igual
          que <code>smoothdata()</code> en MATLAB, con ventana automática-.
        </p>
      )}
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
        {calculations.includes("picos") && (
          <button
            type="button"
            className={`calc-chip ${calculations.includes("lapso") ? "is-active" : ""}`}
            onClick={() => toggle("lapso")}
            title="Diferencia entre el pico más tardío y el más temprano de este archivo"
          >
            Lapso
          </button>
        )}
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
              title="Detecta los picos automáticamente y los deja marcados en el gráfico -arrastra un punto para ajustarlo sin borrarlo, clic simple para quitarlo-"
            >
              🎯 Detectar picos
            </button>
          )}
          {onManualPlace && (
            <button
              type="button"
              className="workspace-btn-ghost calc-detect-btn"
              onClick={onManualPlace}
              title="Borra los picos del canal en foco y los deja colocar a mano desde cero, clicando en el gráfico"
            >
              ✏️ Colocar manualmente
            </button>
          )}
        </>
      )}
    </div>
  );
}
