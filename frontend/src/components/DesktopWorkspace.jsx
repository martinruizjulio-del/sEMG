import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import ChannelPanel from "./ChannelPanel";
import ModeSwitch from "./ModeSwitch";
import WaveformView from "./WaveformView";
import ResultsPanel from "./ResultsPanel";
import SessionHistory from "./SessionHistory";
import SegmentSlider from "./SegmentSlider";
import BatchImport from "./BatchImport";
import SequentialMode from "./SequentialMode";
import ExternalLink from "./ExternalLink";
import "./DesktopWorkspace.css";

export default function DesktopWorkspace({ desktop, onDesktopUpdated, calculations, peakConfig, detectPeaksSignal, manualPlaceSignal, smooth }) {
  const [subjects, setSubjects] = useState([]);
  const [activeSubjectId, setActiveSubjectId] = useState(null);

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null); // { fs, channels, preview: [...] }
  const [parsingFile, setParsingFile] = useState(false);
  const [channelSelection, setChannelSelection] = useState([]);
  const [mode, setMode] = useState("raw");
  const [strokeWidth, setStrokeWidth] = useState(1.4);
  const [chartStyle, setChartStyle] = useState("line");
  const [showGrid, setShowGrid] = useState(true);
  const [compareMode, setCompareMode] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState(null);
  const [previewingLive, setPreviewingLive] = useState(false);
  const [detectingPeaks, setDetectingPeaks] = useState(false);
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
  const [peakHistory, setPeakHistory] = useState([]); // [{ index, previous: number[] }]

  function pushPeakHistory(index, previousArray) {
    setPeakHistory((prev) => [...prev.slice(-19), { index, previous: previousArray }]);
  }

  function handleUndoPeak() {
    setPeakHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setManualPeaks((mp) => ({ ...mp, [last.index]: last.previous }));
      return prev.slice(0, -1);
    });
  }

  // Segmentación visual: qué tramo de la señal se analiza (0..1 del
  // total). Por defecto, la señal completa.
  const [segmentStart, setSegmentStart] = useState(0);
  const [segmentEnd, setSegmentEnd] = useState(1);
  const [zoomedToSegment, setZoomedToSegment] = useState(false);
  const [centerWindowMs, setCenterWindowMs] = useState(1500);

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
      setPeakHistory([]);
      setSegmentStart(0);
      setSegmentEnd(1);
      setZoomedToSegment(false);
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
        channelSelection.map((c) => ({ index: c.index, sensor_type: c.sensor_type })),
        smooth
      )
      .then((data) => {
        if (cancelled) return;
        const byIndex = {};
        data.channels.forEach((ch) => {
          byIndex[ch.index] = {
            raw: ch.raw,
            filtered: ch.filtered,
            rms: ch.rms,
            rms_normal: ch.rms_normal,
            rms_smoothed: ch.rms_smoothed,
          };
        });
        setChannelPreviews(byIndex);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoadingPreview(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, JSON.stringify(channelSelection.map((c) => [c.index, c.sensor_type])), smooth]);

  async function handleAddSubject(group) {
    const subject = await api.addSubject(desktop.id, group);
    setSubjects((prev) => [...prev, subject]);
    setActiveSubjectId(subject.id);
  }

  const totalDurationMs = preview ? (preview.n_samples / preview.fs) * 1000 : 0;

  function handleManualPeakClick(fraction) {
    if (manualPeakActiveIndex === null) return;
    // Si hay zoom a la selección, el clic llega en fracción del tramo
    // visible (recortado), hay que convertirlo a tiempo absoluto del
    // archivo completo antes de guardarlo.
    const timeMs = zoomedToSegment
      ? (segmentStart + fraction * (segmentEnd - segmentStart)) * totalDurationMs
      : fraction * totalDurationMs;
    const current = manualPeaks[manualPeakActiveIndex] || [];
    pushPeakHistory(manualPeakActiveIndex, current);
    setManualPeaks((prev) => ({
      ...prev,
      [manualPeakActiveIndex]: [...current, timeMs].sort((a, b) => a - b),
    }));
  }

  // Arrastrar un punto ya colocado lo reubica sin borrarlo -evita
  // tener que quitarlo y volver a añadirlo desde cero para corregir
  // ligeramente su posición-.
  function handlePeakDrag(peakIndex, fraction) {
    if (manualPeakActiveIndex === null) return;
    const timeMs = zoomedToSegment
      ? (segmentStart + fraction * (segmentEnd - segmentStart)) * totalDurationMs
      : fraction * totalDurationMs;
    const current = manualPeaks[manualPeakActiveIndex] || [];
    pushPeakHistory(manualPeakActiveIndex, current);
    setManualPeaks((prev) => {
      const next = [...current];
      next[peakIndex] = timeMs;
      next.sort((a, b) => a - b);
      return { ...prev, [manualPeakActiveIndex]: next };
    });
  }

  // Un clic simple (sin arrastrar) sobre un punto ya colocado lo quita.
  function handlePeakRemove(peakIndex) {
    if (manualPeakActiveIndex === null) return;
    const current = manualPeaks[manualPeakActiveIndex] || [];
    pushPeakHistory(manualPeakActiveIndex, current);
    setManualPeaks((prev) => ({
      ...prev,
      [manualPeakActiveIndex]: current.filter((_, i) => i !== peakIndex),
    }));
  }

  async function handleDetectPeaks() {
    if (!file || !activeSubjectId || channelSelection.length === 0) return;
    setError("");
    setDetectingPeaks(true);
    try {
      const config = {
        channels: channelSelection.map((c) => ({ index: c.index, side: c.side, sensor_type: c.sensor_type })),
        calculations: ["picos"],
        peak_config: peakConfig,
        smooth,
        save_results: false,
        segment_start_ms: segmentStart > 0 ? segmentStart * totalDurationMs : null,
        segment_end_ms: segmentEnd < 1 ? segmentEnd * totalDurationMs : null,
      };
      const result = await api.analyze(desktop.id, activeSubjectId, file, config);
      const detected = {};
      result.channels.forEach((ch, i) => {
        const idx = channelSelection[i]?.index;
        if (idx !== undefined && ch.peak_times_ms) detected[idx] = ch.peak_times_ms;
      });
      setManualPeaks(detected);
      const firstIndex = Object.keys(detected)[0];
      if (firstIndex !== undefined) setManualPeakActiveIndex(Number(firstIndex));
    } catch (err) {
      setError(err.message);
    } finally {
      setDetectingPeaks(false);
    }
  }

  // El botón "Detectar picos" vive ahora en la columna izquierda
  // (dentro del panel de cálculos); avisa aquí mediante un contador
  // que va subiendo cada vez que se pulsa.
  useEffect(() => {
    if (detectPeaksSignal > 0) handleDetectPeaks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectPeaksSignal]);

  // "Colocar manualmente": borra los picos del canal en foco (o el
  // primero seleccionado si no hay ninguno en foco) y activa el modo
  // manual desde cero -distinto de "Detectar", que parte de lo ya
  // detectado automáticamente-.
  useEffect(() => {
    if (manualPlaceSignal === 0 || channelSelection.length === 0) return;
    const targetIndex = manualPeakActiveIndex !== null ? manualPeakActiveIndex : channelSelection[0].index;
    pushPeakHistory(targetIndex, manualPeaks[targetIndex] || []);
    setManualPeaks((prev) => ({ ...prev, [targetIndex]: [] }));
    setManualPeakActiveIndex(targetIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualPlaceSignal]);

  // Al activar "Manual" desde el panel de canales (para un único
  // canal), primero se detectan sus picos automáticamente -si no los
  // tenía ya- y luego se deja editar a mano; así siempre se parte de
  // algo detectado, en vez de un lienzo vacío.
  async function handleSetManualPeakActive(index) {
    if (index === null) {
      setManualPeakActiveIndex(null);
      return;
    }
    setManualPeakActiveIndex(index);
    if (manualPeaks[index]?.length) return; // ya tiene picos, no repetir la detección
    const sel = channelSelection.find((c) => c.index === index);
    if (!sel || !file || !activeSubjectId) return;
    setError("");
    setDetectingPeaks(true);
    try {
      const config = {
        channels: [{ index: sel.index, side: sel.side, sensor_type: sel.sensor_type }],
        calculations: ["picos"],
        peak_config: peakConfig,
        smooth,
        save_results: false,
        segment_start_ms: segmentStart > 0 ? segmentStart * totalDurationMs : null,
        segment_end_ms: segmentEnd < 1 ? segmentEnd * totalDurationMs : null,
      };
      const result = await api.analyze(desktop.id, activeSubjectId, file, config);
      const times = result.channels?.[0]?.peak_times_ms || [];
      setManualPeaks((prev) => ({ ...prev, [index]: times }));
    } catch (err) {
      setError(err.message);
    } finally {
      setDetectingPeaks(false);
    }
  }

  function handleClearManualPeaks(index) {
    pushPeakHistory(index, manualPeaks[index] || []);
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
        smooth,
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

  // Vista previa en vivo: cada vez que cambian los cálculos elegidos,
  // los canales, los parámetros de picos, el recorte, o se añade/quita
  // un pico a mano, se recalcula automáticamente (sin guardar nada) y
  // se muestra en la tabla de resultados. El botón "Guardar" solo
  // hace falta para persistirlo de verdad como una sesión.
  useEffect(() => {
    if (!file || !activeSubjectId || channelSelection.length === 0 || calculations.length === 0) return;
    const timer = setTimeout(async () => {
      setPreviewingLive(true);
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
          smooth,
          save_results: false,
          segment_start_ms: segmentStart > 0 ? segmentStart * totalDurationMs : null,
          segment_end_ms: segmentEnd < 1 ? segmentEnd * totalDurationMs : null,
        };
        const result = await api.analyze(desktop.id, activeSubjectId, file, config);
        setAnalyzeResult(result);
        setError("");
      } catch {
        // La vista previa en vivo falla en silencio -si hay un error de
        // verdad, ya se verá al pulsar "Analizar y guardar".
      } finally {
        setPreviewingLive(false);
      }
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, activeSubjectId, channelSelection, calculations, peakConfig, smooth, segmentStart, segmentEnd, manualPeakActiveIndex, manualPeaks]);

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
    let values = cached ? cached[mode] : preview?.preview?.[c.index] || [];
    if (zoomedToSegment && values.length > 0) {
      const startIdx = Math.floor(segmentStart * values.length);
      const endIdx = Math.max(startIdx + 1, Math.ceil(segmentEnd * values.length));
      values = values.slice(startIdx, endIdx);
    }
    return { values, colorClass: `channel-color-${c.index % 8}` };
  });

  // Modo comparación: superpone la curva SIN suavizar y CON suavizar
  // del canal en foco (el que se esté editando a mano, o si no el
  // primero seleccionado), para ver el contraste entre ambas.
  const compareChannelIndex = manualPeakActiveIndex !== null ? manualPeakActiveIndex : channelSelection[0]?.index;
  const compareChannelSel = channelSelection.find((c) => c.index === compareChannelIndex);
  const compareData = (() => {
    if (!compareMode || compareChannelIndex === undefined) return null;
    const cached = channelPreviews[compareChannelIndex];
    if (!cached?.rms_normal || !cached?.rms_smoothed) return null;
    let normal = cached.rms_normal;
    let smoothed = cached.rms_smoothed;
    if (zoomedToSegment && normal.length > 0) {
      const startIdx = Math.floor(segmentStart * normal.length);
      const endIdx = Math.max(startIdx + 1, Math.ceil(segmentEnd * normal.length));
      normal = normal.slice(startIdx, endIdx);
      smoothed = smoothed.slice(startIdx, endIdx);
    }
    return [
      { values: normal, colorClass: "channel-color-7" },
      { values: smoothed, colorClass: "channel-color-0" },
    ];
  })();

  const activeChannelSel = channelSelection.find((c) => c.index === manualPeakActiveIndex);
  const activeChannelValues = (() => {
    if (manualPeakActiveIndex === null) return [];
    const cached = channelPreviews[manualPeakActiveIndex];
    let values = cached ? cached[mode] : [];
    if (zoomedToSegment && values.length > 0) {
      const startIdx = Math.floor(segmentStart * values.length);
      const endIdx = Math.max(startIdx + 1, Math.ceil(segmentEnd * values.length));
      values = values.slice(startIdx, endIdx);
    }
    return values;
  })();

  const peakMarkers =
    manualPeakActiveIndex !== null && totalDurationMs > 0
      ? (manualPeaks[manualPeakActiveIndex] || [])
          .map((t, originalIndex) => {
            const absFraction = t / totalDurationMs;
            const fraction = zoomedToSegment ? (absFraction - segmentStart) / (segmentEnd - segmentStart) : absFraction;
            const idx = Math.round(fraction * (activeChannelValues.length - 1));
            const value = activeChannelValues[idx];
            return {
              fraction,
              value,
              label: activeChannelSel?.label || `canal ${manualPeakActiveIndex}`,
              colorClass: `channel-color-${manualPeakActiveIndex % 8}`,
              originalIndex,
            };
          })
          .filter((p) => p.fraction >= -0.001 && p.fraction <= 1.001)
      : [];

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
            <button
              type="button"
              className="workspace-btn-ghost"
              onClick={() => setShowSequential(true)}
              disabled={!analyzeResult}
              title={!analyzeResult ? "Analiza primero para poder mostrarlo paso a paso" : "Mostrar paso a paso en clase"}
            >
              🎓 Modo secuencial
            </button>
            {loadingPreview && <span className="preview-loading mono">calculando…</span>}
          </div>
          {parsingFile && (
            <p className="upload-status mono">
              Leyendo archivo… si el servidor llevaba un rato sin usarse, puede tardar hasta 50s.
            </p>
          )}
          {error && <p className="workspace-error">{error}</p>}
          {detectingPeaks && (
            <p className="upload-status mono">
              Detectando picos… si el servidor llevaba un rato sin usarse, puede tardar hasta 50s.
            </p>
          )}

          {manualPeakActiveIndex !== null && (
            <div className="manual-peak-toolbar">
              <button type="button" className="workspace-btn-ghost exit-manual-btn" onClick={() => setManualPeakActiveIndex(null)}>
                ✕ Salir de "colocar picos"
              </button>
              <button
                type="button"
                className="workspace-btn-ghost"
                onClick={handleUndoPeak}
                disabled={peakHistory.length === 0}
                title="Deshacer el último pico añadido o quitado"
              >
                ↩ Deshacer
              </button>
            </div>
          )}

          <WaveformView
            channelsData={compareMode && compareData ? compareData : waveformData}
            onManualPeakClick={!compareMode && manualPeakActiveIndex !== null ? handleManualPeakClick : undefined}
            onPeakDrag={!compareMode && manualPeakActiveIndex !== null ? handlePeakDrag : undefined}
            onPeakRemove={!compareMode && manualPeakActiveIndex !== null ? handlePeakRemove : undefined}
            peakMarkers={compareMode ? [] : peakMarkers}
            activeChannelPosition={
              compareMode || manualPeakActiveIndex === null
                ? null
                : channelSelection.findIndex((c) => c.index === manualPeakActiveIndex)
            }
            segmentStartFraction={zoomedToSegment ? 0 : segmentStart}
            segmentEndFraction={zoomedToSegment ? 1 : segmentEnd}
            totalDurationMs={zoomedToSegment ? (segmentEnd - segmentStart) * totalDurationMs : totalDurationMs}
            strokeWidth={strokeWidth}
            chartStyle={chartStyle}
            showGrid={showGrid}
          />

          {channelSelection.length > 0 && (
            <div className="compare-toggle-row">
              <button
                type="button"
                className={`workspace-btn-ghost ${compareMode ? "is-active" : ""}`}
                onClick={() => setCompareMode((v) => !v)}
                title="Superpone la curva sin suavizar y con suavizar para ver el contraste"
              >
                📊 {compareMode ? "Ocultar comparación" : "Comparar normal vs. suavizado"}
              </button>
              {compareMode && compareChannelSel && (
                <div className="compare-legend mono">
                  <span className="compare-legend-item">
                    <span className="compare-swatch compare-swatch-normal" /> Normal
                  </span>
                  <span className="compare-legend-item">
                    <span className="compare-swatch compare-swatch-smoothed" /> Suavizado
                  </span>
                  <span className="compare-legend-channel">{compareChannelSel.label}</span>
                </div>
              )}
              {compareMode && !compareData && (
                <span className="compare-legend-channel">Selecciona un canal EMG para comparar.</span>
              )}
            </div>
          )}

          <div className="chart-controls">
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

            <div className="chart-style-switch">
              <button type="button" className={chartStyle === "line" ? "is-active" : ""} onClick={() => setChartStyle("line")}>
                Línea
              </button>
              <button type="button" className={chartStyle === "area" ? "is-active" : ""} onClick={() => setChartStyle("area")}>
                Área
              </button>
            </div>

            <button
              type="button"
              className={`workspace-btn-ghost ${showGrid ? "is-active" : ""}`}
              onClick={() => setShowGrid((v) => !v)}
            >
              ⊞ Cuadrícula
            </button>
          </div>

          {preview && (
            <>
              <SegmentSlider
                startFraction={segmentStart}
                endFraction={segmentEnd}
                totalDurationMs={totalDurationMs}
                onChange={(start, end) => {
                  setSegmentStart(start);
                  setSegmentEnd(end);
                  setZoomedToSegment(false);
                }}
                zoomed={zoomedToSegment}
                onToggleZoom={() => setZoomedToSegment((v) => !v)}
              />
              <div className="center-window-shortcut mono">
                <button
                  type="button"
                  className="workspace-btn-ghost"
                  onClick={() => {
                    const centerMs = totalDurationMs / 2;
                    setSegmentStart(Math.max(0, (centerMs - centerWindowMs) / totalDurationMs));
                    setSegmentEnd(Math.min(1, (centerMs + centerWindowMs) / totalDurationMs));
                    setZoomedToSegment(false);
                  }}
                >
                  Centrar ±
                </button>
                <input
                  type="number"
                  min="0"
                  value={centerWindowMs}
                  onChange={(e) => setCenterWindowMs(Number(e.target.value) || 0)}
                />
                ms
              </div>
            </>
          )}

          {preview && (
            <div className="preview-meta mono">
              fs: {preview.fs} Hz · {preview.n_samples} muestras · {preview.n_channels} canales · formato:{" "}
              {preview.format}
            </div>
          )}
          {preview?.converted_from_mv?.length > 0 && (
            <p className="upload-status mono">
              ⚡ Convertidos de mV a µV automáticamente: {preview.converted_from_mv.join(", ")}
            </p>
          )}

          {/* La tabla de resultados va creciendo aquí, en el centro,
              según se van efectuando análisis. */}
          {previewingLive && <p className="preview-loading mono">recalculando…</p>}
          <ResultsPanel channels={analyzeResult?.channels} sessionLabel={analyzeResult?.session_label} />

          <button
            className="workspace-btn-primary analyze-btn"
            onClick={handleAnalyze}
            disabled={!file || channelSelection.length === 0 || !activeSubjectId || analyzing}
          >
            {analyzing ? "Guardando…" : "💾 Guardar"}
          </button>

          <BatchImport
            desktopId={desktop.id}
            channelSelection={channelSelection}
            calculations={calculations}
            peakConfig={peakConfig}
            smooth={smooth}
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
                onSetManualPeakActive={handleSetManualPeakActive}
                onClearManualPeaks={handleClearManualPeaks}
              />
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
