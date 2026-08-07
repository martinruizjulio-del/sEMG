import { useState } from "react";
import "./ResultsPanel.css";

function ResultsTable({ channels, allMetrics }) {
  return (
    <table className="results-table">
      <thead>
        <tr>
          <th>Músculo</th>
          {allMetrics.map((m) => (
            <th key={m}>{m.replace(/_/g, " ")}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {channels.map((ch, i) => (
          <tr key={i}>
            <td>
              <span className={`channel-swatch channel-color-${i % 8}`} />
              {ch.channel_label} {ch.side ? `(${ch.side})` : ""}
            </td>
            {allMetrics.map((m) => (
              <td key={m} className="mono">
                {typeof ch.metrics[m] === "number" ? ch.metrics[m].toFixed(3) : "—"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ResultsPanel({ channels, sessionLabel }) {
  const [view, setView] = useState("lista"); // "lista" | "tabla"
  const [expanded, setExpanded] = useState(false);

  if (!channels || channels.length === 0) {
    return (
      <div className="results-panel results-empty">
        Ejecuta un análisis para ver los resultados aquí.
      </div>
    );
  }

  // Todas las métricas presentes en cualquier canal, en el orden en
  // que aparecen por primera vez -para que las columnas de la tabla
  // salgan siempre en el mismo orden-.
  const allMetrics = [];
  for (const ch of channels) {
    for (const metric of Object.keys(ch.metrics)) {
      if (!allMetrics.includes(metric)) allMetrics.push(metric);
    }
  }

  return (
    <div className="results-panel">
      <div className="results-panel-header">
        <h3>Resultados{sessionLabel ? ` · ${sessionLabel}` : ""}</h3>
        <div className="results-view-switch">
          <button type="button" className={view === "lista" ? "is-active" : ""} onClick={() => setView("lista")}>
            Lista
          </button>
          <button type="button" className={view === "tabla" ? "is-active" : ""} onClick={() => setView("tabla")}>
            Tabla
          </button>
        </div>
      </div>

      {view === "lista" ? (
        channels.map((ch, i) => (
          <div key={i} className="result-block">
            <div className="result-block-title">
              <span className={`channel-swatch channel-color-${i % 8}`} />
              {ch.channel_label} {ch.side ? `(${ch.side})` : ""}
            </div>
            <dl className="result-metrics">
              {Object.entries(ch.metrics).map(([metric, value]) => (
                <div className="result-metric" key={metric}>
                  <dt title={ch.variable_names[metric]}>{metric.replace(/_/g, " ")}</dt>
                  <dd className="mono">{typeof value === "number" ? value.toFixed(3) : value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))
      ) : (
        <>
          <button type="button" className="results-expand-btn" onClick={() => setExpanded(true)}>
            ⛶ Ampliar tabla (para copiar y pegar)
          </button>
          <div className="results-table-wrap">
            <ResultsTable channels={channels} allMetrics={allMetrics} />
          </div>
        </>
      )}

      {expanded && (
        <div className="results-table-overlay" onClick={() => setExpanded(false)}>
          <div className="results-table-modal" onClick={(e) => e.stopPropagation()}>
            <div className="results-table-modal-header">
              <h3>Resultados{sessionLabel ? ` · ${sessionLabel}` : ""}</h3>
              <button type="button" className="workspace-btn-ghost" onClick={() => setExpanded(false)}>
                Cerrar ✕
              </button>
            </div>
            <p className="results-table-modal-hint">
              Selecciona la tabla (Ctrl/Cmd+A dentro de ella) y cópiala directamente en Excel.
            </p>
            <div className="results-table-modal-body">
              <ResultsTable channels={channels} allMetrics={allMetrics} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
