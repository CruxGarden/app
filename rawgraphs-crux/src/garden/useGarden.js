import { useEffect, useRef } from 'react'
import { chartCommands } from './chart-commands'
import { localeList } from '../constants'
import { parseAndCheckData } from '../hooks/useDataLoaderUtils/parser'
import {
  deserializeProject,
  parseDataset,
  getOptionsConfig,
  getDefaultDimensionAggregation,
} from '@rawgraphs/rawgraphs-core'

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
  mappingLoading,
  rawViz,
}) {
  const api = useRef(null)
  const started = useRef(false)
  const commands = useRef(null)
  if (!commands.current)
    commands.current = chartCommands(() => api.current.state, {
      parseAndCheckData,
      parseDataset,
      getOptionsConfig,
      getDefaultDimensionAggregation,
    })
  api.current = {
    state: {
      dataLoader,
      dateLocale: localeList[dataLoader.locale],
      currentChart,
      mapping,
      visualOptions,
      setMapping,
      setVisualOptions,
      handleChartChange,
      charts,
      rawViz,
    },
    busy: () => dataLoader.loading || mappingLoading,
    svg: () => rawViz?._node?.querySelector('svg'),
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
    prepare: (value) => commands.current.prepare(value),
    settle: async () => {
      const input = document.activeElement
      if (input?.matches('input,textarea,[contenteditable="true"]'))
        input.blur()
      // Native chart options debounce for 200 ms; settle that before reading the SVG.
      await new Promise((resolve) => setTimeout(resolve, 250))
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
        prepare: (c) => api.current.prepare(c),
        settle: () => api.current.settle(),
        svg: () => api.current.svg(),
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
