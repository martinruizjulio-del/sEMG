import { useState } from "react";
import { api } from "../lib/api";
import "./BatchImport.css";

/**
 * Modo automático por lotes: sube varios archivos de una vez, y crea
 * un sujeto nuevo por cada uno, analizándolo con la MISMA configuración
 * de canales/cálculos que ya se ha preparado con el archivo de
 * referencia (mismo orden de columnas esperado en todos los archivos).
 *
 * Recorte por lotes: por defecto, cada archivo se analiza solo en su
 * tramo central (centro de la señal ± X ms), que es el criterio
 * habitual salvo para señales con varios bloques de activación
 * distintos (p.ej. un salto: despegue, vacío, caída) -esos archivos
 * es mejor analizarlos uno a uno con el recorte visual de arriba-.
 */
export default function BatchImport({ desktopId, channelSelection, calculations, peakConfig, onDone, disabled }) {
  const [files, setFiles] = useState([]);
  const [group, setGroup] = useState("experimental");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState([]); // [{name, status: 'pending'|'ok'|'error', message}]
  const [useCenterWindow, setUseCenterWindow] = useState(true);
  const [halfWindowMs, setHalfWindowMs] = useState(1500);

  function handleFilesChange(e) {
    setFiles(Array.from(e.target.files || []));
    setProgress([]);
  }

  async function handleRun() {
    if (files.length === 0) return;
    setRunning(true);
    const initial = files.map((f) => ({ name: f.name, status: "pending", message: "" }));
    setProgress(initial);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        let segmentStartMs = null;
        let segmentEndMs = null;
        if (useCenterWindow) {
          const preview = await api.parsePreview(file);
          const totalMs = (preview.n_samples / preview.fs) * 1000;
          const centerMs = totalMs / 2;
          segmentStartMs = Math.max(0, centerMs - halfWindowMs);
          segmentEndMs = Math.min(totalMs, centerMs + halfWindowMs);
        }

        const subject = await api.addSubject(desktopId, group);
        const config = {
          channels: channelSelection.map((c) => ({
            index: c.index,
            side: c.side,
            sensor_type: c.sensor_type,
          })),
          calculations,
          peak_config: peakConfig,
          save_results: true,
          segment_start_ms: segmentStartMs,
          segment_end_ms: segmentEndMs,
        };
        await api.analyze(desktopId, subject.id, file, config);
        setProgress((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: "ok", message: subject.label } : p)));
      } catch (err) {
        setProgress((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: "error", message: err.message } : p)));
      }
    }

    setRunning(false);
    onDone();
  }

  return (
    <div className="batch-import">
      <h3>Importar por lotes</h3>
      <p className="batch-import-hint">
        Sube varios archivos de una vez -mismo orden de canales que el archivo de referencia de arriba-. Se creará
        un sujeto nuevo por cada uno, analizado con los mismos canales y cálculos ya configurados.
      </p>

      <label className="batch-import-window-toggle">
        <input type="checkbox" checked={useCenterWindow} onChange={(e) => setUseCenterWindow(e.target.checked)} disabled={running} />
        Analizar solo el centro de cada archivo, ±
        <input
          type="number"
          min="0"
          className="batch-import-window-input"
          value={halfWindowMs}
          onChange={(e) => setHalfWindowMs(Number(e.target.value) || 0)}
          disabled={running || !useCenterWindow}
        />
        ms
      </label>
      {!useCenterWindow && (
        <p className="batch-import-warning">
          Se analizará cada archivo completo. Si alguno tiene varios bloques de activación (p.ej. despegue y caída de
          un salto), mejor analízalo aparte con el recorte visual, no por lote.
        </p>
      )}

      <div className="batch-import-controls">
        <label className="batch-import-filepicker">
          <input type="file" multiple accept=".asc,.emt,.csv,.txt" onChange={handleFilesChange} disabled={running} />
          {files.length > 0 ? `${files.length} archivo(s) seleccionados` : "Elegir archivos…"}
        </label>
        <select value={group} onChange={(e) => setGroup(e.target.value)} disabled={running}>
          <option value="experimental">Grupo experimental</option>
          <option value="control">Grupo control</option>
        </select>
        <button
          type="button"
          className="workspace-btn-primary"
          onClick={handleRun}
          disabled={disabled || running || files.length === 0 || channelSelection.length === 0}
        >
          {running ? "Importando…" : `Importar ${files.length || ""} archivo(s)`}
        </button>
      </div>
      {channelSelection.length === 0 && files.length > 0 && (
        <p className="batch-import-warning">Configura primero los canales con el archivo de referencia de arriba.</p>
      )}
      {progress.length > 0 && (
        <ul className="batch-import-progress">
          {progress.map((p, i) => (
            <li key={i} className={`batch-import-item is-${p.status}`}>
              <span className="batch-import-icon">{p.status === "ok" ? "✓" : p.status === "error" ? "✕" : "…"}</span>
              <span className="batch-import-name">{p.name}</span>
              <span className="batch-import-message">{p.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
