import React, { useMemo, useState } from 'react'
import { Operation } from '../../2024/types'
import { DropTarget } from './components/DropTarget'
import FileUploadButton from './components/FileUploadButton'
import OperationVisualization from './components/OperationVisualization'
import { mapTicketActivationData } from './mapTicketActivationData'

export interface OperationVisualizerProps {
  width: number
  margin?: { top: number; right: number; bottom: number; left: number }
}
const OperationVisualizer = ({ width, margin }: OperationVisualizerProps) => {
  const [fileContent, setFileContent] = useState<Operation | null>(null)

  const readFile = (file: File | undefined) => {
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

    // TODO: should have option state for collapsing spans
    return mapTicketActivationData(fileContent)
  }, [fileContent])

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

  // If we failed validation or the mapping returned a null for some reason
  if (!mappedFileContent) return <div>'Some error state'</div>

  return (
    <DropTarget onDrop={handleDrop}>
      <OperationVisualization
        width={width}
        margin={margin}
        operation={mappedFileContent}
      />
    </DropTarget>
  )
}

export default OperationVisualizer
