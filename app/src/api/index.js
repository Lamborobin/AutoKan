import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// Attach JWT token if present; fall back to X-Agent-Id for AI agent calls
api.interceptors.request.use(config => {
  const token = localStorage.getItem('fa_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  } else {
    // Legacy: keep X-Agent-Id for dev/agent runner compat
    config.headers['X-Agent-Id'] = 'human';
  }
  return config;
});

export const authApi = {
  google: (credential) => api.post('/auth/google', { credential }).then(r => r.data),
  me: () => api.get('/auth/me').then(r => r.data),
  updateProfile: (data) => api.patch('/auth/profile', data).then(r => r.data),
};

export const projectsApi = {
  list: (includeArchived = false) => api.get('/projects', { params: { include_archived: includeArchived } }).then(r => r.data),
  get: (id) => api.get(`/projects/${id}`).then(r => r.data),
  create: (data) => api.post('/projects', data).then(r => r.data),
  update: (id, data) => api.patch(`/projects/${id}`, data).then(r => r.data),
  archive: (id) => api.post(`/projects/${id}/archive`).then(r => r.data),
  unarchive: (id) => api.post(`/projects/${id}/unarchive`).then(r => r.data),
  delete: (id) => api.delete(`/projects/${id}`).then(r => r.data),
};

export const tasksApi = {
  list: (params) => api.get('/tasks', { params }).then(r => r.data),
  get: (id) => api.get(`/tasks/${id}`).then(r => r.data),
  create: (data) => api.post('/tasks', data).then(r => r.data),
  update: (id, data) => api.patch(`/tasks/${id}`, data).then(r => r.data),
  move: (id, column_id, message) => api.post(`/tasks/${id}/move`, { column_id, message }).then(r => r.data),
  log: (id, action, message) => api.post(`/tasks/${id}/log`, { action, message }).then(r => r.data),
  delete: (id) => api.delete(`/tasks/${id}`).then(r => r.data),
  requestPmReview: (id) => api.post(`/tasks/${id}/request_pm_review`).then(r => r.data),
  pmReview: (id, data) => api.post(`/tasks/${id}/pm_review`, data).then(r => r.data),
  pmQuestion: (id, data) => api.post(`/tasks/${id}/pm_question`, data).then(r => r.data),
  answer: (id, data) => api.post(`/tasks/${id}/answer`, data).then(r => r.data),
  approve: (id, data) => api.post(`/tasks/${id}/approve`, data).then(r => r.data),
  reject: (id, data) => api.post(`/tasks/${id}/reject`, data).then(r => r.data),
  archive: (id) => api.post(`/tasks/${id}/archive`).then(r => r.data),
  unarchive: (id) => api.post(`/tasks/${id}/unarchive`).then(r => r.data),
  approvePr: (id) => api.post(`/tasks/${id}/approve_pr`).then(r => r.data),
  checkPr: (id) => api.get(`/tasks/${id}/check_pr`).then(r => r.data),
  bypassPm: (id) => api.post(`/tasks/${id}/bypass_pm`).then(r => r.data),
  toggleChecklistItem: (id, index) => api.post(`/tasks/${id}/toggle_checklist_item`, { index }).then(r => r.data),
};

export const columnsApi = {
  list: (includeArchived = false) => api.get('/columns', { params: { include_archived: includeArchived } }).then(r => r.data),
  create: (data) => api.post('/columns', data).then(r => r.data),
  update: (id, data) => api.patch(`/columns/${id}`, data).then(r => r.data),
  archive: (id) => api.post(`/columns/${id}/archive`).then(r => r.data),
  unarchive: (id) => api.post(`/columns/${id}/unarchive`).then(r => r.data),
  delete: (id) => api.delete(`/columns/${id}`).then(r => r.data),
};

export const agentsApi = {
  list: () => api.get('/agents').then(r => r.data),
  get: (id) => api.get(`/agents/${id}`).then(r => r.data),
  create: (data) => api.post('/agents', data).then(r => r.data),
  update: (id, data) => api.patch(`/agents/${id}`, data).then(r => r.data),
  archive: (id) => api.post(`/agents/${id}/archive`).then(r => r.data),
  unarchive: (id) => api.post(`/agents/${id}/unarchive`).then(r => r.data),
  delete: (id) => api.delete(`/agents/${id}`).then(r => r.data),
};

export const secretsApi = {
  list: () => api.get('/secrets').then(r => r.data),
  request: (data) => api.post('/secrets', data).then(r => r.data),
  resolve: (id, status) => api.patch(`/secrets/${id}/resolve`, { status }).then(r => r.data),
};

export const instructionsApi = {
  list: (includeArchived = false) => api.get('/instructions', { params: { include_archived: includeArchived } }).then(r => r.data),
  get: (filename) => api.get(`/instructions/${filename}`).then(r => r.data),
  create: (data) => api.post('/instructions', data).then(r => r.data),
  update: (filename, content) => api.patch(`/instructions/${filename}`, { content }).then(r => r.data),
  archive: (filename) => api.post(`/instructions/${filename}/archive`).then(r => r.data),
  unarchive: (filename) => api.post(`/instructions/${filename}/unarchive`).then(r => r.data),
  delete: (filename) => api.delete(`/instructions/${filename}`).then(r => r.data),
};

export const rolesApi = {
  list: () => api.get('/roles').then(r => r.data),
};

export const agentTemplatesApi = {
  list: (includeArchived = false) =>
    api.get('/agent-templates', { params: { include_archived: includeArchived } }).then(r => r.data),
  create: (data) => api.post('/agent-templates', data).then(r => r.data),
  update: (id, data) => api.patch(`/agent-templates/${id}`, data).then(r => r.data),
  archive: (id) => api.post(`/agent-templates/${id}/archive`).then(r => r.data),
  unarchive: (id) => api.post(`/agent-templates/${id}/unarchive`).then(r => r.data),
  delete: (id) => api.delete(`/agent-templates/${id}`).then(r => r.data),
  saveAgentAs: (agentId, data) => api.post(`/agents/${agentId}/save-as-template`, data).then(r => r.data),
};

export default api;
