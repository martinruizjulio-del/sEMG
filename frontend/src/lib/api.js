const BASE_URL = import.meta.env.VITE_API_URL || "";

function getToken() {
  return localStorage.getItem("semg_token");
}

export function setToken(token) {
  if (token) localStorage.setItem("semg_token", token);
  else localStorage.removeItem("semg_token");
}

async function request(path, { method = "GET", json, form, auth = true } = {}) {
  const headers = {};
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let body;
  if (form) {
    body = form; // FormData: no fijar Content-Type, lo hace el navegador
  } else if (json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }

  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      /* respuesta no era JSON */
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  return res.blob();
}

export const api = {
  requestCode: (email) => request("/auth/request-code", { method: "POST", json: { email }, auth: false }),
  verifyCode: (email, code) => request("/auth/verify-code", { method: "POST", json: { email, code }, auth: false }),

  listDesktops: () => request("/desktops"),
  createDesktop: (payload) => request("/desktops", { method: "POST", json: payload }),
  getDesktop: (id) => request(`/desktops/${id}`),

  listSubjects: (desktopId) => request(`/desktops/${desktopId}/subjects`),
  addSubject: (desktopId, group) =>
    request(`/desktops/${desktopId}/subjects`, { method: "POST", json: { group } }),

  listResults: (desktopId) => request(`/desktops/${desktopId}/results`),
  updateResult: (desktopId, resultId, includeInMatrix) =>
    request(`/desktops/${desktopId}/results/${resultId}`, {
      method: "PATCH",
      json: { include_in_matrix: includeInMatrix },
    }),

  exportDesktop: (desktopId) => request(`/desktops/${desktopId}/export`),

  parsePreview: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("/parse-preview", { method: "POST", form });
  },

  analyze: (desktopId, subjectId, file, config) => {
    const form = new FormData();
    form.append("file", file);
    form.append("config", JSON.stringify(config));
    return request(`/desktops/${desktopId}/subjects/${subjectId}/analyze`, { method: "POST", form });
  },

  channelPreview: (file, channels) => {
    const form = new FormData();
    form.append("file", file);
    form.append("channels", JSON.stringify(channels));
    return request("/channel-preview", { method: "POST", form });
  },
};
