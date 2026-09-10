import { request, resolveNotePath, type Document } from '../../bridge';
export const notebookStorage = {
  async saveAsset(notePath: string, file: File) {
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type))
      throw new Error('Use a PNG, JPEG, GIF or WebP image.');
    if (file.size > 5_000_000) throw new Error('Choose an image smaller than 5 MB.');
    const content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const path = `assets/${crypto.randomUUID()}.${file.type.split('/')[1]}`;
    await request('write', { path, content, expected: null });
    return '../'.repeat(notePath.split('/').length - 1) + path;
  },
  async readAssetDataUrl(notePath: string, link: string) {
    const path = resolveNotePath(notePath, link);
    if (!path?.startsWith('assets/')) throw new Error('Image is outside this notebook.');
    return (await request<Document>('read', { path })).content;
  },
  async saveClipboardImageAsset(_workspace?: string) {
    throw new Error('Paste an image file from the clipboard.');
  },
};
