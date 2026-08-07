import "./SegmentSlider.css";

/**
 * Doble tirador para recortar qué tramo de la señal se analiza
 * (segmentación visual). startFraction/endFraction van de 0 a 1.
 *
 * Además, cuando hay una selección recortada (no toda la señal), se
 * muestra una lupa flotante justo encima del tramo elegido para
 * ampliarlo/verlo completo en el gráfico -zoomed/onToggleZoom-.
 */
export default function SegmentSlider({ startFraction, endFraction, totalDurationMs, onChange, zoomed, onToggleZoom }) {
  const startPct = Math.round(startFraction * 1000);
  const endPct = Math.round(endFraction * 1000);

  function handleStart(e) {
    const value = Number(e.target.value) / 1000;
    onChange(Math.min(value, endFraction - 0.01), endFraction);
  }

  function handleEnd(e) {
    const value = Number(e.target.value) / 1000;
    onChange(startFraction, Math.max(value, startFraction + 0.01));
  }

  function formatMs(ms) {
    return `${(ms / 1000).toFixed(2)} s`;
  }

  const isFullRange = startFraction === 0 && endFraction === 1;

  return (
    <div className="segment-slider-wrap">
      {!isFullRange && (
        <button
          type="button"
          className={`segment-zoom-float ${zoomed ? "is-zoomed" : ""}`}
          style={{ left: `${((startFraction + endFraction) / 2) * 100}%` }}
          onClick={onToggleZoom}
          title={zoomed ? "Ver la señal completa" : "Ampliar el tramo seleccionado"}
        >
          {zoomed ? "🔍−" : "🔍+"}
        </button>
      )}
      <div className="segment-slider">
        <div className="segment-slider-track" />
        <div
          className="segment-slider-range"
          style={{ left: `${startFraction * 100}%`, width: `${(endFraction - startFraction) * 100}%` }}
        />
        <input
          type="range"
          min="0"
          max="1000"
          value={startPct}
          onChange={handleStart}
          className="segment-range segment-range-start"
        />
        <input
          type="range"
          min="0"
          max="1000"
          value={endPct}
          onChange={handleEnd}
          className="segment-range segment-range-end"
        />
      </div>
      <div className="segment-slider-labels mono">
        <span>{formatMs(startFraction * totalDurationMs)}</span>
        {!isFullRange && (
          <button type="button" className="segment-slider-reset" onClick={() => onChange(0, 1)}>
            Ver todo
          </button>
        )}
        <span>{formatMs(endFraction * totalDurationMs)}</span>
      </div>
    </div>
  );
}
