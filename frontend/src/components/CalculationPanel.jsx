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
  peakWindowConfig,
  onChangePeakWindowConfig,
  timeBinsConfig,
  onChangeTimeBinsConfig,
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
        {calculations.includes("picos") && (
          <button
            type="button"
            className={`calc-chip ${calculations.includes("picos_ventana") ? "is-active" : ""}`}
            onClick={() => toggle("picos_ventana")}
            title="Media y máximo en una ventana de tiempo antes y/o después de cada pico"
          >
            Ventana por pico
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

          {calculations.includes("picos_ventana") && peakWindowConfig && (
            <div className="peak-window-config">
              <label className="peak-window-margins">
                Márgenes (ms), separados por comas
                <input
                  type="text"
                  value={peakWindowConfig.marginsText}
                  onChange={(e) => onChangePeakWindowConfig({ ...peakWindowConfig, marginsText: e.target.value })}
                  placeholder="25, 50, 100"
                />
              </label>
              <div className="peak-window-sides">
                <label>
                  <input
                    type="checkbox"
                    checked={peakWindowConfig.before}
                    onChange={(e) => onChangePeakWindowConfig({ ...peakWindowConfig, before: e.target.checked })}
                  />
                  Antes del pico
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={peakWindowConfig.after}
                    onChange={(e) => onChangePeakWindowConfig({ ...peakWindowConfig, after: e.target.checked })}
                  />
                  Después del pico
                </label>
              </div>
              <p className="calc-hint">
                Para cada pico y cada margen, se calcula la media y el máximo de activación en esa ventana -p.ej. con
                "25, 50" y ambos lados marcados, obtienes 8 valores por pico (4 antes, 4 después).
              </p>
            </div>
          )}
        </>
      )}

      <div className="calc-section-label calc-section-label-picos">Evolución temporal</div>
      <div className="calc-grid">
        <button
          type="button"
          className={`calc-chip ${calculations.includes("tramos") ? "is-active" : ""}`}
          onClick={() => toggle("tramos")}
          title="Divide el tramo analizado en partes iguales y calcula media/máximo por cada una"
        >
          Tramos
        </button>
      </div>

      {calculations.includes("tramos") && timeBinsConfig && (
        <div className="time-bins-config">
          <div className="time-bins-mode">
            <label>
              <input
                type="radio"
                name="time-bins-mode"
                checked={timeBinsConfig.mode === "count"}
                onChange={() => onChangeTimeBinsConfig({ ...timeBinsConfig, mode: "count" })}
              />
              Nº de tramos
            </label>
            <label>
              <input
                type="radio"
                name="time-bins-mode"
                checked={timeBinsConfig.mode === "duration"}
                onChange={() => onChangeTimeBinsConfig({ ...timeBinsConfig, mode: "duration" })}
              />
              Duración por tramo
            </label>
          </div>

          {timeBinsConfig.mode === "count" ? (
            <label className="time-bins-field">
              Nº de tramos (reparte el tiempo total en partes iguales)
              <input
                type="number"
                min="2"
                value={timeBinsConfig.count}
                onChange={(e) => onChangeTimeBinsConfig({ ...timeBinsConfig, count: e.target.value })}
                placeholder="4"
              />
            </label>
          ) : (
            <label className="time-bins-field">
              Duración de cada tramo
              <div className="time-bins-duration-row">
                <input
                  type="number"
                  min="1"
                  value={timeBinsConfig.durationValue}
                  onChange={(e) => onChangeTimeBinsConfig({ ...timeBinsConfig, durationValue: e.target.value })}
                  placeholder="5"
                />
                <select
                  value={timeBinsConfig.durationUnit}
                  onChange={(e) => onChangeTimeBinsConfig({ ...timeBinsConfig, durationUnit: e.target.value })}
                >
                  <option value="ms">ms</option>
                  <option value="s">s</option>
                  <option value="min">min</option>
                </select>
              </div>
            </label>
          )}
          <p className="calc-hint">
            Para cada tramo se calcula la media y el máximo de activación, sobre el tramo de tiempo ya seleccionado
            (recorte/zoom del gráfico).
          </p>
        </div>
      )}
    </div>
  );
}
