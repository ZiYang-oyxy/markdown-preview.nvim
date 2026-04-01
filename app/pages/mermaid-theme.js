const FONT_FAMILY = '"Avenir Next", "Helvetica Neue", "Segoe UI", sans-serif'
const DEFAULT_THEME_PRESET = 'modern'

export const MERMAID_THEME_PRESETS = [
  'modern',
  'minimal',
  'warm',
  'forest'
]

const SHARED_CONFIG = {
  theme: 'base',
  fontFamily: FONT_FAMILY,
  flowchart: {
    htmlLabels: true,
    curve: 'basis',
    nodeSpacing: 36,
    rankSpacing: 44,
    padding: 18
  },
  sequence: {
    useMaxWidth: true,
    wrap: true
  }
}

const isPlainObject = (value) => {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const mergeConfig = (base = {}, overrides = {}) => {
  const output = { ...base }

  Object.keys(overrides).forEach((key) => {
    const baseValue = output[key]
    const overrideValue = overrides[key]

    if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      output[key] = mergeConfig(baseValue, overrideValue)
      return
    }

    output[key] = overrideValue
  })

  return output
}

const omitPresetFields = (config = {}) => {
  const { themePreset, preset, ...rest } = config
  return rest
}

const createThemeCss = ({
  shadowColor,
  edgeLabelFill,
  edgeLabelStroke,
  clusterFill,
  clusterStroke,
  textColor
}) => {
  return `
.mermaid svg {
  font-feature-settings: "liga" 1, "calt" 1;
}

.mermaid .node rect,
.mermaid .node circle,
.mermaid .node ellipse,
.mermaid .node polygon,
.mermaid .node path,
.mermaid .note rect,
.mermaid .cluster rect,
.mermaid .actor,
.mermaid .label-container {
  filter: drop-shadow(0 10px 24px ${shadowColor});
}

.mermaid .node rect,
.mermaid .note rect,
.mermaid .cluster rect,
.mermaid .edgeLabel rect {
  rx: 14px;
  ry: 14px;
}

.mermaid .edgeLabel rect,
.mermaid .labelBox {
  fill: ${edgeLabelFill};
  stroke: ${edgeLabelStroke};
  stroke-width: 1px;
  opacity: 0.98;
}

.mermaid .cluster rect {
  fill: ${clusterFill};
  stroke: ${clusterStroke};
  fill-opacity: 0.86;
  stroke-dasharray: none;
}

.mermaid .node .label,
.mermaid .cluster .label,
.mermaid .edgeLabel text,
.mermaid .messageText,
.mermaid .noteText,
.mermaid .loopText,
.mermaid .label text,
.mermaid .titleText {
  fill: ${textColor} !important;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.mermaid .messageLine0,
.mermaid .messageLine1,
.mermaid .loopLine,
.mermaid .marker,
.mermaid .flowchart-link,
.mermaid .transition {
  stroke-width: 1.6px;
}
`
}

const createThemeVariables = (palette) => {
  return {
    darkMode: palette.darkMode,
    background: palette.background,
    mainBkg: palette.background,
    primaryColor: palette.primaryColor,
    primaryTextColor: palette.textColor,
    primaryBorderColor: palette.primaryBorderColor,
    secondaryColor: palette.secondaryColor,
    secondaryTextColor: palette.textColor,
    secondaryBorderColor: palette.secondaryBorderColor,
    tertiaryColor: palette.tertiaryColor,
    tertiaryTextColor: palette.textColor,
    tertiaryBorderColor: palette.tertiaryBorderColor,
    lineColor: palette.lineColor,
    textColor: palette.textColor,
    defaultLinkColor: palette.lineColor,
    titleColor: palette.titleColor,
    edgeLabelBackground: palette.edgeLabelFill,
    actorBkg: palette.actorBkg,
    actorBorder: palette.actorBorder,
    actorTextColor: palette.textColor,
    actorLineColor: palette.actorLineColor,
    signalColor: palette.lineColor,
    signalTextColor: palette.textColor,
    labelBoxBkgColor: palette.edgeLabelFill,
    labelBoxBorderColor: palette.edgeLabelStroke,
    labelTextColor: palette.textColor,
    noteBkgColor: palette.noteBkg,
    noteBorderColor: palette.noteBorder,
    noteTextColor: palette.textColor,
    clusterBkg: palette.clusterFill,
    clusterBorder: palette.clusterStroke,
    activationBkgColor: palette.activationBkg,
    activationBorderColor: palette.primaryBorderColor,
    sequenceNumberColor: palette.sequenceNumberColor
  }
}

const createPresetVariant = (palette) => {
  return mergeConfig(SHARED_CONFIG, {
    themeVariables: createThemeVariables(palette),
    themeCSS: createThemeCss({
      shadowColor: palette.shadowColor,
      edgeLabelFill: palette.edgeLabelFill,
      edgeLabelStroke: palette.edgeLabelStroke,
      clusterFill: palette.clusterFill,
      clusterStroke: palette.clusterStroke,
      textColor: palette.textColor
    })
  })
}

const PRESET_PALETTES = {
  modern: {
    light: {
      darkMode: false,
      background: '#ffffff',
      primaryColor: '#eff6ff',
      primaryBorderColor: '#93c5fd',
      secondaryColor: '#ecfeff',
      secondaryBorderColor: '#67e8f9',
      tertiaryColor: '#f8fafc',
      tertiaryBorderColor: '#cbd5e1',
      lineColor: '#64748b',
      textColor: '#0f172a',
      titleColor: '#0f172a',
      actorBkg: '#eff6ff',
      actorBorder: '#93c5fd',
      actorLineColor: '#94a3b8',
      edgeLabelFill: '#ffffff',
      edgeLabelStroke: '#dbeafe',
      noteBkg: '#ffffff',
      noteBorder: '#cbd5e1',
      clusterFill: '#f8fbff',
      clusterStroke: '#bfdbfe',
      activationBkg: '#dbeafe',
      sequenceNumberColor: '#1d4ed8',
      shadowColor: 'rgba(15, 23, 42, 0.10)'
    },
    dark: {
      darkMode: true,
      background: '#0f172a',
      primaryColor: '#14213d',
      primaryBorderColor: '#38bdf8',
      secondaryColor: '#111827',
      secondaryBorderColor: '#22d3ee',
      tertiaryColor: '#1e293b',
      tertiaryBorderColor: '#475569',
      lineColor: '#94a3b8',
      textColor: '#e2e8f0',
      titleColor: '#f8fafc',
      actorBkg: '#0f172a',
      actorBorder: '#334155',
      actorLineColor: '#64748b',
      edgeLabelFill: '#111827',
      edgeLabelStroke: '#334155',
      noteBkg: '#111827',
      noteBorder: '#334155',
      clusterFill: '#111827',
      clusterStroke: '#334155',
      activationBkg: '#1e293b',
      sequenceNumberColor: '#7dd3fc',
      shadowColor: 'rgba(2, 6, 23, 0.34)'
    }
  },
  minimal: {
    light: {
      darkMode: false,
      background: '#ffffff',
      primaryColor: '#f8fafc',
      primaryBorderColor: '#cbd5e1',
      secondaryColor: '#f1f5f9',
      secondaryBorderColor: '#cbd5e1',
      tertiaryColor: '#ffffff',
      tertiaryBorderColor: '#d7dde5',
      lineColor: '#475569',
      textColor: '#111827',
      titleColor: '#111827',
      actorBkg: '#ffffff',
      actorBorder: '#d7dde5',
      actorLineColor: '#94a3b8',
      edgeLabelFill: '#ffffff',
      edgeLabelStroke: '#e2e8f0',
      noteBkg: '#ffffff',
      noteBorder: '#d7dde5',
      clusterFill: '#f8fafc',
      clusterStroke: '#d7dde5',
      activationBkg: '#eef2f6',
      sequenceNumberColor: '#334155',
      shadowColor: 'rgba(15, 23, 42, 0.08)'
    },
    dark: {
      darkMode: true,
      background: '#111827',
      primaryColor: '#111827',
      primaryBorderColor: '#475569',
      secondaryColor: '#0f172a',
      secondaryBorderColor: '#475569',
      tertiaryColor: '#1f2937',
      tertiaryBorderColor: '#4b5563',
      lineColor: '#9ca3af',
      textColor: '#f3f4f6',
      titleColor: '#f9fafb',
      actorBkg: '#111827',
      actorBorder: '#4b5563',
      actorLineColor: '#6b7280',
      edgeLabelFill: '#1f2937',
      edgeLabelStroke: '#4b5563',
      noteBkg: '#1f2937',
      noteBorder: '#4b5563',
      clusterFill: '#111827',
      clusterStroke: '#4b5563',
      activationBkg: '#1f2937',
      sequenceNumberColor: '#d1d5db',
      shadowColor: 'rgba(0, 0, 0, 0.28)'
    }
  },
  warm: {
    light: {
      darkMode: false,
      background: '#fffaf5',
      primaryColor: '#fff1e6',
      primaryBorderColor: '#fdba74',
      secondaryColor: '#fff7ed',
      secondaryBorderColor: '#fb7185',
      tertiaryColor: '#fffaf5',
      tertiaryBorderColor: '#fed7aa',
      lineColor: '#9a3412',
      textColor: '#4a1d0f',
      titleColor: '#7c2d12',
      actorBkg: '#fff1e6',
      actorBorder: '#fdba74',
      actorLineColor: '#c2410c',
      edgeLabelFill: '#ffffff',
      edgeLabelStroke: '#fed7aa',
      noteBkg: '#fffbeb',
      noteBorder: '#fdba74',
      clusterFill: '#fff7ed',
      clusterStroke: '#fdba74',
      activationBkg: '#ffedd5',
      sequenceNumberColor: '#be123c',
      shadowColor: 'rgba(124, 45, 18, 0.12)'
    },
    dark: {
      darkMode: true,
      background: '#1c1917',
      primaryColor: '#3f1d12',
      primaryBorderColor: '#fb923c',
      secondaryColor: '#431407',
      secondaryBorderColor: '#f97316',
      tertiaryColor: '#292524',
      tertiaryBorderColor: '#7c2d12',
      lineColor: '#fdba74',
      textColor: '#ffedd5',
      titleColor: '#fff7ed',
      actorBkg: '#292524',
      actorBorder: '#9a3412',
      actorLineColor: '#ea580c',
      edgeLabelFill: '#292524',
      edgeLabelStroke: '#7c2d12',
      noteBkg: '#292524',
      noteBorder: '#9a3412',
      clusterFill: '#292524',
      clusterStroke: '#7c2d12',
      activationBkg: '#3f1d12',
      sequenceNumberColor: '#fda4af',
      shadowColor: 'rgba(28, 25, 23, 0.32)'
    }
  },
  forest: {
    light: {
      darkMode: false,
      background: '#f7fcf9',
      primaryColor: '#ecfdf5',
      primaryBorderColor: '#6ee7b7',
      secondaryColor: '#effcf6',
      secondaryBorderColor: '#2dd4bf',
      tertiaryColor: '#f0fdf4',
      tertiaryBorderColor: '#bbf7d0',
      lineColor: '#166534',
      textColor: '#123524',
      titleColor: '#14532d',
      actorBkg: '#ecfdf5',
      actorBorder: '#6ee7b7',
      actorLineColor: '#15803d',
      edgeLabelFill: '#ffffff',
      edgeLabelStroke: '#bbf7d0',
      noteBkg: '#f7fee7',
      noteBorder: '#86efac',
      clusterFill: '#f0fdf4',
      clusterStroke: '#86efac',
      activationBkg: '#dcfce7',
      sequenceNumberColor: '#0f766e',
      shadowColor: 'rgba(20, 83, 45, 0.10)'
    },
    dark: {
      darkMode: true,
      background: '#052e16',
      primaryColor: '#064e3b',
      primaryBorderColor: '#34d399',
      secondaryColor: '#0f3d2e',
      secondaryBorderColor: '#2dd4bf',
      tertiaryColor: '#14532d',
      tertiaryBorderColor: '#166534',
      lineColor: '#a7f3d0',
      textColor: '#dcfce7',
      titleColor: '#ecfdf5',
      actorBkg: '#064e3b',
      actorBorder: '#166534',
      actorLineColor: '#34d399',
      edgeLabelFill: '#14532d',
      edgeLabelStroke: '#166534',
      noteBkg: '#14532d',
      noteBorder: '#166534',
      clusterFill: '#14532d',
      clusterStroke: '#166534',
      activationBkg: '#166534',
      sequenceNumberColor: '#99f6e4',
      shadowColor: 'rgba(2, 44, 34, 0.30)'
    }
  }
}

const THEME_PRESET_CONFIG = Object.keys(PRESET_PALETTES).reduce((acc, key) => {
  acc[key] = {
    light: createPresetVariant(PRESET_PALETTES[key].light),
    dark: createPresetVariant(PRESET_PALETTES[key].dark)
  }
  return acc
}, {})

export const resolveThemePreset = (config = {}) => {
  const requestedPreset = config.themePreset || config.preset || DEFAULT_THEME_PRESET
  return THEME_PRESET_CONFIG[requestedPreset] ? requestedPreset : DEFAULT_THEME_PRESET
}

const createMermaidConfig = (theme = 'light', overrides = {}) => {
  const presetName = resolveThemePreset(overrides)
  const preset = THEME_PRESET_CONFIG[presetName]
  const variant = theme === 'dark' ? preset.dark : preset.light
  return mergeConfig(variant, omitPresetFields(overrides))
}

export default createMermaidConfig
