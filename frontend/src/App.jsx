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
  // Opciones de cálculo: viven aquí (no dentro de DesktopWorkspace) para
  // poder mostrarlas en la columna izquierda, junto a la lista de
  // escritorios, en vez de en el centro.
  const [calculations, setCalculations] = useState(["media", "maximo", "picos"]);
  const [peakConfig, setPeakConfig] = useState({ n_peaks: null, min_peak_distance_ms: null });
  // Suavizado tipo smoothdata() de MATLAB: es sí/no (sin niveles
  // intermedios), y afecta de verdad a los cálculos -no es solo un
  // efecto visual-, aplicado tras el RMS, igual que en el script de
  // referencia.
  const [smooth, setSmooth] = useState(false);
  // El botón "Detectar y ajustar picos" vive en la columna izquierda
  // (dentro de CalculationPanel), pero la lógica de análisis vive en
  // DesktopWorkspace. Se comunican con una simple señal (un contador):
  // al pulsar el botón se incrementa, y DesktopWorkspace reacciona.
  const [detectPeaksSignal, setDetectPeaksSignal] = useState(0);

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

  function handleDesktopUpdated(updated) {
    setDesktops((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }

  return (
    <div className="app-shell">
      <DesktopList
        desktops={desktops}
        activeId={activeId}
        onSelect={setActiveId}
        onCreate={handleCreate}
        calculations={calculations}
        onChangeCalculations={setCalculations}
        peakConfig={peakConfig}
        onChangePeakConfig={setPeakConfig}
        onDetectPeaks={() => setDetectPeaksSignal((n) => n + 1)}
        smooth={smooth}
        onChangeSmooth={setSmooth}
      />
      {activeDesktop ? (
        <DesktopWorkspace
          key={activeDesktop.id}
          desktop={activeDesktop}
          onDesktopUpdated={handleDesktopUpdated}
          calculations={calculations}
          peakConfig={peakConfig}
          detectPeaksSignal={detectPeaksSignal}
          smooth={smooth}
        />
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
