# Matlab_app (sEMG.actividadfisica.app)

Aplicación web personal para análisis de señales EMG, acelerometría y
plataformas de fuerza, con precisión equivalente a los scripts MATLAB
originales de Julio, pensada para usarse desde cualquier lugar.

## Arquitectura

```
matlab-app/
├── backend/           FastAPI + NumPy/SciPy (cálculo pesado en servidor)
│   └── app/
│       ├── parsers/    Lectura de .ASC, .emt, .csv/.txt heterogéneos
│       ├── processing/ Filtros, RMS, picos, FFT, fatiga, ratio bilateral
│       └── main.py      API (esqueleto inicial)
└── frontend/          React + Vite (a construir en la siguiente fase)
```

**Por qué backend en Python**: los archivos `.emt` de ejemplo llegan a
50MB / 200.000+ muestras; procesarlos de forma fiable en el navegador
(especialmente en móvil) no es recomendable. El backend calcula y el
frontend solo sube archivos y muestra resultados/gráficos.

## Módulos ya implementados y validados contra archivos reales

- `parsers/asc_parser.py` — MegaWin ASCII (secciones DEFINITIONS/SOURCE
  NAMES/SIDE INFO/UNITS/DATA)
- `parsers/emt_parser.py` — BTS ASCII, con **conversión automática
  mV→µV** según la cabecera `Measure unit`
- `parsers/csv_txt_parser.py` — detección automática de delimitador
  (`;`, tab, `,`), separador decimal (coma/punto) y columnas vacías,
  sin índices fijos
- `processing/filters.py` — filtro EMG Butterworth idéntico a
  `Filtro_emg.m` (vía `scipy.signal.iirdesign`, equivalente a
  `fdesign.bandpass` + `MatchExactly/stopband`), más filtros paso-bajo
  para acelerómetro y plataforma de fuerzas
- `processing/rms.py` — réplica exacta de `Rms_emg.m`
- `processing/peaks.py` — detección de picos configurable (nº de
  picos, distancia mínima, altura mínima) + posicionamiento manual
- `processing/frequency.py` — frecuencia dominante vía FFT (como
  `Frequency.m`)
- `processing/fatigue.py` — índice de fatiga vía pendiente de
  frecuencia mediana en ventanas sucesivas
- `processing/channels.py` — ratio bilateral y normalización de
  activación (% sobre el total)

Todos estos módulos se han probado contra `S1_1.ASC`, `S11_1.emt` y
`Elemplo.csv` reales durante el desarrollo.

## Pendiente (siguiente iteración)

- Slider de segmentación temporal sobre la forma de onda
- Plantillas de canal desde la UI (el backend ya las soporta)
- Comparación entre dos archivos (elegir con qué serie quedarse)
- Ratio bilateral y normalización de activación en la UI
- Integración opcional con OneDrive (fase 2)
- Despliegue en sEMG.actividadfisica.app

**Importante — seguridad**: nunca subas un archivo `backend/.env` con
secretos reales a este repo (es público). Usa `.env.example` como
plantilla y pon los valores reales solo en las variables de entorno
del servicio donde despliegues.

## Frontend (React + Vite)

Construido y probado (`npm run build` sin errores). Sigue el sistema
de diseño de un instrumento de laboratorio EMG: fondo casi negro,
acento ámbar (dial analógico), paleta categórica de 8 colores para
canales, tipografía Space Grotesk/IBM Plex Sans/IBM Plex Mono.

Pantallas ya funcionales:
- **Login**: correo + código de 6 cifras, con un trazo EMG animado
  como apertura.
- **Escritorios**: barra lateral para crear/abrir escritorios.
- **Espacio de trabajo**: subir archivo → vista previa de canales
  detectados → seleccionar canales (lado, tipo de sensor) → elegir
  cálculos (media/máximo/mediana/picos/frecuencia/fatiga) → analizar
  y guardar → ver resultados → exportar a `.xlsx`.

```bash
cd frontend
npm install
cp .env.example .env   # ajusta VITE_API_URL si el backend no está en localhost:8000
npm run dev
```


## Ya implementado y probado de extremo a extremo

- **Auth por código**: `POST /auth/request-code` (envía/loguea código
  de 6 cifras) + `POST /auth/verify-code` (devuelve sesión JWT).
  Solo el correo en `ALLOWED_EMAIL` puede entrar.
- **Escritorios**: crear/listar (`/desktops`), cada uno con nombre,
  carpeta y enlace de edición opcionales.
- **Sujetos**: se numeran automáticamente "Sujeto 1", "Sujeto 2"... y
  llevan grupo control/experimental (por defecto experimental).
- **Plantillas de canal**: guardables por escritorio, para no
  re-etiquetar canales en cada sujeto.
- **Resultados → matriz de datos**: cada resultado lleva un nombre de
  variable generado automáticamente sin espacios ni caracteres
  especiales (`app/core/naming.py`).
- **Exportación a Excel**: `GET /desktops/{id}/export` genera un
  `.xlsx` real con una fila por sujeto y una columna por variable.
- **Análisis end-to-end**: `POST /desktops/{id}/subjects/{subject_id}/analyze`
  — subes un archivo (.ASC/.emt/.csv/.txt), indicas qué canales y qué
  cálculos quieres (media, máximo, mediana, picos, frecuencia, fatiga),
  y aplica el pipeline correcto según el tipo de sensor: para EMG,
  frecuencia dominante y fatiga se calculan sobre la señal filtrada
  (no sobre la envolvente RMS, que al ser siempre positiva distorsiona
  el contenido espectral); media/máximo/mediana/picos se calculan
  sobre la envolvente RMS, igual que en Slider.m. El archivo subido
  nunca se guarda en disco, solo vive en memoria durante la petición.
- **Vista previa real por modo**: `POST /channel-preview` — dado un
  archivo y los canales seleccionados, calcula y decima las tres
  versiones (raw / filtrado / RMS) una sola vez, para que el frontend
  cambie de modo instantáneamente sin volver a subir el archivo. Ya
  conectado al interruptor Raw/Filtrado/RMS del frontend.

Probado con un test end-to-end: pedir código → verificar → crear
escritorio → crear 2 sujetos (uno control, uno experimental) → subir
`S1_1.ASC` real y analizarlo (media/máximo/picos/frecuencia/fatiga) →
comprobar que los resultados se guardan → exportar → el `.xlsx`
resultante contiene exactamente los valores calculados con sus nombres
de variable generados automáticamente.

## Variables de entorno (backend/.env)

```
ALLOWED_EMAIL=tu-correo@ejemplo.com
JWT_SECRET=genera-un-secreto-largo-y-aleatorio
DATABASE_URL=sqlite:///./dev.db   # cambiar a postgres en producción
RESEND_API_KEY=                  # vacío = el código se imprime en consola (dev)
```


## Arrancar el backend en local

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Luego puedes probar `POST /parse-preview` subiendo cualquiera de tus
archivos de ejemplo para comprobar que detecta canales y frecuencia de
muestreo correctamente.

## Repositorio en GitHub

Repo confirmado: https://github.com/martinruizjulio-del/sEMG (público,
Claude puede leerlo pero no hacer `push` sin tus credenciales). Pasos
para subir este código:

```bash
# Descomprime el zip y entra en la carpeta matlab-app/
cd matlab-app
git init
git add .
git commit -m "Scaffold inicial: parsers, procesamiento de señales, auth y escritorios"
git branch -M main
git remote add origin https://github.com/martinruizjulio-del/sEMG.git
git push -u origin main
```

## Desplegar en Plesk (un único subdominio)

Backend y frontend viven en **un solo subdominio** (p.ej.
`smeg.actividadfisica.app`): el propio backend Python sirve también
el frontend ya compilado desde `backend/static/`, así que solo hace
falta configurar **una** app en Plesk. Mismo origen = sin CORS que
gestionar.

Plesk usa Phusion Passenger, que sirve apps **WSGI** (Flask/Django).
FastAPI es **ASGI**, así que se incluye `backend/passenger_wsgi.py`
que adapta la app con `a2wsgi`.

### 1. Compila el frontend y cópialo dentro del backend

En tu ordenador (con Node instalado):

```bash
cd frontend
npm install
npm run build          # genera frontend/dist/
cp -r dist ../backend/static
```

**No definas `VITE_API_URL`** al compilar para producción (déjalo sin
`.env`, o vacío) — así el frontend llama a la API con rutas relativas
al mismo origen, en vez de a `localhost:8000`.

### 2. Sube `backend/` (ya con `static/` dentro) al subdominio

1. En Plesk, en la ficha de `smeg.actividadfisica.app`, activa
   **Python** (icono "Python").
2. **Application Root**: `backend` (debe contener ya la carpeta
   `static/` con el frontend compilado dentro).
3. **Application Startup File**: `passenger_wsgi.py`
4. **Application Entry point**: `application`
5. Sube el código (Git o gestor de archivos) y pulsa **Run pip install**
   (usa `requirements.txt`, ya incluye `a2wsgi`).
6. En **Variables de entorno** de la app Python, añade:
   ```
   ALLOWED_EMAIL=tu-correo@ejemplo.com
   JWT_SECRET=<genera uno largo y aleatorio>
   DATABASE_URL=sqlite:///./dev.db
   RESEND_API_KEY=<opcional, si quieres emails reales>
   ```
7. Reinicia la app Python desde Plesk.
8. Comprueba `https://smeg.actividadfisica.app/health` → debe
   responder `{"status":"ok"}`, y `https://smeg.actividadfisica.app/`
   debe cargar la app (pantalla de login).

Cada vez que cambies el frontend, repite el paso 1 (recompilar y
copiar a `backend/static/`) y vuelve a subir esa carpeta.


## Alternativa: desplegar en Render (si tu Plesk no tiene Python)

Si tu hosting Plesk no ofrece la extensión de Python (algunos planes
no la incluyen y depende del proveedor activarla), la alternativa más
simple es Render (tiene plan gratuito y corre Python de forma nativa,
sin necesidad de `passenger_wsgi.py`/`a2wsgi`):

1. `cd frontend && npm install && npm run build && cp -r dist ../backend/static`
2. Sube `backend/static/` al repo de GitHub.
3. En [render.com](https://render.com), inicia sesión con GitHub y
   crea un **Web Service** apuntando al repo, con:
   - Root Directory: `backend`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Variables de entorno: `ALLOWED_EMAIL`, `JWT_SECRET`,
     `DATABASE_URL=sqlite:///./dev.db`, `RESEND_API_KEY` (opcional)
4. Cuando funcione en la URL `.onrender.com`, puedes apuntar tu
   subdominio `smeg.actividadfisica.app` a Render con un registro
   CNAME (Render te da la URL exacta en su panel, en "Custom Domains").
