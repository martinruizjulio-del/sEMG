import "./ChannelPanel.css";

// Detecta el lado a partir del nombre del canal, tal como lo exportan
// los equipos EMG habituales (p.ej. "Biceps femoris Right µV").
// OJO: el aparato de Julio etiqueta el lado AL REVÉS de la realidad
// (confirmado comparando con mediciones de referencia), así que aquí
// se invierte automáticamente: lo que el archivo llama "Right" se usa
// como Izquierdo, y viceversa.
function detectSide(label) {
  const l = label.toLowerCase();
  if (/\bright\b|\bderecho\b|\(r\)/.test(l)) return "L";
  if (/\bleft\b|\bizquierdo\b|\(l\)/.test(l)) return "R";
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

  function addChannel(index, label) {
    onChange([...selection, { index, label, side: detectSide(label), sensor_type: detectSensorType(label) }]);
  }

  function removeChannel(index) {
    onChange(selection.filter((c) => c.index !== index));
  }

  function selectAll() {
    onChange(channels.map((label, index) => ({ index, label, side: detectSide(label), sensor_type: detectSensorType(label) })));
  }

  // El orden en el que aparecen aquí es el orden que se usará en los
  // resultados y en la exportación a Excel -algunos equipos EMG no
  // respetan el orden de canales configurado, así que este orden
  // manual es independiente de cómo venga el archivo-.
  function moveChannel(fromIndex, direction) {
    const to = fromIndex + direction;
    if (to < 0 || to >= selection.length) return;
    const next = [...selection];
    [next[fromIndex], next[to]] = [next[to], next[fromIndex]];
    onChange(next);
  }

  const availableChannels = channels
    .map((label, index) => ({ label, index }))
    .filter(({ index }) => !selection.some((c) => c.index === index));

  return (
    <div className="channel-panel">
      <div className="channel-panel-header">
        <h3>Canales</h3>
        <button type="button" className="channel-panel-selectall" onClick={selectAll}>
          Seleccionar todos
        </button>
      </div>

      {selection.length > 0 && (
        <>
          <div className="channel-panel-section-label">Seleccionados (este orden se usa en resultados y Excel)</div>
          <ul className="channel-list">
            {selection.map((sel, pos) => (
              <li key={sel.index} className="channel-row is-selected">
                <div className="channel-order-controls">
                  <button type="button" onClick={() => moveChannel(pos, -1)} disabled={pos === 0} title="Subir">
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveChannel(pos, 1)}
                    disabled={pos === selection.length - 1}
                    title="Bajar"
                  >
                    ▼
                  </button>
                </div>
                <div className="channel-row-body">
                  <label className="channel-checkbox">
                    <span className={`channel-swatch channel-color-${sel.index % 8}`} />
                    <input type="checkbox" checked onChange={() => removeChannel(sel.index)} />
                    <span className="channel-label">{sel.label}</span>
                  </label>

                  <div className="channel-controls">
                    <select
                      value={sel.side || ""}
                      onChange={(e) => updateChannel(sel.index, { side: e.target.value || null })}
                    >
                      <option value="">Lado —</option>
                      <option value="R">Derecho (R)</option>
                      <option value="L">Izquierdo (L)</option>
                    </select>
                    <select
                      value={sel.sensor_type}
                      onChange={(e) => updateChannel(sel.index, { sensor_type: e.target.value })}
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
                          className={`channel-manual-btn ${manualPeakActiveIndex === sel.index ? "is-active" : ""}`}
                          onClick={() => onSetManualPeakActive(manualPeakActiveIndex === sel.index ? null : sel.index)}
                          title="Colocar picos manualmente haciendo clic en el gráfico"
                        >
                          {manualPeakActiveIndex === sel.index ? "Colocando…" : "Manual"}
                        </button>
                        {(manualPeaks[sel.index]?.length || 0) > 0 && (
                          <>
                            <span className="channel-manual-count">{manualPeaks[sel.index].length} picos</span>
                            <button type="button" className="channel-manual-clear" onClick={() => onClearManualPeaks(sel.index)}>
                              Limpiar
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {availableChannels.length > 0 && (
        <>
          <div className="channel-panel-section-label">Disponibles</div>
          <ul className="channel-list channel-list-available">
            {availableChannels.map(({ label, index }) => (
              <li key={index} className="channel-row">
                <label className="channel-checkbox">
                  <span className={`channel-swatch channel-color-${index % 8}`} />
                  <input type="checkbox" checked={false} onChange={() => addChannel(index, label)} />
                  <span className="channel-label">{label}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
