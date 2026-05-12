import { supabase } from "../supabaseClient";

const BASE_URL = process.env.REACT_APP_BACKEND_URL || 'https://uce-parking-backend.onrender.com/api';

/**
 * Helper to make authorized requests to the backend
 */
async function apiFetch(endpoint, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();

  const headers = {
    'Content-Type': 'application/json',
    ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` }),
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `Error: ${response.status}`);
  }

  return response;
}

export const accessApi = {
  openMain: () => apiFetch('/access/open-main', { method: 'POST' }),
  openVip: () => apiFetch('/access/open-vip', { method: 'POST' }),
  openExit: () => apiFetch('/access/open-exit', { method: 'POST' }),
  validarCodigo: async (codigo) => {
    const res = await apiFetch('/access/validar-codigo', {
      method: 'POST',
      body: JSON.stringify({ codigo })
    });
    return res.json();
  },
};

export const reportsApi = {
  generate: (payload) => apiFetch('/reports', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  previewNew: (payload) => apiFetch('/reports/preview', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  previewExisting: (id) => apiFetch(`/reports/${id}/preview`),
  downloadExcel: async (id, title) => {
    const response = await apiFetch(`/reports/${id}/download`);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte_${title.replace(/ /g, '_')}_${id}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
  // RF16.3: Exportar PDF
  downloadPdf: async (id, title) => {
    const response = await apiFetch(`/reports/${id}/download-pdf`);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte_${(title || 'GENERAL').replace(/ /g, '_')}_${id}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
};

// ─── Scanner USB — Salida por Ticket ─────────────────────────────────────────
export const scannerApi = {
  /**
   * Procesa la salida de un ticket escaneado por el lector USB.
   * El escáner envía el token (código de barras) y el backend valida,
   * cierra el ticket, libera la plaza y abre la barrera de salida.
   * @param {string} token - Valor leído por el escáner (ej: "TICKET-42-L010536")
   * @returns {Promise<object>} Respuesta del backend con placa, visitante, duración, etc.
   */
  procesarSalidaTicket: async (token) => {
    const res = await apiFetch('/scanner/salida-ticket', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    return res.json();
  },
};

// ─── Pantallas (tabla pantalla) ────────────────────────────────────────────────
export const pantallaApi = {
  list:   ()           => apiFetch('/pantalla').then(r => r.json()),
  get:    (id)         => apiFetch(`/pantalla/${id}`).then(r => r.json()),
  create: (body)       => apiFetch('/pantalla', { method: 'POST', body: JSON.stringify(body) }).then(r => r.json()),
  update: (id, body)   => apiFetch(`/pantalla/${id}`, { method: 'PUT',  body: JSON.stringify(body) }).then(r => r.json()),
  remove: (id)         => apiFetch(`/pantalla/${id}`, { method: 'DELETE' }).then(r => r.json()),
};
