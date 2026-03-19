const API_BASE = import.meta.env.VITE_API_URL || '/api';

class ApiService {
  getToken() {
    return localStorage.getItem('token');
  }

  async fetch(url, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let response;
    try {
      response = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers,
      });
    } catch (e) {
      throw new Error('Ошибка сети — проверьте подключение к интернету');
    }

    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      throw new Error('Не авторизован');
    }

    const data = await response.json();
    if (!response.ok && !data.success) {
      throw new Error(data.error || data.detail || `Ошибка сервера (${response.status})`);
    }
    return data;
  }

  get(url) {
    return this.fetch(url);
  }

  post(url, body) {
    return this.fetch(url, { method: 'POST', body: JSON.stringify(body) });
  }

  put(url, body) {
    return this.fetch(url, { method: 'PUT', body: JSON.stringify(body) });
  }

  patch(url, body) {
    return this.fetch(url, { method: 'PATCH', body: JSON.stringify(body) });
  }

  delete(url) {
    return this.fetch(url, { method: 'DELETE' });
  }

  async upload(url, formData, method = 'POST', onProgress = null) {
    const token = this.getToken();

    // Use XMLHttpRequest for progress tracking when callback provided
    if (onProgress) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, `${API_BASE}${url}`);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
            reject(new Error('Не авторизован'));
            return;
          }
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 400 && !data.success) {
              reject(new Error(data.error || data.detail || `Ошибка сервера (${xhr.status})`));
            } else {
              resolve(data);
            }
          } catch {
            reject(new Error(`Ошибка сервера (${xhr.status})`));
          }
        };

        xhr.onerror = () => reject(new Error('Ошибка сети'));
        xhr.send(formData);
      });
    }

    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}${url}`, {
      method,
      headers,
      body: formData,
    });

    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      throw new Error('Не авторизован');
    }

    const data = await response.json();
    if (!response.ok && !data.success) {
      throw new Error(data.error || data.detail || `Ошибка сервера (${response.status})`);
    }
    return data;
  }
}

export const api = new ApiService();
export { API_BASE };
