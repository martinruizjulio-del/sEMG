import { useMemo, useRef } from "react";
import "./WaveformView.css";

/**
 * Traza cada canal seleccionado como una polilínea SVG independiente.
 * Recibe arrays ya decimados (preview) — no más de ~1500 puntos.
 *
 * Si se pasa `onManualPeakClick`, el gráfico se vuelve clicable: cada
 * clic añade un pico manual (posicionamiento directo, estilo Slider.m)
 * en la fracción 0..1 del ancho donde se pulsó. `manualPeakFractions`
 * dibuja los picos ya colocados como marcas verticales.
 */
export default function WaveformView({
  channelsData,
  height = 260,
  onManualPeakClick,
  manualPeakFractions = [],
  segmentStartFraction = 0,
  segmentEndFraction = 1,
  totalDurationMs = 0,
  strokeWidth = 1.5,
}) {
  const plotWidth = 1000;
  const marginLeft = 56;
  const marginBottom = 26;
  const width = plotWidth + marginLeft;
  const plotHeight = height;
  const totalHeight = height + marginBottom;
  const svgRef = useRef(null);

  const paths = useMemo(() => {
    return channelsData.map(({ values, colorClass }) => {
      if (!values || values.length === 0) return { d: "", colorClass };
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = max - min || 1;
      const stepX = plotWidth / (values.length - 1 || 1);

      const d = values
        .map((v, i) => {
          const x = i * stepX;
          const norm = (v - min) / span; // 0..1
          const y = plotHeight - norm * (plotHeight - 20) - 10;
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");

      return { d, colorClass };
    });
  }, [channelsData, plotHeight]);

  function handleClick(e) {
    if (!onManualPeakClick || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xFractionOfSvg = (e.clientX - rect.left) / rect.width;
    // El clic llega en fracción del SVG entero; convertimos a fracción
    // del área de la gráfica (descontando el margen del eje Y).
    const marginFraction = marginLeft / width;
    const fraction = (xFractionOfSvg - marginFraction) / (1 - marginFraction);
    onManualPeakClick(Math.min(1, Math.max(0, fraction)));
  }

  const timeTicks = totalDurationMs > 0 ? [0, 0.25, 0.5, 0.75, 1] : [];

  return (
    <div className="waveform-view">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${totalHeight}`}
        preserveAspectRatio="none"
        className={`waveform-svg ${onManualPeakClick ? "is-clickable" : ""}`}
        onClick={handleClick}
      >
        <text
          className="waveform-axis-title waveform-axis-title-y"
          x={-(plotHeight / 2)}
          y={14}
          transform="rotate(-90)"
          textAnchor="middle"
        >
          Activación (µV)
        </text>
        <text className="waveform-axis-title" x={marginLeft + plotWidth / 2} y={totalHeight - 4} textAnchor="middle">
          Tiempo (ms)
        </text>

        <g transform={`translate(${marginLeft}, 0)`}>
          <line x1="0" y1={plotHeight / 2} x2={plotWidth} y2={plotHeight / 2} className="waveform-baseline" />
          {paths.map((p, i) => (
            <path
              key={i}
              d={p.d}
              className={`waveform-trace ${p.colorClass}`}
              style={{ strokeWidth }}
            />
          ))}
          {segmentStartFraction > 0 && (
            <rect x="0" y="0" width={segmentStartFraction * plotWidth} height={plotHeight} className="waveform-dim" />
          )}
          {segmentEndFraction < 1 && (
            <rect
              x={segmentEndFraction * plotWidth}
              y="0"
              width={(1 - segmentEndFraction) * plotWidth}
              height={plotHeight}
              className="waveform-dim"
            />
          )}
          {manualPeakFractions.map((f, i) => (
            <line key={i} x1={f * plotWidth} y1="0" x2={f * plotWidth} y2={plotHeight} className="waveform-manual-peak" />
          ))}
          {timeTicks.map((t) => (
            <text key={t} className="waveform-tick" x={t * plotWidth} y={plotHeight + 16} textAnchor="middle">
              {Math.round(t * totalDurationMs)}
            </text>
          ))}
        </g>
      </svg>
      {channelsData.length === 0 && (
        <div className="waveform-empty">Sube un archivo y selecciona un canal para ver la señal.</div>
      )}
      {onManualPeakClick && (
        <div className="waveform-manual-hint">Haz clic en el gráfico para colocar un pico ({manualPeakFractions.length} colocados)</div>
      )}
    </div>
  );
}
