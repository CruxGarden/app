export const DATA_FIELDS = ['userInput', 'rawData']
function binary(value) {
  const ref = value?.__cruxBinary
  return (
    ref &&
    ref.kind === 'buffer' &&
    ref.type === 'application/json' &&
    /^assets\/[a-f0-9]{64}\.bin$/.test(ref.path) &&
    Number.isInteger(ref.size) &&
    ref.size > 0 &&
    ref.size <= 128000000
  )
}
export function validateProject(doc) {
  if (!doc || doc.version !== 1 || doc.app !== 'rawgraphs')
    throw new Error('Choose a RAWGraphs project.')
  if (doc.project === null) return
  const s = doc.project?.snapshot
  if (
    !s ||
    !['native', 'draft'].includes(s.type) ||
    !s.value ||
    typeof s.value !== 'object'
  )
    throw new Error('Choose native RAWGraphs data or an editable draft.')
  const p = s.value
  if (s.type === 'native') {
    if (
      p.version !== '1.2' ||
      typeof p.chart !== 'string' ||
      !p.mapping ||
      !p.visualOptions ||
      !p.dataTypes ||
      !p.parseOptions ||
      p.customChart
    )
      throw new Error(
        'Choose a built-in RAWGraphs chart and its native mapping.'
      )
    for (const key of DATA_FIELDS)
      if (!binary(p[key]))
        throw new Error('Import the local dataset before saving the chart.')
    if (
      p.parseOptions.unstackedData !== null &&
      p.parseOptions.unstackedData !== undefined &&
      !binary(p.parseOptions.unstackedData)
    )
      throw new Error('Preserve the original unstacked dataset.')
  } else {
    if (typeof p.chart !== 'string' || !binary(p.userInput))
      throw new Error('Preserve the unfinished dataset input.')
  }
}
