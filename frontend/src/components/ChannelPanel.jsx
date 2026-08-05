import "./ChannelPanel.css";

export default function ChannelPanel({ channels, selection, onChange }) {
  function updateChannel(index, patch) {
    onChange(selection.map((c) => (c.index === index ? { ...c, ...patch } : c)));
  }

  function toggleChannel(index, label) {
    const exists = selection.find((c) => c.index === index);
    if (exists) {
      onChange(selection.filter((c) => c.index !== index));
    } else {
      onChange([...selection, { index, label, side: null, sensor_type: "emg" }]);
    }
  }

  function selectAll() {
    onChange(channels.map((label, index) => ({ index, label, side: null, sensor_type: "emg" })));
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
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
