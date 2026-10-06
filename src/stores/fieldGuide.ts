import { create } from 'zustand';

export type GuidePage =
  | ''
  | 'start/get-started/'
  | 'start/first-home/'
  | 'guides/tasks/'
  | 'guides/sharing/';
export const useFieldGuide = create<{ page: GuidePage | null; close: () => void }>((set) => ({
  page: null,
  close: () => set({ page: null }),
}));
export function openFieldGuide(page: GuidePage = '') {
  useFieldGuide.setState({ page });
}
