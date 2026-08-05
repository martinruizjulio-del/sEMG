import { useMemo } from "react";
import "./WaveformView.css";

/**
 * Traza cada canal seleccionado como una polilínea SVG independiente,
 * con el resplandor de fósforo como firma visual del instrumento.
 * Recibe arrays ya decimados (preview) — no more de ~1500 puntos.
 */
export default function WaveformView({ channelsData, height = 260 }) {
  const width = 1000;

  const paths = useMemo(() => {
    return channelsData.map(({ values, colorClass }) => {
      if (!values || values.length === 0) return { d: "", colorClass };
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = max - min || 1;
      const stepX = width / (values.length - 1 || 1);

      const d = values
        .map((v, i) => {
          const x = i * stepX;
          const norm = (v - min) / span; // 0..1
          const y = height - norm * (height - 20) - 10;
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");

      return { d, colorClass };
    });
  }, [channelsData, height]);

  return (
    <div className="waveform-view">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="waveform-svg">
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} className="waveform-baseline" />
        {paths.map((p, i) => (
          <path key={i} d={p.d} className={`waveform-trace ${p.colorClass}`} />
        ))}
      </svg>
      {channelsData.length === 0 && (
        <div className="waveform-empty">Sube un archivo y selecciona un canal para ver la señal.</div>
      )}
    </div>
  );
}
