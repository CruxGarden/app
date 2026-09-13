// Stands in for @tauri-apps/plugin-dialog. Save always names the Crux's one
// project file; Open offers the browser's file picker so a person can bring a
// Moqira file into this Crux, the way the desktop app opens one.
const imported = new Map<string, unknown>();
const PROJECT_PATH = 'mockups/project.json';

export async function save(_options?: unknown): Promise<string | null> {
  return PROJECT_PATH;
}
export async function open(options?: { multiple?: boolean; title?: string }): Promise<string | string[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.moq,.moqira,.dsmockup,.json,application/json';
    input.setAttribute('aria-label', 'Import Moqira project');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    let done = false;
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(options?.multiple && value ? [value] : value);
    };
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      try {
        const path = file.name; // the app shows the project by its file name
        imported.set(path, JSON.parse(await file.text()));
        finish(path);
      } catch {
        finish(null);
      }
    };
    input.oncancel = () => finish(null);
    document.body.append(input);
    input.click();
  });
}
export async function message(_message: string, _options?: unknown): Promise<void> {}
export async function ask(message: string, _options?: unknown): Promise<boolean> {
  return confirm(message);
}
export async function confirmDialog(message: string, _options?: unknown): Promise<boolean> {
  return confirm(message);
}
export { confirmDialog as confirm };
/** The parsed file behind a path Open returned, once. */
export function takeImported(path: string): unknown {
  const value = imported.get(path);
  if (value !== undefined) imported.delete(path);
  return value;
}
