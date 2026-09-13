import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
const name = { type: 'string', minLength: 1, maxLength: 200 } as const;
export const BENTOPDF_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_bentopdf',
    description:
      'Inspect the documents kept in this BentoPDF Crux: the project name and each document’s name, type, size, page count, source (upload, tool or agent), the tool that made it and when.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_bentopdf_name',
    description: 'Name the project (up to 200 characters).',
    input_schema: {
      type: 'object',
      properties: { name },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'rotate_bentopdf_document',
    description:
      'Rotate every page of a kept PDF by 90, 180 or 270 degrees clockwise and keep the result as a new document (default name <name>-rotated.pdf). Never replaces the original.',
    input_schema: {
      type: 'object',
      properties: {
        document: name,
        degrees: { type: 'integer', enum: [90, 180, 270] },
        output: name,
      },
      required: ['document', 'degrees'],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'data/assets/'],
  },
  {
    name: 'merge_bentopdf_documents',
    description:
      'Merge two to fifty kept PDFs, in the order given, into a new document (default name merged.pdf). Never replaces the originals.',
    input_schema: {
      type: 'object',
      properties: {
        documents: { type: 'array', items: name, minItems: 2, maxItems: 50 },
        output: name,
      },
      required: ['documents'],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'data/assets/'],
  },
];
const docName = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
export function bentopdfCommand(name: string, input: Record<string, unknown>) {
  const keys = Object.keys(input);
  if (name === 'inspect_bentopdf' && !keys.length) return { op: 'inspect' };
  if (name === 'set_bentopdf_name') {
    if (keys.length !== 1 || !docName(input.name))
      throw new Error('Use a project name up to 200 characters.');
    return { op: 'set-name', name: (input.name as string).trim() };
  }
  if (name === 'rotate_bentopdf_document') {
    const { document, degrees, output } = input;
    if (
      keys.some((k) => !['document', 'degrees', 'output'].includes(k)) ||
      !docName(document) ||
      ![90, 180, 270].includes(degrees as number) ||
      (output !== undefined && !docName(output))
    )
      throw new Error('Name a kept PDF and rotate it by 90, 180 or 270 degrees.');
    return {
      op: 'rotate',
      document: (document as string).trim(),
      degrees,
      ...(output ? { output: (output as string).trim() } : {}),
    };
  }
  if (name === 'merge_bentopdf_documents') {
    const { documents, output } = input;
    if (
      keys.some((k) => !['documents', 'output'].includes(k)) ||
      !Array.isArray(documents) ||
      documents.length < 2 ||
      documents.length > 50 ||
      !documents.every(docName) ||
      (output !== undefined && !docName(output))
    )
      throw new Error('Name two to fifty kept PDFs to merge.');
    return {
      op: 'merge',
      documents: documents.map((d) => (d as string).trim()),
      ...(output ? { output: (output as string).trim() } : {}),
    };
  }
  throw new Error('Choose a supported BentoPDF operation.');
}
