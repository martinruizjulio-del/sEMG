import "./ResultsPanel.css";

export default function ResultsPanel({ channels }) {
  if (!channels || channels.length === 0) {
    return (
      <div className="results-panel results-empty">
        Ejecuta un análisis para ver los resultados aquí.
      </div>
    );
  }

  return (
    <div className="results-panel">
      <h3>Resultados</h3>
      {channels.map((ch, i) => (
        <div key={i} className="result-block">
          <div className="result-block-title">
            <span className={`channel-swatch channel-color-${i % 8}`} />
            {ch.channel_label} {ch.side ? `(${ch.side})` : ""}
          </div>
          <dl className="result-metrics">
            {Object.entries(ch.metrics).map(([metric, value]) => (
              <div className="result-metric" key={metric}>
                <dt title={ch.variable_names[metric]}>{metric.replace(/_/g, " ")}</dt>
                <dd className="mono">{typeof value === "number" ? value.toFixed(2) : value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
