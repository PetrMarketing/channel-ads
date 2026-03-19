const API_BASE = import.meta.env.VITE_API_URL || '/api';

class AdminApiService {
  getToken() {
    return localStorage.getItem('admin_token');
  }

  async request(url, options = {}) {
    const token = this.getToken();
    const headers = { ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(`${API_BASE}/admin${url}`, { ...options, headers });
    if (res.status === 401) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      window.location.href = '/admin/login';
      return null;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || 'Request failed');
    return data;
  }

  get(url) { return this.request(url); }
  post(url, body) { return this.request(url, { method: 'POST', body: JSON.stringify(body) }); }
  put(url, body) { return this.request(url, { method: 'PUT', body: JSON.stringify(body) }); }
  delete(url) { return this.request(url, { method: 'DELETE' }); }
}

export const adminApi = new AdminApiService();
