/* eslint-disable import/no-default-export */
declare module '*.css' {
  const content: {
    use: () => void
    unuse: () => void
  }
  export default content
}
