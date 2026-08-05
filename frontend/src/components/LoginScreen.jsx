import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import "./LoginScreen.css";

/** Genera una polilínea que imita una señal EMG estabilizándose: ruido
 * alto al principio, que se atenúa hacia una línea de base — el
 * momento de apertura de la app, coherente con lo que mide. */
function useEmgTracePath(width = 640, height = 120, points = 220) {
  const [d, setD] = useState("");

  useEffect(() => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    const coords = [];
    for (let i = 0; i < points; i++) {
      const t = i / (points - 1);
      const decay = Math.max(0, 1 - t * 1.15);
      const noise = (rand() - 0.5) * height * 0.85 * decay;
      const burst = Math.sin(t * 38) * height * 0.12 * decay;
      const y = height / 2 + noise + burst;
      coords.push([t * width, y]);
    }

    const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    setD(path);
  }, [width, height, points]);

  return d;
}

export default function LoginScreen() {
  const { requestCode, verifyCode } = useAuth();
  const [stage, setStage] = useState("email"); // email | code
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const tracePath = useEmgTracePath();
  const pathRef = useRef(null);

  useEffect(() => {
    if (!pathRef.current) return;
    const length = pathRef.current.getTotalLength();
    pathRef.current.style.strokeDasharray = String(length);
    pathRef.current.style.strokeDashoffset = String(length);
    pathRef.current.getBoundingClientRect(); // forzar reflow
    pathRef.current.style.transition = "stroke-dashoffset 1.4s ease-out";
    pathRef.current.style.strokeDashoffset = "0";
  }, [tracePath]);

  async function handleRequestCode(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await requestCode(email);
      setStage("code");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await verifyCode(email, code);
    } catch (err) {
      setError("Código no válido o caducado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <svg className="login-trace" viewBox="0 0 640 120" preserveAspectRatio="none" aria-hidden="true">
          <path ref={pathRef} d={tracePath} />
        </svg>

        <div className="login-wordmark">
          <span className="login-dot" />
          sEMG
        </div>
        <p className="login-subtitle">Acceso restringido — Matlab_app</p>

        {stage === "email" && (
          <form onSubmit={handleRequestCode} className="login-form">
            <label htmlFor="email">Correo autorizado</label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu-correo@ejemplo.com"
            />
            <button type="submit" disabled={loading}>
              {loading ? "Enviando…" : "Enviar código"}
            </button>
          </form>
        )}

        {stage === "code" && (
          <form onSubmit={handleVerifyCode} className="login-form">
            <label htmlFor="code">Código de 6 cifras</label>
            <input
              id="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="mono login-code-input"
            />
            <button type="submit" disabled={loading || code.length !== 6}>
              {loading ? "Verificando…" : "Entrar"}
            </button>
            <button type="button" className="login-link" onClick={() => setStage("email")}>
              Usar otro correo
            </button>
          </form>
        )}

        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
}
