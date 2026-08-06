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
  google: (credential, inviteToken) =>
    api.post('/auth/google', { credential, ...(inviteToken ? { inviteToken } : {}) }).then(r => r.data),
  me: () => api.get('/auth/me').then(r => r.data),
  updateProfile: (data) => api.patch('/auth/profile', data).then(r => r.data),
  users: () => api.get('/auth/users').then(r => r.data),
};

export const projectsApi = {
  list: (includeArchived = false) => api.get('/projects', { params: { include_archived: includeArchived } }).then(r => r.data),
  get: (id) => api.get(`/projects/${id}`).then(r => r.data),
  create: (data) => api.post('/projects', data).then(r => r.data),
  update: (id, data) => api.patch(`/projects/${id}`, data).then(r => r.data),
  archive: (id) => api.post(`/projects/${id}/archive`).then(r => r.data),
  unarchive: (id) => api.post(`/projects/${id}/unarchive`).then(r => r.data),
  delete: (id) => api.delete(`/projects/${id}`).then(r => r.data),
  clone: (id, data) => api.post(`/projects/${id}/clone`, data).then(r => r.data),
  clientRepos: () => api.get('/projects/client-repos').then(r => r.data),
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
  split: (id, data) => api.post(`/tasks/${id}/split`, data).then(r => r.data),
  abandon: (id, data) => api.post(`/tasks/${id}/abandon`, data).then(r => r.data),
  approve: (id, data) => api.post(`/tasks/${id}/approve`, data).then(r => r.data),
  reject: (id, data) => api.post(`/tasks/${id}/reject`, data).then(r => r.data),
  archive: (id) => api.post(`/tasks/${id}/archive`).then(r => r.data),
  unarchive: (id) => api.post(`/tasks/${id}/unarchive`).then(r => r.data),
  approvePr: (id) => api.post(`/tasks/${id}/approve_pr`).then(r => r.data),
  checkPr: (id) => api.get(`/tasks/${id}/check_pr`).then(r => r.data),
  syncGithub: (id, manual = false) => api.post(`/tasks/${id}/sync_github`, { manual }).then(r => r.data),
  bypassPm: (id) => api.post(`/tasks/${id}/bypass_pm`).then(r => r.data),
  toggleChecklistItem: (id, index) => api.post(`/tasks/${id}/toggle_checklist_item`, { index }).then(r => r.data),
  saveClientContext: (id, text) => api.post(`/tasks/${id}/save_client_context`, { text }).then(r => r.data),
  dismissClientContext: (id) => api.post(`/tasks/${id}/dismiss_client_context`).then(r => r.data),
};

export const columnsApi = {
  list: (includeArchived = false, projectId = null) => api.get('/columns', { params: { include_archived: includeArchived, ...(projectId ? { project_id: projectId } : {}) } }).then(r => r.data),
  create: (data) => api.post('/columns', data).then(r => r.data),
  update: (id, data) => api.patch(`/columns/${id}`, data).then(r => r.data),
  archive: (id) => api.post(`/columns/${id}/archive`).then(r => r.data),
  unarchive: (id) => api.post(`/columns/${id}/unarchive`).then(r => r.data),
  delete: (id) => api.delete(`/columns/${id}`).then(r => r.data),
};

export const agentsApi = {
  list: (projectId = null) => api.get('/agents', { params: projectId ? { project_id: projectId } : {} }).then(r => r.data),
  get: (id) => api.get(`/agents/${id}`).then(r => r.data),
  create: (data) => api.post('/agents', data).then(r => r.data),
  update: (id, data) => api.patch(`/agents/${id}`, data).then(r => r.data),
  archive: (id) => api.post(`/agents/${id}/archive`).then(r => r.data),
  unarchive: (id) => api.post(`/agents/${id}/unarchive`).then(r => r.data),
  delete: (id) => api.delete(`/agents/${id}`).then(r => r.data),
};

function instrParams({ subscriptionId = null, projectId = null, includeArchived = false } = {}) {
  const p = {};
  if (includeArchived)   p.include_archived = true;
  if (subscriptionId)    p.subscription_id  = subscriptionId;
  if (projectId)         p.project_id       = projectId;
  return p;
}

export const instructionsApi = {
  list: (includeArchived = false, projectId = null, subscriptionId = null) =>
    api.get('/instructions', { params: instrParams({ includeArchived, projectId, subscriptionId }) }).then(r => r.data),
  get: (filename, projectId = null, subscriptionId = null) =>
    api.get(`/instructions/${filename}`, { params: instrParams({ projectId, subscriptionId }) }).then(r => r.data),
  create: (data, projectId = null, subscriptionId = null, capabilities = []) =>
    api.post('/instructions', { ...data, capabilities }, { params: instrParams({ projectId, subscriptionId }) }).then(r => r.data),
  update: (filename, content, projectId = null, subscriptionId = null, capabilities = undefined) =>
    api.patch(`/instructions/${filename}`, { content, ...(capabilities !== undefined ? { capabilities } : {}) }, { params: instrParams({ projectId, subscriptionId }) }).then(r => r.data),
  archive: (filename, projectId = null, subscriptionId = null) =>
    api.post(`/instructions/${filename}/archive`, {}, { params: instrParams({ projectId, subscriptionId }) }).then(r => r.data),
  unarchive: (filename, projectId = null, subscriptionId = null) =>
    api.post(`/instructions/${filename}/unarchive`, {}, { params: instrParams({ projectId, subscriptionId }) }).then(r => r.data),
  delete: (filename, projectId = null, subscriptionId = null) =>
    api.delete(`/instructions/${filename}`, { params: instrParams({ projectId, subscriptionId }) }).then(r => r.data),
};

export const benchmarkApi = {
  listCases: (params) => api.get('/benchmark/cases', { params }).then(r => r.data),
  createCase: (data) => api.post('/benchmark/cases', data).then(r => r.data),
  draftCase: (data) => api.post('/benchmark/cases/draft', data).then(r => r.data),
  updateCase: (id, data) => api.patch(`/benchmark/cases/${id}`, data).then(r => r.data),
  deleteCase: (id) => api.delete(`/benchmark/cases/${id}`).then(r => r.data),
  runCase: (id, projectId) => api.post(`/benchmark/cases/${id}/run`, { project_id: projectId }).then(r => r.data),
  listRuns: (caseId) => api.get('/benchmark/runs', { params: { case_id: caseId } }).then(r => r.data),
  getRun: (id) => api.get(`/benchmark/runs/${id}`).then(r => r.data),
  reviewWithAI: (runId) => api.post(`/benchmark/runs/${runId}/review-ai`).then(r => r.data),
  reviewManually: (runId, level, notes) => api.post(`/benchmark/runs/${runId}/review-manual`, { level, notes }).then(r => r.data),
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

export const invitesApi = {
  send: (email) => api.post('/invites', { email }).then(r => r.data),
  list: () => api.get('/invites').then(r => r.data),
  remove: (id) => api.delete(`/invites/${id}`).then(r => r.data),
  verify: (token) => api.get('/invites/verify', { params: { token } }).then(r => r.data),
};

export const membersApi = {
  list: (projectId) => api.get(`/projects/${projectId}/members`).then(r => r.data),
  add: (projectId, email) => api.post(`/projects/${projectId}/members`, { email }).then(r => r.data),
  addTeam: (projectId, teamId) => api.post(`/projects/${projectId}/members/add-team`, { teamId }).then(r => r.data),
  update: (projectId, memberId, data) => api.patch(`/projects/${projectId}/members/${memberId}`, data).then(r => r.data),
  remove: (projectId, memberId) => api.delete(`/projects/${projectId}/members/${memberId}`).then(r => r.data),
};

export const teamsApi = {
  list: () => api.get('/teams').then(r => r.data),
  create: (data) => api.post('/teams', data).then(r => r.data),
  update: (id, data) => api.patch(`/teams/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/teams/${id}`).then(r => r.data),
  listMembers: (id) => api.get(`/teams/${id}/members`).then(r => r.data),
  addMember: (id, email) => api.post(`/teams/${id}/members`, { email }).then(r => r.data),
  removeMember: (id, email) => api.delete(`/teams/${id}/members/${encodeURIComponent(email)}`).then(r => r.data),
};

export const subscriptionApi = {
  get: () => api.get('/subscriptions/me').then(r => r.data),
  updateName: (name) => api.patch('/subscriptions/me', { name }).then(r => r.data),
  addAdmin: (email) => api.post('/subscriptions/admins', { email }).then(r => r.data),
  removeAdmin: (userId) => api.delete(`/subscriptions/admins/${userId}`).then(r => r.data),
};

export const clientsApi = {
  list: (includeArchived = false) => api.get('/clients', { params: { include_archived: includeArchived } }).then(r => r.data),
  create: (data) => api.post('/clients', data).then(r => r.data),
  update: (id, data) => api.patch(`/clients/${id}`, data).then(r => r.data),
  archive: (id) => api.post(`/clients/${id}/archive`).then(r => r.data),
  unarchive: (id) => api.post(`/clients/${id}/unarchive`).then(r => r.data),
  delete: (id) => api.delete(`/clients/${id}`).then(r => r.data),
};

export const docsApi = {
  list: () => api.get('/docs').then(r => r.data),
  update: (key, content) => api.patch(`/docs/${key}`, { content }).then(r => r.data),
  versions: (key) => api.get(`/docs/${key}/versions`).then(r => r.data),
  getVersion: (key, filename) => api.get(`/docs/${key}/versions/${encodeURIComponent(filename)}`).then(r => r.data),
};

export const commentsApi = {
  list: (taskId) => api.get(`/tasks/${taskId}/comments`).then(r => r.data),
  create: (taskId, content) => api.post(`/tasks/${taskId}/comments`, { content }).then(r => r.data),
  update: (taskId, commentId, content) => api.patch(`/tasks/${taskId}/comments/${commentId}`, { content }).then(r => r.data),
  remove: (taskId, commentId) => api.delete(`/tasks/${taskId}/comments/${commentId}`).then(r => r.data),
};

export const notificationsApi = {
  list: () => api.get('/notifications').then(r => r.data),
  markRead: (id) => api.patch(`/notifications/${id}/read`).then(r => r.data),
  markAllRead: () => api.post('/notifications/read-all').then(r => r.data),
};

export default api;
