import { useMemo, useRef } from "react";
import "./WaveformView.css";

/**
 * Traza cada canal seleccionado como una polilínea SVG independiente.
 * Recibe arrays ya decimados (preview) — no más de ~1500 puntos.
 *
 * Si se pasa `onManualPeakClick`, el gráfico se vuelve clicable: cada
 * clic añade un pico manual (posicionamiento directo, estilo Slider.m)
 * en la fracción 0..1 del ancho donde se pulsó. `manualPeakFractions`
 * dibuja los picos ya colocados como marcas verticales sencillas.
 * `peakMarkers` (más completo) dibuja un punto sobre la curva, en su
 * altura real, con una etiqueta de músculo y valor coloreada como ese
 * canal: [{ fraction, value, label, colorClass }]. `activeChannelPosition`
 * indica qué entrada de channelsData es la que corresponde a esos
 * picos, para poder situar el punto a la altura correcta.
 *
 * El suavizado (smoothdata) NO se hace aquí -es un efecto real sobre
 * el cálculo, se aplica en el servidor antes de decimar para
 * pantalla, así el gráfico coincide siempre con lo que se calcula-.
 */
export default function WaveformView({
  channelsData,
  height = 260,
  onManualPeakClick,
  manualPeakFractions = [],
  peakMarkers = [],
  activeChannelPosition = null,
  segmentStartFraction = 0,
  segmentEndFraction = 1,
  totalDurationMs = 0,
  strokeWidth = 1.5,
  chartStyle = "line", // "line" | "area"
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
      if (!values || values.length === 0) return { d: "", areaD: "", colorClass, smoothed: [], min: 0, max: 1 };
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = max - min || 1;
      const stepX = plotWidth / (values.length - 1 || 1);

      const points = values.map((v, i) => {
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

      return { d, areaD, colorClass, smoothed: values, min, max };
    });
  }, [channelsData, plotHeight]);

  // Altura Y (en el gráfico) de cada pico, calculada sobre la MISMA
  // curva que se está dibujando -así el punto queda exactamente sobre
  // la señal, no flotando aparte-.
  const activeCurve = activeChannelPosition !== null ? paths[activeChannelPosition] : null;
  const positionedPeaks = peakMarkers.map((p) => {
    if (!activeCurve || !activeCurve.smoothed?.length) return { ...p, y: plotHeight / 2 };
    const idx = Math.round(p.fraction * (activeCurve.smoothed.length - 1));
    const v = activeCurve.smoothed[Math.min(Math.max(idx, 0), activeCurve.smoothed.length - 1)];
    const span = activeCurve.max - activeCurve.min || 1;
    const norm = (v - activeCurve.min) / span;
    const y = plotHeight - norm * (plotHeight - 20) - 10;
    return { ...p, y };
  });

  // Escala numérica del eje Y: se usa el rango del canal en foco
  // (activeChannelPosition) si lo hay -para que el punto de los picos
  // encaje exactamente con las marcas-, o si no, el rango combinado de
  // todos los canales mostrados.
  const yAxisRange = (() => {
    if (activeChannelPosition !== null && paths[activeChannelPosition]?.smoothed?.length) {
      return { min: paths[activeChannelPosition].min, max: paths[activeChannelPosition].max };
    }
    const withData = paths.filter((p) => p.smoothed?.length);
    if (withData.length === 0) return null;
    return {
      min: Math.min(...withData.map((p) => p.min)),
      max: Math.max(...withData.map((p) => p.max)),
    };
  })();

  const yTicks = yAxisRange
    ? [0, 0.25, 0.5, 0.75, 1].map((f) => ({
        frac: f,
        value: yAxisRange.min + f * (yAxisRange.max - yAxisRange.min),
      }))
    : [];

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

        {yTicks.map((t) => {
          const y = plotHeight - t.frac * (plotHeight - 20) - 10;
          return (
            <text key={`ytick-${t.frac}`} className="waveform-y-tick" x={marginLeft - 8} y={y + 3} textAnchor="end">
              {t.value.toFixed(1)}
            </text>
          );
        })}

        <g transform={`translate(${marginLeft}, 0)`}>
          <line x1="0" y1={plotHeight / 2} x2={plotWidth} y2={plotHeight / 2} className="waveform-baseline" />
          {yTicks.map((t) => {
            const y = plotHeight - t.frac * (plotHeight - 20) - 10;
            return <line key={`grid-${t.frac}`} x1="0" y1={y} x2={plotWidth} y2={y} className="waveform-gridline" />;
          })}
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
          {positionedPeaks.map((p, i) => {
            const x = p.fraction * plotWidth;
            // La etiqueta se coloca justo encima del punto; se alterna
            // un poco la distancia para que no se solapen si hay varios
            // picos muy juntos en el tiempo.
            const labelY = p.y - 10 - (i % 3) * 12;
            return (
              <g key={`marker-${i}`} className={p.colorClass}>
                <circle cx={x} cy={p.y} r="4.5" className="waveform-peak-dot" />
                <text x={x + 7} y={labelY} className="waveform-peak-label">
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
