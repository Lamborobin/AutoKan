import { constantsApi } from '../api';
import { FALLBACK_MODELS, FALLBACK_DEFAULT_MODEL } from '../constants/agents';

export const createModelsSlice = (set) => ({
  models: FALLBACK_MODELS,
  modelsDefault: FALLBACK_DEFAULT_MODEL,

  async loadModels() {
    try {
      const { models, defaultModel } = await constantsApi.models();
      if (Array.isArray(models) && models.length) {
        set({ models, modelsDefault: defaultModel || models[0]?.value });
      }
    } catch {
      // keep whatever's already in state (fallback or last-good fetch)
    }
  },
});
