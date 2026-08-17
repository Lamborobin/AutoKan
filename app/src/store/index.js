import { create } from 'zustand';
import { createAuthSlice } from './authSlice';
import { createWorkspaceSlice } from './workspaceSlice';
import { createBoardSlice } from './boardSlice';
import { createUiSlice } from './uiSlice';
import { createBenchmarkSlice } from './benchmarkSlice';
import { createModelsSlice } from './modelsSlice';

export const useStore = create((set, get) => ({
  ...createAuthSlice(set, get),
  ...createWorkspaceSlice(set, get),
  ...createBoardSlice(set, get),
  ...createUiSlice(set, get),
  ...createBenchmarkSlice(set, get),
  ...createModelsSlice(set, get),
}));
