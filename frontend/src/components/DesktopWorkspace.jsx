import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import ChannelPanel from "./ChannelPanel";
import ModeSwitch from "./ModeSwitch";
import WaveformView from "./WaveformView";
import CalculationPanel from "./CalculationPanel";
import ResultsPanel from "./ResultsPanel";
import SessionHistory from "./SessionHistory";
import SegmentSlider from "./SegmentSlider";
import BatchImport from "./BatchImport";
import SequentialMode from "./SequentialMode";
import ExternalLink from "./ExternalLink";
import "./DesktopWorkspace.css";

export default function DesktopWorkspace({ desktop, onDesktopUpdated }) {
  const [subjects, setSubjects] = useState([]);
  const [activeSubjectId, setActiveSubjectId] = useState(null);

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null); // { fs, channels, preview: [...] }
  const [parsingFile, setParsingFile] = useState(false);
  const [channelSelection, setChannelSelection] = useState([]);
  const [mode, setMode] = useState("raw");
  const [strokeWidth, setStrokeWidth] = useState(1.4);

  const [calculations, setCalculations] = useState(["media", "maximo", "picos"]);
  const [peakConfig, setPeakConfig] = useState({ n_peaks: null, min_peak_distance_ms: null });

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState(null);
  const [error, setError] = useState("");
  const [resultsRefreshKey, setResultsRefreshKey] = useState(0);
  const [showSequential, setShowSequential] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(320);

  function startResizingSidebar(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    function onMove(moveEvent) {
      const delta = startX - moveEvent.clientX; // arrastrar a la izquierda = agrandar el panel
      const next = Math.min(640, Math.max(220, startWidth + delta));
      setSidebarWidth(next);
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Picos colocados manualmente en el gráfico (estilo Slider.m):
  // { [channelIndex]: [tiempo_ms, ...] }. Solo un canal puede estar
  // "activo" para recibir clics a la vez.
  const [manualPeaks, setManualPeaks] = useState({});
  const [manualPeakActiveIndex, setManualPeakActiveIndex] = useState(null);

  // Segmentación visual: qué tramo de la señal se analiza (0..1 del
  // total). Por defecto, la señal completa.
  const [segmentStart, setSegmentStart] = useState(0);
  const [segmentEnd, setSegmentEnd] = useState(1);

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
    setPreview(null);
    setError("");
    setAnalyzeResult(null);
    setParsingFile(true);
    try {
      const data = await api.parsePreview(f);
      setPreview(data);
      setChannelSelection([]);
      setManualPeaks({});
      setManualPeakActiveIndex(null);
      setSegmentStart(0);
      setSegmentEnd(1);
    } catch (err) {
      setError(
        err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError")
          ? "No se pudo conectar con el servidor. Si llevaba un rato sin usarse, puede tardar hasta 50s en despertar — vuelve a intentarlo en unos segundos."
          : err.message
      );
    } finally {
      setParsingFile(false);
      // Permite volver a elegir el MISMO archivo si hace falta reintentar.
      e.target.value = "";
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

  const totalDurationMs = preview ? (preview.n_samples / preview.fs) * 1000 : 0;

  function handleManualPeakClick(fraction) {
    if (manualPeakActiveIndex === null) return;
    const timeMs = fraction * totalDurationMs;
    setManualPeaks((prev) => {
      const current = prev[manualPeakActiveIndex] || [];
      return { ...prev, [manualPeakActiveIndex]: [...current, timeMs].sort((a, b) => a - b) };
    });
  }

  function handleClearManualPeaks(index) {
    setManualPeaks((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
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
          manual_peaks_ms: manualPeaks[c.index]?.length ? manualPeaks[c.index] : null,
        })),
        calculations,
        peak_config: peakConfig,
        save_results: true,
        segment_start_ms: segmentStart > 0 ? segmentStart * totalDurationMs : null,
        segment_end_ms: segmentEnd < 1 ? segmentEnd * totalDurationMs : null,
      };
      const result = await api.analyze(desktop.id, activeSubjectId, file, config);
      setAnalyzeResult(result);
      setResultsRefreshKey((k) => k + 1);
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
          <ExternalLink desktop={desktop} onUpdated={onDesktopUpdated} />
          <button className="workspace-btn-ghost" onClick={() => setSidebarOpen((v) => !v)}>
            {sidebarOpen ? "Ocultar canales" : "Mostrar canales"}
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
          {parsingFile && (
            <p className="upload-status mono">
              Leyendo archivo… si el servidor llevaba un rato sin usarse, puede tardar hasta 50s.
            </p>
          )}
          {error && <p className="workspace-error">{error}</p>}

          <WaveformView
            channelsData={waveformData}
            onManualPeakClick={manualPeakActiveIndex !== null ? handleManualPeakClick : undefined}
            manualPeakFractions={
              manualPeakActiveIndex !== null && totalDurationMs > 0
                ? (manualPeaks[manualPeakActiveIndex] || []).map((t) => t / totalDurationMs)
                : []
            }
            segmentStartFraction={segmentStart}
            segmentEndFraction={segmentEnd}
            totalDurationMs={totalDurationMs}
            strokeWidth={strokeWidth}
          />

          <label className="stroke-width-control mono">
            Grosor de línea
            <input
              type="range"
              min="0.5"
              max="4"
              step="0.1"
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
            />
            {strokeWidth.toFixed(1)}
          </label>

          {preview && (
            <SegmentSlider
              startFraction={segmentStart}
              endFraction={segmentEnd}
              totalDurationMs={totalDurationMs}
              onChange={(start, end) => {
                setSegmentStart(start);
                setSegmentEnd(end);
              }}
            />
          )}

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

          <div className="analyze-row">
            <button
              className="workspace-btn-primary analyze-btn"
              onClick={handleAnalyze}
              disabled={!file || channelSelection.length === 0 || !activeSubjectId || analyzing}
            >
              {analyzing ? "Analizando…" : "Analizar y guardar"}
            </button>
            <button
              type="button"
              className="workspace-btn-ghost"
              onClick={() => setShowSequential(true)}
              disabled={!analyzeResult}
              title={!analyzeResult ? "Analiza primero para poder mostrarlo paso a paso" : "Mostrar paso a paso en clase"}
            >
              🎓 Modo secuencial (clase)
            </button>
          </div>

          <BatchImport
            desktopId={desktop.id}
            channelSelection={channelSelection}
            calculations={calculations}
            peakConfig={peakConfig}
            disabled={!preview}
            onDone={() => {
              loadSubjects();
              setResultsRefreshKey((k) => k + 1);
            }}
          />
        </div>

        {sidebarOpen && (
          <>
            <div className="workspace-resize-handle" onMouseDown={startResizingSidebar} title="Arrastra para redimensionar" />
            <aside className="workspace-sidebar" style={{ flexBasis: sidebarWidth }}>
              <ChannelPanel
                channels={preview?.channels || []}
                selection={channelSelection}
                onChange={setChannelSelection}
                calculationsIncludePicos={calculations.includes("picos")}
                manualPeaks={manualPeaks}
                manualPeakActiveIndex={manualPeakActiveIndex}
                onSetManualPeakActive={setManualPeakActiveIndex}
                onClearManualPeaks={handleClearManualPeaks}
              />
              <ResultsPanel channels={analyzeResult?.channels} sessionLabel={analyzeResult?.session_label} />
            </aside>
          </>
        )}
      </div>

      <SessionHistory desktopId={desktop.id} subjects={subjects} refreshKey={resultsRefreshKey} />

      {showSequential && (
        <SequentialMode
          channelSelection={channelSelection}
          channelPreviews={channelPreviews}
          analyzeResult={analyzeResult}
          totalDurationMs={totalDurationMs}
          onClose={() => setShowSequential(false)}
        />
      )}
    </div>
  );
}
