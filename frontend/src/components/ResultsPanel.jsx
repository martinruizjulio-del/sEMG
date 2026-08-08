import { useState, useEffect } from "react";
import "./ResultsPanel.css";

// "num_picos" se sigue calculando (y exportando a Excel), pero no se
// quiere ver en la tabla/lista de resultados en pantalla -es ruido
// visual, lo relevante es el valor de cada pico individual-.
const HIDDEN_METRICS = ["num_picos"];

function visibleEntries(metrics) {
  return Object.entries(metrics).filter(([key]) => !HIDDEN_METRICS.includes(key));
}

function ResultsTable({ channels, columnOrder, onReorder }) {
  const [draggedMetric, setDraggedMetric] = useState(null);

  function handleDrop(targetMetric) {
    if (!draggedMetric || draggedMetric === targetMetric) return;
    const next = columnOrder.filter((m) => m !== draggedMetric);
    const targetIdx = next.indexOf(targetMetric);
    next.splice(targetIdx, 0, draggedMetric);
    onReorder(next);
    setDraggedMetric(null);
  }

  return (
    <table className="results-table">
      <thead>
        <tr>
          <th>Músculo</th>
          {columnOrder.map((m) => (
            <th
              key={m}
              draggable
              className={`results-th-draggable ${draggedMetric === m ? "is-dragging" : ""}`}
              onDragStart={() => setDraggedMetric(m)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(m)}
              onDragEnd={() => setDraggedMetric(null)}
              title="Arrastra para reordenar la columna"
            >
              ⠿ {m.replace(/_/g, " ")}
            </th>
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
            {columnOrder.map((m) => (
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
  const [view, setView] = useState("tabla"); // "lista" | "tabla"
  const [expanded, setExpanded] = useState(false);
  const [columnOrder, setColumnOrder] = useState([]);

  // Todas las métricas presentes en cualquier canal, en el orden en que
  // aparecen por primera vez. Se guarda en columnOrder para poder
  // reordenarlas a mano (arrastrando) y que ese orden se mantenga
  // aunque cambien los resultados -las métricas nuevas se añaden al
  // final, sin tocar el orden que ya haya elegido el usuario-.
  useEffect(() => {
    if (!channels) return;
    const seen = [];
    for (const ch of channels) {
      for (const [metric] of visibleEntries(ch.metrics)) {
        if (!seen.includes(metric)) seen.push(metric);
      }
    }
    setColumnOrder((prev) => {
      const kept = prev.filter((m) => seen.includes(m));
      const added = seen.filter((m) => !kept.includes(m));
      return [...kept, ...added];
    });
  }, [channels]);

  if (!channels || channels.length === 0) {
    return (
      <div className="results-panel results-empty">
        Ejecuta un análisis para ver los resultados aquí.
      </div>
    );
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
              {visibleEntries(ch.metrics).map(([metric, value]) => (
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
          <p className="results-reorder-hint">Arrastra las cabeceras (⠿) para reordenar las columnas.</p>
          <button type="button" className="results-expand-btn" onClick={() => setExpanded(true)}>
            ⛶ Ampliar tabla (para copiar y pegar)
          </button>
          <div className="results-table-wrap">
            <ResultsTable channels={channels} columnOrder={columnOrder} onReorder={setColumnOrder} />
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
              Arrastra las cabeceras (⠿) para reordenar las columnas. Luego selecciona la tabla (Ctrl/Cmd+A dentro
              de ella) y cópiala directamente en Excel.
            </p>
            <div className="results-table-modal-body">
              <ResultsTable channels={channels} columnOrder={columnOrder} onReorder={setColumnOrder} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
