declare module '*.css' {
  const content: {
    use: () => void
    unuse: () => void
  }
  export default content
}
