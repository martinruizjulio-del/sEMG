import { useState, useEffect, useCallback } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import LoginScreen from "./components/LoginScreen";
import DesktopList from "./components/DesktopList";
import DesktopWorkspace from "./components/DesktopWorkspace";
import { api } from "./lib/api";
import "./App.css";

function AppShell() {
  const [desktops, setDesktops] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const loadDesktops = useCallback(async () => {
    const list = await api.listDesktops();
    setDesktops(list);
    setLoaded(true);
    if (list.length > 0 && !activeId) setActiveId(list[0].id);
  }, [activeId]);

  useEffect(() => {
    loadDesktops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(name) {
    const desktop = await api.createDesktop({ name });
    setDesktops((prev) => [desktop, ...prev]);
    setActiveId(desktop.id);
  }

  const activeDesktop = desktops.find((d) => d.id === activeId);

  return (
    <div className="app-shell">
      <DesktopList desktops={desktops} activeId={activeId} onSelect={setActiveId} onCreate={handleCreate} />
      {activeDesktop ? (
        <DesktopWorkspace key={activeDesktop.id} desktop={activeDesktop} />
      ) : (
        <div className="app-empty-state">
          {loaded ? "Crea un escritorio nuevo para empezar." : "Cargando…"}
        </div>
      )}
    </div>
  );
}

function Gate() {
  const { authed } = useAuth();
  return authed ? <AppShell /> : <LoginScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
