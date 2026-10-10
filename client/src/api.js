const KEY = 'versechat_token';
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

export const getToken = () => localStorage.getItem(KEY);
export const setToken = t => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

async function req(path, { method = 'GET', body, raw, headers = {} } = {}) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}),
      ...headers
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { status: res.status });
  return data;
}

export const api = {
  register: (username, password) => req('/api/register', { method: 'POST', body: { username, password } }),
  login: (username, password) => req('/api/login', { method: 'POST', body: { username, password } }),
  me: () => req('/api/me'),
  updateBio: bio => req('/api/me', { method: 'PUT', body: { bio } }),
  setAvatar: blob => req('/api/me/avatar', { method: 'PUT', raw: blob, headers: { 'Content-Type': 'application/octet-stream' } }),
  removeAvatar: () => req('/api/me/avatar', { method: 'DELETE' }),
  setNickname: (userId, nickname) => req(`/api/nicknames/${userId}`, { method: 'PUT', body: { nickname } }),
  summarize: (id, range) => req(`/api/conversations/${id}/summary`, { method: 'POST', body: { range } }),
  iceServers: () => req('/api/ice'),
  users: () => req('/api/users'),
  conversations: () => req('/api/conversations'),
  openDm: userId => req('/api/conversations', { method: 'POST', body: { type: 'dm', userId } }),
  createGroup: (name, members) => req('/api/conversations', { method: 'POST', body: { type: 'group', name, members } }),
  messages: id => req(`/api/conversations/${id}/messages`),
  upload: (file, extra = {}) =>
    req('/api/upload', { method: 'POST', raw: file, headers: { 'Content-Type': 'application/octet-stream', 'x-filename': encodeURIComponent(file.name), ...extra } })
};
