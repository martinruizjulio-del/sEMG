import "./ChannelPanel.css";

// Detecta el lado (derecho/izquierdo) a partir del nombre del canal,
// tal como lo exportan los equipos EMG habituales
// (p.ej. "Biceps femoris Right µV", "Vastus lateralis Left µV").
function detectSide(label) {
  const l = label.toLowerCase();
  if (/\bright\b|\bderecho\b|\(r\)/.test(l)) return "R";
  if (/\bleft\b|\bizquierdo\b|\(l\)/.test(l)) return "L";
  return null;
}

// Detecta si el canal es de fuerza (p.ej. "6 Newton") en vez de EMG,
// para no aplicarle por error el filtrado/RMS pensado para EMG.
function detectSensorType(label) {
  const l = label.toLowerCase();
  if (/newton|\bfuerza\b|\bforce\b/.test(l)) return "force_platform";
  return "emg";
}

export default function ChannelPanel({
  channels,
  selection,
  onChange,
  calculationsIncludePicos = false,
  manualPeaks = {},
  manualPeakActiveIndex = null,
  onSetManualPeakActive,
  onClearManualPeaks,
}) {
  function updateChannel(index, patch) {
    onChange(selection.map((c) => (c.index === index ? { ...c, ...patch } : c)));
  }

  function toggleChannel(index, label) {
    const exists = selection.find((c) => c.index === index);
    if (exists) {
      onChange(selection.filter((c) => c.index !== index));
    } else {
      onChange([...selection, { index, label, side: detectSide(label), sensor_type: detectSensorType(label) }]);
    }
  }

  function selectAll() {
    onChange(channels.map((label, index) => ({ index, label, side: detectSide(label), sensor_type: detectSensorType(label) })));
  }

  return (
    <div className="channel-panel">
      <div className="channel-panel-header">
        <h3>Canales</h3>
        <button type="button" className="channel-panel-selectall" onClick={selectAll}>
          Seleccionar todos
        </button>
      </div>

      <ul className="channel-list">
        {channels.map((label, index) => {
          const sel = selection.find((c) => c.index === index);
          return (
            <li key={index} className="channel-row">
              <label className="channel-checkbox">
                <span className={`channel-swatch channel-color-${index % 8}`} />
                <input type="checkbox" checked={!!sel} onChange={() => toggleChannel(index, label)} />
                <span className="channel-label">{label}</span>
              </label>

              {sel && (
                <div className="channel-controls">
                  <select
                    value={sel.side || ""}
                    onChange={(e) => updateChannel(index, { side: e.target.value || null })}
                  >
                    <option value="">Lado —</option>
                    <option value="R">Derecho (R)</option>
                    <option value="L">Izquierdo (L)</option>
                  </select>
                  <select
                    value={sel.sensor_type}
                    onChange={(e) => updateChannel(index, { sensor_type: e.target.value })}
                  >
                    <option value="emg">EMG</option>
                    <option value="accelerometer">Acelerómetro</option>
                    <option value="force_platform">Plataforma de fuerza</option>
                    <option value="raw">Sin filtrar</option>
                  </select>
                  {calculationsIncludePicos && (
                    <div className="channel-manual-peaks">
                      <button
                        type="button"
                        className={`channel-manual-btn ${manualPeakActiveIndex === index ? "is-active" : ""}`}
                        onClick={() => onSetManualPeakActive(manualPeakActiveIndex === index ? null : index)}
                        title="Colocar picos manualmente haciendo clic en el gráfico"
                      >
                        {manualPeakActiveIndex === index ? "Colocando…" : "Manual"}
                      </button>
                      {(manualPeaks[index]?.length || 0) > 0 && (
                        <>
                          <span className="channel-manual-count">{manualPeaks[index].length} picos</span>
                          <button type="button" className="channel-manual-clear" onClick={() => onClearManualPeaks(index)}>
                            Limpiar
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
