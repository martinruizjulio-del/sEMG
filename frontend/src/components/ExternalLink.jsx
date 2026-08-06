import { useState } from "react";
import { api } from "../lib/api";
import "./ExternalLink.css";

/**
 * Enlace externo (con permiso de edición) asociado al escritorio, para
 * volcar ahí los resultados -p.ej. una hoja de cálculo compartida-.
 */
export default function ExternalLink({ desktop, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(desktop.edit_link_url || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await api.updateDesktop(desktop.id, { edit_link_url: value.trim() });
      onUpdated(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="external-link-edit">
        <input
          type="url"
          autoFocus
          placeholder="https://…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
        />
        <button type="button" className="workspace-btn-primary" onClick={handleSave} disabled={saving}>
          Guardar
        </button>
        <button type="button" className="workspace-btn-ghost" onClick={() => setEditing(false)}>
          Cancelar
        </button>
      </div>
    );
  }

  if (desktop.edit_link_url) {
    return (
      <div className="external-link">
        <a href={desktop.edit_link_url} target="_blank" rel="noopener noreferrer" className="external-link-open">
          🔗 Enlace externo
        </a>
        <button type="button" className="external-link-edit-btn" onClick={() => setEditing(true)} title="Cambiar enlace">
          Editar
        </button>
      </div>
    );
  }

  return (
    <button type="button" className="workspace-btn-ghost" onClick={() => setEditing(true)}>
      🔗 Añadir enlace externo
    </button>
  );
}
