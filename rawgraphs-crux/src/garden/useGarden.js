import { useEffect, useRef } from 'react'
import { deserializeProject } from '@rawgraphs/rawgraphs-core'

export default function useGarden({
  dataLoader,
  currentChart,
  mapping,
  visualOptions,
  setVisualOptions,
  setMapping,
  exportProject,
  importProject,
  handleChartChange,
  charts,
}) {
  const api = useRef(null)
  const started = useRef(false)
  api.current = {
    busy: () => dataLoader.loading,
    hasData: () => !!dataLoader.data,
    capture: async () =>
      dataLoader.data
        ? { type: 'native', value: await exportProject() }
        : {
            type: 'draft',
            value: {
              userInput: dataLoader.userInput,
              dataSource: dataLoader.dataSource,
              chart: currentChart.metadata.id,
              mapping,
              visualOptions,
            },
          },
    inspect: () => ({
      chart: currentChart.metadata.id,
      columns: Object.keys(dataLoader.data?.dataTypes || {}),
      rows: dataLoader.data?.dataset?.length || 0,
      mapping,
      visualOptions,
    }),
    command: async (command) => {
      if (command.op === 'inspect') return api.current.inspect()
      if (
        command.op !== 'size' ||
        !Number.isInteger(command.width) ||
        !Number.isInteger(command.height) ||
        command.width < 100 ||
        command.width > 4000 ||
        command.height < 100 ||
        command.height > 4000
      )
        throw new Error(
          'Choose figure dimensions between 100 and 4,000 pixels.'
        )
      setVisualOptions((previous) => ({
        ...previous,
        width: command.width,
        height: command.height,
      }))
      await new Promise((resolve) => setTimeout(resolve, 0))
      return api.current.inspect()
    },
  }
  useEffect(() => {
    const garden = window.rawGarden
    if (!garden || started.current) return
    started.current = true
    const open = async () => {
      const initial = garden.initial
      if (initial?.type === 'native')
        await importProject(
          deserializeProject(JSON.stringify(initial.value), charts)
        )
      else if (initial?.type === 'draft') {
        const chart = charts.find((c) => c.metadata.id === initial.value.chart)
        if (chart) handleChartChange(chart)
        if (initial.value.userInput)
          dataLoader.setUserInput(
            initial.value.userInput,
            initial.value.dataSource
          )
        setMapping(initial.value.mapping || {})
        setVisualOptions(initial.value.visualOptions)
      }
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (initial?.type === 'native' && !api.current.hasData())
        throw new Error(
          'The saved dataset could not be parsed. Your Garden project has not been overwritten.'
        )
      garden.connect({
        capture: () => api.current.capture(),
        busy: () => api.current.busy(),
        command: (c) => api.current.command(c),
      })
    }
    open().catch(garden.failed)
    // Mount once; forwarding functions always read the latest native React state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    window.rawGarden?.changed()
  }, [
    exportProject,
    dataLoader.userInput,
    dataLoader.dataSource,
    currentChart,
    mapping,
    visualOptions,
  ])
}
