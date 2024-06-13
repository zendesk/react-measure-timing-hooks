import React, { type ChangeEvent } from 'react'

interface FileLoaderProps {
  name: string
  id: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
}

const FileLoader = ({ name, id, onChange }: FileLoaderProps) => (
  <input type="file" name={name} id={id} onChange={onChange} />
)

export default FileLoader
