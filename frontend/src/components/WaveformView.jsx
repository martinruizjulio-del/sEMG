import { useMemo, useRef, useState } from "react";
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
 * Cada punto se puede ARRASTRAR para reubicarlo (onPeakDrag(index,
 * fraction), se llama al soltar) sin necesidad de borrarlo y ponerlo
 * de nuevo; un clic simple sobre el punto (sin arrastrar) lo quita
 * (onPeakRemove(index)).
 *
 * El suavizado (smoothdata) NO se hace aquí -es un efecto real sobre
 * el cálculo, se aplica en el servidor antes de decimar para
 * pantalla, así el gráfico coincide siempre con lo que se calcula-.
 */
export default function WaveformView({
  channelsData,
  height = 260,
  onManualPeakClick,
  onPeakDrag,
  onPeakRemove,
  manualPeakFractions = [],
  peakMarkers = [],
  activeChannelPosition = null,
  segmentStartFraction = 0,
  segmentEndFraction = 1,
  totalDurationMs = 0,
  strokeWidth = 1.5,
  chartStyle = "line", // "line" | "area"
  showGrid = true,
}) {
  const plotWidth = 1000;
  const marginLeft = 56;
  const marginBottom = 26;
  const width = plotWidth + marginLeft;
  const plotHeight = height;
  const totalHeight = height + marginBottom;
  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null); // { index, startX, moved, fraction }

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
  // la señal, no flotando aparte-. Si se está arrastrando un pico, se
  // usa su posición en vivo en vez de la guardada.
  const activeCurve = activeChannelPosition !== null ? paths[activeChannelPosition] : null;
  const positionedPeaks = peakMarkers.map((p, i) => {
    const identityIndex = p.originalIndex ?? i;
    const fraction = drag && drag.index === identityIndex ? drag.fraction : p.fraction;
    if (!activeCurve || !activeCurve.smoothed?.length) return { ...p, fraction, y: plotHeight / 2, identityIndex };
    const idx = Math.round(fraction * (activeCurve.smoothed.length - 1));
    const v = activeCurve.smoothed[Math.min(Math.max(idx, 0), activeCurve.smoothed.length - 1)];
    const span = activeCurve.max - activeCurve.min || 1;
    const norm = (v - activeCurve.min) / span;
    const y = plotHeight - norm * (plotHeight - 20) - 10;
    return { ...p, fraction, y, value: v, identityIndex };
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

  function fractionFromClientX(clientX) {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const xFractionOfSvg = (clientX - rect.left) / rect.width;
    const marginFraction = marginLeft / width;
    return Math.min(1, Math.max(0, (xFractionOfSvg - marginFraction) / (1 - marginFraction)));
  }

  function handleClick(e) {
    if (!onManualPeakClick) return;
    const fraction = fractionFromClientX(e.clientX);
    if (fraction !== null) onManualPeakClick(fraction);
  }

  function handlePeakPointerDown(e, index, startFraction) {
    if (!onPeakDrag && !onPeakRemove) return;
    e.stopPropagation();
    e.preventDefault();
    const startClientX = e.clientX;
    let current = { index, moved: false, fraction: startFraction };
    setDrag(current);

    function onMove(moveEvent) {
      const fraction = fractionFromClientX(moveEvent.clientX);
      if (fraction === null) return;
      const moved = current.moved || Math.abs(moveEvent.clientX - startClientX) > 3;
      current = { index, moved, fraction };
      setDrag(current);
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (current.moved) {
        onPeakDrag?.(current.index, current.fraction);
      } else {
        onPeakRemove?.(current.index);
      }
      setDrag(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
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
          {showGrid &&
            yTicks.map((t) => {
              const y = plotHeight - t.frac * (plotHeight - 20) - 10;
              return <line key={`grid-y-${t.frac}`} x1="0" y1={y} x2={plotWidth} y2={y} className="waveform-gridline" />;
            })}
          {showGrid &&
            timeTicks.map((t) => (
              <line
                key={`grid-x-${t}`}
                x1={t * plotWidth}
                y1="0"
                x2={t * plotWidth}
                y2={plotHeight}
                className="waveform-gridline"
              />
            ))}
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
            const draggable = Boolean(onPeakDrag || onPeakRemove);
            return (
              <g key={`marker-${i}`} className={p.colorClass}>
                <circle
                  cx={x}
                  cy={p.y}
                  r="9"
                  className="waveform-peak-hitarea"
                  onMouseDown={draggable ? (e) => handlePeakPointerDown(e, p.identityIndex, p.fraction) : undefined}
                />
                <circle
                  cx={x}
                  cy={p.y}
                  r={drag && drag.index === p.identityIndex ? 6 : 4.5}
                  className={`waveform-peak-dot ${draggable ? "is-draggable" : ""}`}
                  onMouseDown={draggable ? (e) => handlePeakPointerDown(e, p.identityIndex, p.fraction) : undefined}
                />
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
          Clic fuera de un punto para añadir un pico · arrastra un punto para moverlo · clic simple sobre un punto
          para quitarlo ({peakMarkers.length || manualPeakFractions.length} colocados)
        </div>
      )}
    </div>
  );
}
