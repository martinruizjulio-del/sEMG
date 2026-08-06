import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import "./SessionHistory.css";

export default function SessionHistory({ desktopId, subjects, refreshKey }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await api.listResults(desktopId);
    setResults(data);
    setLoading(false);
  }, [desktopId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function toggle(result) {
    const next = !result.include_in_matrix;
    setResults((prev) => prev.map((r) => (r.id === result.id ? { ...r, include_in_matrix: next } : r)));
    try {
      await api.updateResult(desktopId, result.id, next);
    } catch {
      // revertir si falla
      setResults((prev) => prev.map((r) => (r.id === result.id ? { ...r, include_in_matrix: !next } : r)));
    }
  }

  if (loading) return null;
  if (results.length === 0) return null;

  const subjectLabel = (id) => subjects.find((s) => s.id === id)?.label || `Sujeto ${id}`;

  // Agrupar: sujeto -> sesión -> resultados
  const bySubject = new Map();
  for (const r of results) {
    if (!bySubject.has(r.subject_id)) bySubject.set(r.subject_id, new Map());
    const sessions = bySubject.get(r.subject_id);
    const key = r.session_id ?? "sin-sesion";
    if (!sessions.has(key)) sessions.set(key, { label: r.session_label || "Sin sesión", items: [] });
    sessions.get(key).items.push(r);
  }

  return (
    <div className="session-history">
      <h3>Historial de análisis</h3>
      <p className="session-history-hint">
        Cada archivo analizado queda aquí como una sesión aparte. Desmarca los valores que no quieras
        que aparezcan en el Excel exportado — por ejemplo, si tienes el mismo dato en dos sesiones y
        quieres quedarte solo con la del <strong>lapso</strong> más pequeño.
      </p>
      {[...bySubject.entries()].map(([subjectId, sessions]) => (
        <div key={subjectId} className="session-history-subject">
          <h4>{subjectLabel(subjectId)}</h4>
          {[...sessions.entries()].map(([sessionKey, session]) => (
            <div key={sessionKey} className="session-history-session">
              <div className="session-history-session-label">{session.label}</div>
              <table className="session-history-table">
                <tbody>
                  {session.items.map((r) => (
                    <tr key={r.id} className={r.metric === "lapso_ms" ? "is-lapso" : ""}>
                      <td>
                        <input
                          type="checkbox"
                          checked={r.include_in_matrix}
                          onChange={() => toggle(r)}
                          title="Incluir en la matriz de datos exportada"
                        />
                      </td>
                      <td>{r.channel_label}</td>
                      <td className="mono">{r.metric.replace(/_/g, " ")}</td>
                      <td className="mono">{r.value.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
