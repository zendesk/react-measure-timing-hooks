import type { TaskSpanKind } from '../../2024/legacyTypes'

export const RESOURCES_TEXT = 'Show Resources'
export const MEASURES_TEXT = 'Show Measures'
export const COLLAPSE_RENDER_SPANS_TEXT = 'Collapse Render Spans'
export const COLLAPSE_ASSET_SPANS_TEXT = 'Collapse Asset Spans'
export const COLLAPSE_EMBER_RESOURCE_SPANS = 'Collapse Ember Resource Spans'
export const COLLAPSE_IFRAME_SPANS = 'Collapse iframe Spans'

export type FilterOption =
  | typeof RESOURCES_TEXT
  | typeof MEASURES_TEXT
  | typeof COLLAPSE_RENDER_SPANS_TEXT
  | typeof COLLAPSE_ASSET_SPANS_TEXT
  | typeof COLLAPSE_EMBER_RESOURCE_SPANS
  | typeof COLLAPSE_IFRAME_SPANS

export const FILTER_OPTIONS: FilterOption[] = [
  RESOURCES_TEXT,
  MEASURES_TEXT,
  COLLAPSE_RENDER_SPANS_TEXT,
  COLLAPSE_ASSET_SPANS_TEXT,
  COLLAPSE_EMBER_RESOURCE_SPANS,
  COLLAPSE_IFRAME_SPANS,
]

export const BAR_FILL_COLOR: Record<TaskSpanKind | 'resource-ember', string> = {
  render: '#ff7f0e',
  measure: '#2ca02c',
  resource: '#1f77b4',
  'resource-ember': '#17becf',
  longtask: '#d62728',
  mark: '#9467bd',
  asset: '#8c564b',
  iframe: '#e377c2',
  element: '#7f7f7f',
  action: '#bcbd22',

  error: '#ff9896',
  vital: '#ffbb78',
  'first-input': '#aec7e8',
  'largest-contentful-paint': '#98df8a',
  'layout-shift': '#ff9896',
  'visibility-state': '#ff9896',
  event: '#ff9896',
  navigation: '#ff9896',
  paint: '#ff9896',
  taskattribution: '#ff9896',
}
