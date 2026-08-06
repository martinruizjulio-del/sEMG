import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import ChannelPanel from "./ChannelPanel";
import ModeSwitch from "./ModeSwitch";
import WaveformView from "./WaveformView";
import CalculationPanel from "./CalculationPanel";
import ResultsPanel from "./ResultsPanel";
import "./DesktopWorkspace.css";

export default function DesktopWorkspace({ desktop }) {
  const [subjects, setSubjects] = useState([]);
  const [activeSubjectId, setActiveSubjectId] = useState(null);

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null); // { fs, channels, preview: [...] }
  const [channelSelection, setChannelSelection] = useState([]);
  const [mode, setMode] = useState("raw");

  const [calculations, setCalculations] = useState(["media", "maximo", "picos"]);
  const [peakConfig, setPeakConfig] = useState({ n_peaks: null, min_peak_distance_ms: null });

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState(null);
  const [error, setError] = useState("");

  const loadSubjects = useCallback(async () => {
    const list = await api.listSubjects(desktop.id);
    setSubjects(list);
    if (list.length > 0 && !activeSubjectId) setActiveSubjectId(list[0].id);
  }, [desktop.id, activeSubjectId]);

  useEffect(() => {
    setSubjects([]);
    setActiveSubjectId(null);
    setPreview(null);
    setFile(null);
    setAnalyzeResult(null);
    loadSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop.id]);

  async function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError("");
    setAnalyzeResult(null);
    try {
      const data = await api.parsePreview(f);
      setPreview(data);
      setChannelSelection([]);
    } catch (err) {
      setError(err.message);
    }
  }

  const [channelPreviews, setChannelPreviews] = useState({}); // { [index]: { raw, filtered, rms } }
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (!file || channelSelection.length === 0) {
      setChannelPreviews({});
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    api
      .channelPreview(
        file,
        channelSelection.map((c) => ({ index: c.index, sensor_type: c.sensor_type }))
      )
      .then((data) => {
        if (cancelled) return;
        const byIndex = {};
        data.channels.forEach((ch) => {
          byIndex[ch.index] = { raw: ch.raw, filtered: ch.filtered, rms: ch.rms };
        });
        setChannelPreviews(byIndex);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoadingPreview(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, JSON.stringify(channelSelection.map((c) => [c.index, c.sensor_type]))]);

  async function handleAddSubject(group) {
    const subject = await api.addSubject(desktop.id, group);
    setSubjects((prev) => [...prev, subject]);
    setActiveSubjectId(subject.id);
  }

  async function handleAnalyze() {
    if (!file || !activeSubjectId || channelSelection.length === 0) return;
    setAnalyzing(true);
    setError("");
    try {
      const config = {
        channels: channelSelection.map((c) => ({
          index: c.index,
          side: c.side,
          sensor_type: c.sensor_type,
        })),
        calculations,
        peak_config: peakConfig,
        save_results: true,
      };
      const result = await api.analyze(desktop.id, activeSubjectId, file, config);
      setAnalyzeResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleExport() {
    const blob = await api.exportDesktop(desktop.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${desktop.name}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const waveformData = channelSelection.map((c) => {
    const cached = channelPreviews[c.index];
    const values = cached ? cached[mode] : preview?.preview?.[c.index] || [];
    return { values, colorClass: `channel-color-${c.index % 8}` };
  });

  return (
    <div className="workspace">
      <header className="workspace-header">
        <h2>{desktop.name}</h2>
        <div className="workspace-header-actions">
          <select
            className="subject-select"
            value={activeSubjectId || ""}
            onChange={(e) => setActiveSubjectId(Number(e.target.value))}
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} · {s.group}
              </option>
            ))}
          </select>
          <button className="workspace-btn-ghost" onClick={() => handleAddSubject("experimental")}>
            + Experimental
          </button>
          <button className="workspace-btn-ghost" onClick={() => handleAddSubject("control")}>
            + Control
          </button>
          <button className="workspace-btn-primary" onClick={handleExport}>
            Exportar .xlsx
          </button>
        </div>
      </header>

      <div className="workspace-body">
        <div className="workspace-main">
          <div className="upload-row">
            <label className="upload-dropzone">
              <input type="file" onChange={handleFileChange} accept=".asc,.emt,.csv,.txt" />
              {file ? file.name : "Subir archivo (.ASC, .emt, .csv, .txt)"}
            </label>
            <ModeSwitch value={mode} onChange={setMode} />
            {loadingPreview && <span className="preview-loading mono">calculando…</span>}
          </div>

          <WaveformView channelsData={waveformData} />

          {preview && (
            <div className="preview-meta mono">
              fs: {preview.fs} Hz · {preview.n_samples} muestras · {preview.n_channels} canales · formato:{" "}
              {preview.format}
            </div>
          )}

          <CalculationPanel
            calculations={calculations}
            onChangeCalculations={setCalculations}
            peakConfig={peakConfig}
            onChangePeakConfig={setPeakConfig}
          />

          <button
            className="workspace-btn-primary analyze-btn"
            onClick={handleAnalyze}
            disabled={!file || channelSelection.length === 0 || !activeSubjectId || analyzing}
          >
            {analyzing ? "Analizando…" : "Analizar y guardar"}
          </button>

          {error && <p className="workspace-error">{error}</p>}
        </div>

        <aside className="workspace-sidebar">
          <ChannelPanel
            channels={preview?.channels || []}
            selection={channelSelection}
            onChange={setChannelSelection}
          />
          <ResultsPanel channels={analyzeResult?.channels} sessionLabel={analyzeResult?.session_label} />
        </aside>
      </div>
    </div>
  );
}
