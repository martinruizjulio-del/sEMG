import { useState } from "react";
import WaveformView from "./WaveformView";
import ResultsPanel from "./ResultsPanel";
import "./SequentialMode.css";

const STEPS = [
  { key: "raw", title: "1. Señal cruda" },
  { key: "filtered", title: "2. Señal filtrada" },
  { key: "rms", title: "3. RMS" },
  { key: "picos", title: "4. Picos" },
  { key: "resultados", title: "5. Resultados" },
];

/**
 * Presentación paso a paso pensada para proyectar en clase: va
 * avanzando por las fases del análisis (cruda -> filtrada -> RMS ->
 * picos -> resultados) con un botón "Siguiente". Reutiliza los datos
 * ya calculados (channelPreviews, analyzeResult) -no vuelve a pedir
 * nada al servidor-.
 */
export default function SequentialMode({ channelSelection, channelPreviews, analyzeResult, totalDurationMs, onClose }) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];

  function waveformDataFor(key) {
    return channelSelection.map((c) => {
      const cached = channelPreviews[c.index];
      const values = cached ? cached[key] : [];
      return { values, colorClass: `channel-color-${c.index % 8}` };
    });
  }

  // Para el paso "picos", juntamos los tiempos de pico de todos los
  // canales analizados como marcas sobre la señal RMS.
  const peakFractions = (analyzeResult?.channels || [])
    .flatMap((ch) => ch.peak_times_ms || [])
    .map((t) => (totalDurationMs > 0 ? t / totalDurationMs : 0));

  return (
    <div className="sequential-overlay">
      <div className="sequential-panel">
        <header className="sequential-header">
          <div className="sequential-steps">
            {STEPS.map((s, i) => (
              <span key={s.key} className={`sequential-step-dot ${i === stepIndex ? "is-active" : ""} ${i < stepIndex ? "is-done" : ""}`}>
                {i + 1}
              </span>
            ))}
          </div>
          <button type="button" className="sequential-close" onClick={onClose}>
            Cerrar ✕
          </button>
        </header>

        <h2 className="sequential-title">{step.title}</h2>

        <div className="sequential-body">
          {step.key === "raw" && <WaveformView channelsData={waveformDataFor("raw")} height={380} />}
          {step.key === "filtered" && <WaveformView channelsData={waveformDataFor("filtered")} height={380} />}
          {step.key === "rms" && <WaveformView channelsData={waveformDataFor("rms")} height={380} />}
          {step.key === "picos" && (
            <WaveformView channelsData={waveformDataFor("rms")} height={380} manualPeakFractions={peakFractions} />
          )}
          {step.key === "resultados" && (
            <div className="sequential-results">
              <ResultsPanel channels={analyzeResult?.channels} sessionLabel={analyzeResult?.session_label} />
            </div>
          )}
        </div>

        <footer className="sequential-footer">
          <button
            type="button"
            className="workspace-btn-ghost"
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            disabled={stepIndex === 0}
          >
            ← Anterior
          </button>
          <span className="sequential-progress mono">
            {stepIndex + 1} / {STEPS.length}
          </span>
          <button
            type="button"
            className="workspace-btn-primary"
            onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))}
            disabled={stepIndex === STEPS.length - 1}
          >
            Siguiente →
          </button>
        </footer>
      </div>
    </div>
  );
}
