/**
 * Moss Stone
 * @description A rounded stone with a hole for a cord: change the parameters and press shift + enter.
 */
const jscad = require('@jscad/modeling')
const { roundedCuboid, cylinder } = jscad.primitives
const { subtract } = jscad.booleans
const { rotateX, translate } = jscad.transforms
const { colorize } = jscad.colors

const getParameterDefinitions = () => [
  { name: 'width', type: 'number', initial: 40, caption: 'Width (mm)' },
  { name: 'depth', type: 'number', initial: 28, caption: 'Depth (mm)' },
  { name: 'height', type: 'number', initial: 12, caption: 'Height (mm)' },
  { name: 'hole', type: 'number', initial: 4, caption: 'Cord hole (mm)' }
]

const main = (params) => {
  const stone = roundedCuboid({
    size: [params.width, params.depth, params.height],
    roundRadius: Math.min(params.height, params.depth) / 3,
    segments: 32
  })
  const hole = translate(
    [params.width / 2 - params.hole * 2, 0, 0],
    rotateX(Math.PI / 2, cylinder({ radius: params.hole / 2, height: params.depth + 2, segments: 24 }))
  )
  return colorize([0.42, 0.62, 0.45], subtract(stone, hole))
}

module.exports = { main, getParameterDefinitions }
