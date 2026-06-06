;(function () {
  var MERMAID_SOURCE_DATASET = 'mkdpMermaidSource'
  var DEFAULT_THEME_PRESET = 'modern'
  var FONT_FAMILY = '"Avenir Next", "Helvetica Neue", "Segoe UI", sans-serif'

  function bindPreviewInteractions(root) {
    if (window.MkdpPreviewViewer && typeof window.MkdpPreviewViewer.bindPreviewInteractions === 'function') {
      window.MkdpPreviewViewer.bindPreviewInteractions(root || document)
    }
  }

  var MERMAID_THEME_PRESETS = [
    'modern',
    'minimal',
    'warm',
    'forest'
  ]

  var SHARED_CONFIG = {
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

  var PRESET_PALETTES = {
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

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
  }

  function mergeConfig(base, overrides) {
    var output = {}
    var source = base || {}
    var extra = overrides || {}
    var key = ''

    for (key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        output[key] = source[key]
      }
    }

    for (key in extra) {
      if (!Object.prototype.hasOwnProperty.call(extra, key)) {
        continue
      }

      if (isPlainObject(output[key]) && isPlainObject(extra[key])) {
        output[key] = mergeConfig(output[key], extra[key])
        continue
      }

      output[key] = extra[key]
    }

    return output
  }

  function omitPresetFields(config) {
    var source = config || {}
    var output = {}
    var key = ''

    for (key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) {
        continue
      }

      if (key === 'themePreset' || key === 'preset') {
        continue
      }

      output[key] = source[key]
    }

    return output
  }

  function createThemeCss(options) {
    return [
      '.mermaid svg {',
      '  font-feature-settings: "liga" 1, "calt" 1;',
      '}',
      '',
      '.mermaid .node rect,',
      '.mermaid .node circle,',
      '.mermaid .node ellipse,',
      '.mermaid .node polygon,',
      '.mermaid .node path,',
      '.mermaid .note rect,',
      '.mermaid .cluster rect,',
      '.mermaid .actor,',
      '.mermaid .label-container {',
      '  filter: drop-shadow(0 10px 24px ' + options.shadowColor + ');',
      '}',
      '',
      '.mermaid .node rect,',
      '.mermaid .note rect,',
      '.mermaid .cluster rect,',
      '.mermaid .edgeLabel rect {',
      '  rx: 14px;',
      '  ry: 14px;',
      '}',
      '',
      '.mermaid .edgeLabel rect,',
      '.mermaid .labelBox {',
      '  fill: ' + options.edgeLabelFill + ';',
      '  stroke: ' + options.edgeLabelStroke + ';',
      '  stroke-width: 1px;',
      '  opacity: 0.98;',
      '}',
      '',
      '.mermaid .cluster rect {',
      '  fill: ' + options.clusterFill + ';',
      '  stroke: ' + options.clusterStroke + ';',
      '  fill-opacity: 0.86;',
      '  stroke-dasharray: none;',
      '}',
      '',
      '.mermaid .node .label,',
      '.mermaid .cluster .label,',
      '.mermaid .edgeLabel text,',
      '.mermaid .messageText,',
      '.mermaid .noteText,',
      '.mermaid .loopText,',
      '.mermaid .label text,',
      '.mermaid .titleText {',
      '  fill: ' + options.textColor + ' !important;',
      '  font-weight: 600;',
      '  letter-spacing: 0.01em;',
      '}',
      '',
      '.mermaid .messageLine0,',
      '.mermaid .messageLine1,',
      '.mermaid .loopLine,',
      '.mermaid .marker,',
      '.mermaid .flowchart-link,',
      '.mermaid .transition {',
      '  stroke-width: 1.6px;',
      '}'
    ].join('\n')
  }

  function createThemeVariables(palette) {
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

  function createPresetVariant(palette) {
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

  var THEME_PRESET_CONFIG = {}
  MERMAID_THEME_PRESETS.forEach(function (preset) {
    THEME_PRESET_CONFIG[preset] = {
      light: createPresetVariant(PRESET_PALETTES[preset].light),
      dark: createPresetVariant(PRESET_PALETTES[preset].dark)
    }
  })

  function resolveThemePreset(config) {
    var requestedPreset = (config && (config.themePreset || config.preset)) || DEFAULT_THEME_PRESET
    return THEME_PRESET_CONFIG[requestedPreset] ? requestedPreset : DEFAULT_THEME_PRESET
  }

  function createMermaidConfig(theme, overrides) {
    var presetName = resolveThemePreset(overrides)
    var preset = THEME_PRESET_CONFIG[presetName]
    var variant = theme === 'dark' ? preset.dark : preset.light
    return mergeConfig(variant, omitPresetFields(overrides))
  }


  function getMainElement() {
    return document.querySelector('main')
  }

  function getThemeModeSelect() {
    return document.getElementById('theme-mode-select')
  }

  function getMermaidThemePresetSelect() {
    return document.getElementById('mermaid-theme-preset')
  }

  function getThemeMode() {
    var select = getThemeModeSelect()
    if (select && select.value) {
      return select.value
    }

    var main = getMainElement()
    if (main && main.getAttribute('data-theme')) {
      return main.getAttribute('data-theme')
    }

    return 'light'
  }

  function getMermaidThemePreset() {
    var select = getMermaidThemePresetSelect()
    if (select && select.value) {
      return resolveThemePreset({ themePreset: select.value })
    }

    return DEFAULT_THEME_PRESET
  }

  function applyThemeMode(theme) {
    var nextTheme = theme === 'dark' ? 'dark' : 'light'
    var main = getMainElement()
    var select = getThemeModeSelect()

    if (main) {
      main.setAttribute('data-theme', nextTheme)
    }

    if (select && select.value !== nextTheme) {
      select.value = nextTheme
    }
  }

  function renderMermaidDiagrams(root) {
    var activeRoot = root || document

    if (typeof window.mermaid === 'undefined' || !activeRoot) {
      bindPreviewInteractions(activeRoot)
      return
    }

    var mermaidNodes = activeRoot.querySelectorAll('.mermaid')
    if (!mermaidNodes.length) {
      bindPreviewInteractions(activeRoot)
      return
    }

    Array.prototype.forEach.call(mermaidNodes, function (node) {
      if (!node.dataset[MERMAID_SOURCE_DATASET]) {
        node.dataset[MERMAID_SOURCE_DATASET] = node.innerHTML
      }

      node.innerHTML = node.dataset[MERMAID_SOURCE_DATASET]
      node.removeAttribute('data-processed')
    })

    try {
      window.mermaid.initialize(createMermaidConfig(getThemeMode(), {
        themePreset: getMermaidThemePreset()
      }))

      var mermaidRender = window.mermaid.init(undefined, mermaidNodes)

      if (mermaidRender && typeof mermaidRender.then === 'function') {
        mermaidRender.then(function () {
          bindPreviewInteractions(activeRoot)
        }).catch(function () {
          bindPreviewInteractions(activeRoot)
        })
      } else {
        window.setTimeout(function () {
          bindPreviewInteractions(activeRoot)
        }, 0)
      }
    } catch (error) {
      bindPreviewInteractions(activeRoot)
    }
  }

  function bindStandaloneControls() {
    var themeSelect = getThemeModeSelect()
    var mermaidThemeSelect = getMermaidThemePresetSelect()

    if (themeSelect && themeSelect.dataset.mkdpStandaloneBound !== 'true') {
      themeSelect.dataset.mkdpStandaloneBound = 'true'
      themeSelect.addEventListener('change', function (event) {
        applyThemeMode(event.target.value)
        renderMermaidDiagrams(document)
      })
    }

    if (mermaidThemeSelect) {
      mermaidThemeSelect.value = getMermaidThemePreset()
    }

    if (mermaidThemeSelect && mermaidThemeSelect.dataset.mkdpStandaloneBound !== 'true') {
      mermaidThemeSelect.dataset.mkdpStandaloneBound = 'true'
      mermaidThemeSelect.addEventListener('change', function () {
        renderMermaidDiagrams(document)
      })
    }
  }

  function bootstrapStandalone() {
    applyThemeMode(getThemeMode())
    bindStandaloneControls()
    bindPreviewInteractions(document)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapStandalone)
  } else {
    bootstrapStandalone()
  }
})()
