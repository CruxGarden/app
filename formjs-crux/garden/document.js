// The Garden document of a form Crux: the form's name and its form-js schema.
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export function validateProject(doc) {
  if (!object(doc) || doc.version !== 1 || doc.app !== 'formjs' || Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k)))
    throw Error('Invalid form project.');
  if (doc.project === null) return;
  const p = doc.project;
  if (!object(p) || Object.keys(p).some((k) => !['name', 'schema', 'saved'].includes(k))) throw Error('Invalid form record.');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200) throw Error('Invalid form name.');
  if (typeof p.saved !== 'string') throw Error('Invalid form record.');
  validateSchema(p.schema);
}
export function validateSchema(schema, depth = 0) {
  if (!object(schema) || (depth === 0 && schema.type !== 'default')) throw Error('Invalid form schema.');
  if (!Array.isArray(schema.components) || schema.components.length > 500) throw Error('Invalid form fields.');
  if (JSON.stringify(schema).length > 2_000_000) throw Error('The form is too large.');
  for (const c of schema.components) {
    if (!object(c) || typeof c.type !== 'string' || !/^[a-z]{2,40}$/.test(c.type)) throw Error('Invalid form field.');
    if (c.key !== undefined && (typeof c.key !== 'string' || c.key.length > 120)) throw Error('Invalid field key.');
    if (c.label !== undefined && (typeof c.label !== 'string' || c.label.length > 500)) throw Error('Invalid field label.');
    if (Array.isArray(c.components)) validateSchema({ components: c.components }, depth + 1);
  }
}
/** The fields a person fills in (not layout), in order. */
export function listFields(schema) {
  const out = [];
  const walk = (components) => {
    for (const c of components || []) {
      if (c.key) out.push({ key: c.key, type: c.type, label: c.label || '', required: !!(c.validate && c.validate.required) });
      if (Array.isArray(c.components)) walk(c.components);
    }
  };
  walk(schema && schema.components);
  return out;
}
