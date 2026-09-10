// Copyright (c) 2026 Crux Garden. SPDX-License-Identifier: MIT
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const named = (value) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 100;
export function validatePatch(patch) {
  if (
    !patch ||
    typeof patch.version !== 'string' ||
    !Array.isArray(patch.modules) ||
    patch.modules.length > 128 ||
    !Array.isArray(patch.cables) ||
    patch.cables.length > 1024
  )
    throw new Error('Choose a valid Cardinal patch (up to 128 modules and 1024 cables).');
  const ids = new Set();
  for (const module of patch.modules) {
    if (
      !module ||
      !integer(module.id) ||
      ids.has(module.id) ||
      !named(module.plugin) ||
      !named(module.model) ||
      (module.pos !== undefined &&
        (!Array.isArray(module.pos) ||
          module.pos.length !== 2 ||
          module.pos.some((value) => !Number.isFinite(value) || Math.abs(value) > 1_000_000))) ||
      !Array.isArray(module.params) ||
      module.params.length > 256
    )
      throw new Error('Invalid or duplicate module.');
    ids.add(module.id);
    const params = new Set();
    for (const param of module.params) {
      if (
        !param ||
        !integer(param.id) ||
        params.has(param.id) ||
        typeof param.value !== 'number' ||
        !Number.isFinite(param.value)
      )
        throw new Error('Invalid module parameter.');
      params.add(param.id);
    }
  }
  const cables = new Set();
  for (const cable of patch.cables) {
    if (
      !cable ||
      !integer(cable.id) ||
      cables.has(cable.id) ||
      !ids.has(cable.inputModuleId) ||
      !ids.has(cable.outputModuleId) ||
      !integer(cable.inputId) ||
      !integer(cable.outputId)
    )
      throw new Error('A cable refers to an unavailable module or port.');
    cables.add(cable.id);
  }
  return patch;
}
export function validateDocument(doc) {
  if (
    !doc ||
    doc.schemaVersion !== 1 ||
    !named(doc.name) ||
    !Array.isArray(doc.macros) ||
    doc.macros.length > 16 ||
    !Array.isArray(doc.presets) ||
    doc.presets.length > 16
  )
    throw new Error('Choose a valid Cardinal instrument document.');
  validatePatch(doc.patch);
  const ids = new Set();
  for (const macro of doc.macros) {
    if (
      !macro ||
      !named(macro.id) ||
      ids.has(macro.id) ||
      !named(macro.label) ||
      !Array.isArray(macro.bindings) ||
      !macro.bindings.length ||
      macro.bindings.length > 32
    )
      throw new Error('Invalid instrument control.');
    ids.add(macro.id);
    for (const b of macro.bindings)
      if (
        !b ||
        !integer(b.moduleId) ||
        !integer(b.paramId) ||
        !Number.isFinite(b.min) ||
        !Number.isFinite(b.max) ||
        b.min === b.max
      )
        throw new Error('Invalid control mapping.');
  }
  ids.clear();
  for (const preset of doc.presets) {
    if (!preset || !named(preset.id) || ids.has(preset.id) || !named(preset.name))
      throw new Error('Invalid or duplicate preset.');
    ids.add(preset.id);
    validatePatch(preset.patch);
  }
  return doc;
}
export function macroState(patch, macro) {
  const values = macro.bindings.map((b) => {
    const param = patch.modules
      .find((m) => m.id === b.moduleId)
      ?.params.find((p) => p.id === b.paramId);
    return param ? (param.value - b.min) / (b.max - b.min) : null;
  });
  if (values.some((value) => value === null)) return { available: false, value: 0, custom: true };
  return {
    available: true,
    value: Math.min(1, Math.max(0, values[0])),
    custom: values.some((value) => value < 0 || value > 1 || Math.abs(value - values[0]) > 0.005),
  };
}
export function macroChanges(macro, value) {
  if (!Number.isFinite(value) || value < 0 || value > 1)
    throw new Error('Control value must be between 0 and 1.');
  return macro.bindings.map((b) => ({
    moduleId: b.moduleId,
    paramId: b.paramId,
    value: b.min + value * (b.max - b.min),
  }));
}
