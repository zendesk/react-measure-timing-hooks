import React, { useMemo, useState } from 'react'
import { Operation } from '../../2024/types'
import FileLoader from './components/FileLoader'
import OperationVisualization from './components/OperationVisualization'
import { mapTicketActivationData } from './mapTicketActivationData'

export interface OperationVisualizerProps {
  width: number
  margin?: { top: number; right: number; bottom: number; left: number }
}
const OperationVisualizer = ({ width, margin }: OperationVisualizerProps) => {
  const [fileContent, setFileContent] = useState<Operation | null>(null)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type === 'application/json') {
      const reader = new FileReader()
      reader.addEventListener('load', (e) => {
        const result = e.target?.result
        if (result && typeof result === 'string') {
          // should validate the file
          setFileContent(JSON.parse(result) as Operation)
        }
      })
      reader.readAsText(file)
    }
  }

  const mappedFileContent = useMemo(() => {
    if (!fileContent) return null

    // TODO: should have option state for collapsing spans
    return mapTicketActivationData(fileContent)
  }, [fileContent])

  if (!fileContent) {
    return (
      <FileLoader onChange={handleFileChange} name="fileData" id="fileData" />
    )
  }

  // If we failed validation or the mapping returned a null for some reason
  if (!mappedFileContent) return 'Some error state'

  return (
    <OperationVisualization
      width={width}
      margin={margin}
      operation={mappedFileContent}
    />
  )
}

export default OperationVisualizer
