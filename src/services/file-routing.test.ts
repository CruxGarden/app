import { describe, it, expect } from 'vitest';
import { routeFile, routeFolder, isArchive, stem } from './file-routing';

describe('file-drop routing', () => {
  it('sends each kind of file to the tool that opens it', () => {
    expect(routeFile('Résumé.docx')).toMatchObject({ templateId: 'notes', folder: 'inbox', open: expect.anything() });
    expect(routeFile('journal.md')).toMatchObject({ templateId: 'notes', folder: 'notebook/Imported' });
    expect(routeFile('budget.xlsx')!.templateId).toBe('tool-univer');
    expect(routeFile('photo.JPG')!.templateId).toBe('minipaint-app');
    expect(routeFile('logo.svg')!.templateId).toBe('svgedit-app');
    expect(routeFile('clip.mov')!.templateId).toBe('opencut-app');
    expect(routeFile('take.wav')!.templateId).toBe('audiomass-app');
    expect(routeFile('paper.pdf')!.templateId).toBe('bentopdf-app');
    expect(routeFile('analysis.ipynb')!.templateId).toBe('jupyterlite-app');
    expect(routeFile('screens.moq')!.templateId).toBe('moqira');
    expect(routeFile('index.html')!.templateId).toBe('blank');
    expect(routeFile('setup.exe')).toBeNull();
    expect(isArchive('a.crux')).toBe(true);
    expect(isArchive('a.cruxspace')).toBe(true);
  });
  it('a folder with Markdown is a notebook; anything else a Blank Crux', () => {
    const file = new File([''], 'x');
    expect(routeFolder([{ path: 'Chapters/One.md', file }])!.templateId).toBe('notes');
    expect(routeFolder([{ path: 'index.html', file }, { path: 'style.css', file }])!.templateId).toBe('blank');
    expect(routeFolder([])).toBeNull();
  });
  it('titles come from the file', () => {
    expect(stem('inbox/My letter: draft?.docx')).toBe('My letter- draft-');
    expect(stem('.docx')).toBe('File');
  });
});
