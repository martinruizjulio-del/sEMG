import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import CalculationPanel from "./CalculationPanel";
import "./DesktopList.css";

export default function DesktopList({
  desktops,
  activeId,
  onSelect,
  onCreate,
  calculations,
  onChangeCalculations,
  peakConfig,
  onChangePeakConfig,
  peakWindowConfig,
  onChangePeakWindowConfig,
  onDetectPeaks,
  onManualPlace,
  smooth,
  onChangeSmooth,
}) {
  const { logout } = useAuth();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  function submitCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim());
    setName("");
    setCreating(false);
  }

  return (
    <aside className="desktop-list">
      <div className="desktop-list-header">
        <span className="desktop-list-brand">
          <span className="desktop-list-dot" /> sEMG
        </span>
      </div>

      <div className="desktop-list-greeting">
        <span>¡Hola Julio!</span>
        <button className="desktop-list-logout" onClick={logout} title="Cerrar sesión">
          Salir
        </button>
      </div>

      <div className="desktop-list-section-label">Escritorios</div>

      <ul>
        {desktops.map((d) => (
          <li key={d.id}>
            <button
              className={`desktop-item ${d.id === activeId ? "is-active" : ""}`}
              onClick={() => onSelect(d.id)}
            >
              {d.name}
            </button>
          </li>
        ))}
      </ul>

      {creating ? (
        <form onSubmit={submitCreate} className="desktop-create-form">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del escritorio"
            onBlur={() => !name && setCreating(false)}
          />
        </form>
      ) : (
        <button className="desktop-create-btn" onClick={() => setCreating(true)}>
          + Nuevo escritorio
        </button>
      )}

      {calculations && (
        <div className="desktop-list-calc-panel">
          <div className="desktop-list-section-label">Opciones generales</div>
          <CalculationPanel
            calculations={calculations}
            onChangeCalculations={onChangeCalculations}
            peakConfig={peakConfig}
            onChangePeakConfig={onChangePeakConfig}
            peakWindowConfig={peakWindowConfig}
            onChangePeakWindowConfig={onChangePeakWindowConfig}
            onDetectPeaks={onDetectPeaks}
            onManualPlace={onManualPlace}
            smooth={smooth}
            onChangeSmooth={onChangeSmooth}
          />
        </div>
      )}
    </aside>
  );
}
