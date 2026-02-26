import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  fileViewerOpen: boolean;
  timelineOpen: boolean;

  toggleSidebar: () => void;
  toggleFileViewer: () => void;
  toggleTimeline: () => void;
  setSidebar: (open: boolean) => void;
  setFileViewer: (open: boolean) => void;
  setTimeline: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  fileViewerOpen: false,
  timelineOpen: false,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleFileViewer: () => set((s) => ({ fileViewerOpen: !s.fileViewerOpen })),
  toggleTimeline: () => set((s) => ({ timelineOpen: !s.timelineOpen })),
  setSidebar: (open) => set({ sidebarOpen: open }),
  setFileViewer: (open) => set({ fileViewerOpen: open }),
  setTimeline: (open) => set({ timelineOpen: open }),
}));
