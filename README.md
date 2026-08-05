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

- Frontend React (subida de archivos, visualización raw/filtrada/RMS
  con slider, selección de canales)
- Integración opcional con OneDrive (fase 2)
- Despliegue en sEMG.actividadfisica.app

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
