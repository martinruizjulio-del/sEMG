import { useMemo, useRef } from "react";
import "./WaveformView.css";

// Suavizado por media móvil, equivalente al método por defecto de
// smoothdata() de MATLAB ('movmean'): cada punto se sustituye por la
// media de una ventana centrada de tamaño `windowSize` (en muestras
// de la señal ya decimada para pantalla).
function smoothMovingAverage(values, windowSize) {
  if (windowSize <= 1) return values;
  const half = Math.floor(windowSize / 2);
  const out = Array.from({ length: values.length });
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(values.length, i + half + 1);
    let sum = 0;
    for (let j = start; j < end; j++) sum += values[j];
    out[i] = sum / (end - start);
  }
  return out;
}

/**
 * Traza cada canal seleccionado como una polilínea SVG independiente.
 * Recibe arrays ya decimados (preview) — no más de ~1500 puntos.
 *
 * Si se pasa `onManualPeakClick`, el gráfico se vuelve clicable: cada
 * clic añade un pico manual (posicionamiento directo, estilo Slider.m)
 * en la fracción 0..1 del ancho donde se pulsó. `manualPeakFractions`
 * dibuja los picos ya colocados como marcas verticales sencillas.
 * `peakMarkers` (más completo) dibuja además una etiqueta con el
 * músculo y el valor, coloreada como ese canal:
 * [{ fraction, value, label, colorClass }]
 */
export default function WaveformView({
  channelsData,
  height = 260,
  onManualPeakClick,
  manualPeakFractions = [],
  peakMarkers = [],
  segmentStartFraction = 0,
  segmentEndFraction = 1,
  totalDurationMs = 0,
  strokeWidth = 1.5,
  chartStyle = "line", // "line" | "area"
  smoothWindow = 0, // 0 = sin suavizar
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
      if (!values || values.length === 0) return { d: "", areaD: "", colorClass };
      const smoothed = smoothWindow > 1 ? smoothMovingAverage(values, smoothWindow) : values;
      const min = Math.min(...smoothed);
      const max = Math.max(...smoothed);
      const span = max - min || 1;
      const stepX = plotWidth / (smoothed.length - 1 || 1);

      const points = smoothed.map((v, i) => {
        const x = i * stepX;
        const norm = (v - min) / span; // 0..1
        const y = plotHeight - norm * (plotHeight - 20) - 10;
        return [x, y];
      });

      const d = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
      const areaD =
        points.length > 0
          ? `M${points[0][0].toFixed(1)},${plotHeight} ` +
            points.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(" ") +
            ` L${points[points.length - 1][0].toFixed(1)},${plotHeight} Z`
          : "";

      return { d, areaD, colorClass };
    });
  }, [channelsData, plotHeight, smoothWindow]);

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
          {chartStyle === "area" &&
            paths.map((p, i) => (
              <path key={`area-${i}`} d={p.areaD} className={`waveform-area ${p.colorClass}`} />
            ))}
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
          {peakMarkers.map((p, i) => {
            const x = p.fraction * plotWidth;
            // Alternar la altura de la etiqueta para que no se solapen
            // si hay varios picos muy juntos.
            const labelY = 14 + (i % 3) * 14;
            return (
              <g key={`marker-${i}`} className={p.colorClass}>
                <line x1={x} y1="0" x2={x} y2={plotHeight} className="waveform-peak-line" />
                <circle cx={x} cy={labelY} r="2.5" className="waveform-peak-dot" />
                <text x={x + 6} y={labelY + 3} className="waveform-peak-label">
                  {p.label} · {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
                </text>
              </g>
            );
          })}
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
        <div className="waveform-manual-hint">
          Clic para añadir un pico · clic cerca de uno ya puesto para quitarlo ({peakMarkers.length || manualPeakFractions.length} colocados)
        </div>
      )}
    </div>
  );
}
