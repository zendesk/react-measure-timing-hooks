import React, { useMemo, useState } from 'react'
import { Operation } from '../../2024/types'
import { DropTarget } from './components/DropTarget'
import FileUploadButton from './components/FileUploadButton'
import OperationVisualization from './components/OperationVisualization'
import {
  COLLAPSE_ASSET_SPANS_TEXT,
  COLLAPSE_EMBER_RESOURCE_SPANS,
  COLLAPSE_IFRAME_SPANS,
  COLLAPSE_RENDER_SPANS_TEXT,
  MEASURES_TEXT,
  RESOURCES_TEXT,
} from './constants'
import { mapTicketActivationData } from './mapTicketActivationData'

export interface OperationVisualizerProps {
  width: number
  margin?: { top: number; right: number; bottom: number; left: number }
}

const OperationVisualizer = ({ width, margin }: OperationVisualizerProps) => {
  const [displayOptions, setDisplayOptions] = useState({
    [RESOURCES_TEXT]: true,
    [MEASURES_TEXT]: true,
    [COLLAPSE_RENDER_SPANS_TEXT]: true,
    [COLLAPSE_ASSET_SPANS_TEXT]: true,
    [COLLAPSE_EMBER_RESOURCE_SPANS]: false,
    [COLLAPSE_IFRAME_SPANS]: false,
  })

  const [fileContent, setFileContent] = useState<Operation | null>(null)
  const readFile = (file: File | undefined) => {
    if (file && file.type === 'application/json') {
      const reader = new FileReader()
      reader.addEventListener('load', (e) => {
        const result = e.target?.result
        if (result && typeof result === 'string') {
          // should validate the file?
          setFileContent(JSON.parse(result) as Operation)
        }
      })
      reader.readAsText(file)
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    readFile(file)
  }

  const handleDrop: React.DragEventHandler = (e) => {
    if (e.dataTransfer.files.length > 0) {
      readFile(e.dataTransfer.files[0])
    }
  }

  const mappedFileContent = useMemo(() => {
    if (!fileContent) return null

    return mapTicketActivationData(fileContent, {
      collapseRenders: displayOptions[COLLAPSE_RENDER_SPANS_TEXT],
      collapseAssets: displayOptions[COLLAPSE_ASSET_SPANS_TEXT],
      collapseEmberResources: displayOptions[COLLAPSE_EMBER_RESOURCE_SPANS],
      collapseIframes: displayOptions[COLLAPSE_IFRAME_SPANS],
      displayResources: displayOptions[RESOURCES_TEXT],
      displayMeasures: displayOptions[MEASURES_TEXT],
    })
  }, [fileContent, displayOptions])

  if (!fileContent) {
    return (
      <DropTarget onDrop={handleDrop}>
        <FileUploadButton
          onChange={handleFileChange}
          name="fileData"
          id="fileData"
        />
      </DropTarget>
    )
  }

  // If we failed validation or the mapping returned a null for some reason. Alternatively could wrap the whole thing in an ErrorBoundary?
  if (!mappedFileContent) return <div>Some error state</div>

  return (
    <DropTarget onDrop={handleDrop}>
      <OperationVisualization
        width={width}
        margin={margin}
        operation={mappedFileContent}
        displayOptions={displayOptions}
        setDisplayOptions={setDisplayOptions}
      />
    </DropTarget>
  )
}

export default OperationVisualizer
