import { supabase } from "../supabaseClient";

const BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000/api';

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
  }
};
