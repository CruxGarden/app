// CRA's parent-directory check mistakes Garden's separate ESLint for this fork's dependency.
process.env.SKIP_PREFLIGHT_CHECK = 'true'
process.env.BUILD_PATH = 'runtime'
require('react-scripts/scripts/build')
