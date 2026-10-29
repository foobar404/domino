(() => {
  const sessionKey = "__dominoExtensionSession__";
  const previousSession = window[sessionKey];

  if (previousSession && typeof previousSession.dispose === "function") {
    previousSession.dispose();
    return;
  }

  const controller = new AbortController();
  const host = document.createElement("div");
  host.setAttribute("data-domino-root", "");
  let outerViewport = { width: window.innerWidth, height: window.innerHeight };
  host.style.setProperty("--domino-outer-width", `${outerViewport.width}px`);
  host.style.setProperty("--domino-outer-height", `${outerViewport.height}px`);

  const mobileDevicePresets = {
    "iphone-se": { width: 375, height: 667 },
    "iphone-14": { width: 390, height: 844 },
    "iphone-15": { width: 393, height: 852 },
    "iphone-16-pro": { width: 402, height: 874 },
    "pixel-7": { width: 412, height: 915 },
    "pixel-8": { width: 412, height: 915 },
    "galaxy-s23": { width: 360, height: 780 },
    "galaxy-s24": { width: 360, height: 780 }
  };

  const toolPanelCopy = {
    select: { name: "Select and inspect", description: "Inspect and align page elements." },
    text: { name: "Typography", description: "Edit text and font styles." },
    color: { name: "Color", description: "Adjust text and background colors." },
    space: { name: "Spacing and size", description: "Set margins, padding, and dimensions." },
    layout: { name: "Layout", description: "Control positioning and layout." },
    borders: { name: "Borders", description: "Style borders and corners." },
    effects: { name: "Effects", description: "Adjust opacity, shadows, and filters." },
    mobile: { name: "Mobile preview", description: "Preview pages at phone sizes." }
  };

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      @font-face {
        font-family: Roboto;
        src: url("${chrome.runtime.getURL("fonts/Roboto-Variable.ttf")}") format("truetype");
        font-style: normal;
        font-weight: 100 900;
        font-display: swap;
      }

      :host {
        all: initial !important;
        position: fixed !important;
        inset: 0 auto auto 0 !important;
        width: var(--domino-outer-width, 100vw) !important;
        height: var(--domino-outer-height, 100vh) !important;
        z-index: 2147483647 !important;
        display: block !important;
        pointer-events: none !important;
        color: #f2f5fa;
        font-family: Roboto, "Segoe UI", Arial, sans-serif !important;
        font-size: 13px;
        line-height: 1.4;
      }

      *, *::before, *::after {
        box-sizing: border-box;
      }

      [hidden] {
        display: none !important;
      }

      .grid {
        position: fixed;
        inset: 0;
        pointer-events: none;
        background-image:
          linear-gradient(to right, rgba(105, 145, 255, .32) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(105, 145, 255, .32) 1px, transparent 1px);
        background-size: 20px 20px;
        opacity: .5;
      }

      .ruler {
        position: fixed;
        z-index: 1;
        overflow: hidden;
        background: rgba(12, 17, 27, .92);
        color: #aebbd0;
        pointer-events: none;
        font: 9px/1 Roboto, "Segoe UI", Arial, sans-serif;
      }

      .ruler.horizontal {
        top: 0;
        left: 0;
        width: 100vw;
        height: 18px;
        border-bottom: 1px solid #46536a;
      }

      .ruler.vertical {
        top: 0;
        left: 0;
        width: 18px;
        height: 100vh;
        border-right: 1px solid #46536a;
      }

      .tick {
        position: absolute;
        background: #8492aa;
      }

      .horizontal .tick {
        top: 0;
        width: 1px;
        height: 5px;
      }

      .horizontal .tick.major {
        height: 10px;
      }

      .vertical .tick {
        right: 0;
        width: 5px;
        height: 1px;
      }

      .vertical .tick.major {
        width: 10px;
      }

      .ruler-label {
        position: absolute;
        color: #d7dfed;
      }

      .horizontal .ruler-label {
        top: 2px;
        padding-left: 3px;
      }

      .vertical .ruler-label {
        top: 2px;
        left: 2px;
        width: 12px;
        height: 30px;
        writing-mode: vertical-rl;
        text-align: center;
      }

      .highlight {
        position: fixed;
        z-index: 2;
        display: block;
        border: 2px dashed var(--active-tool-color, #315e98);
        background: color-mix(in srgb, var(--active-tool-color, #315e98) 10%, transparent);
        pointer-events: none;
      }

      .highlight.selected {
        border-style: solid;
        border-color: var(--active-tool-color, #315e98);
        background: color-mix(in srgb, var(--active-tool-color, #315e98) 9%, transparent);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--active-tool-color, #315e98) 24%, transparent);
      }

      .tool-overlay {
        position: fixed;
        z-index: 2;
        inset: 0;
        pointer-events: none;
      }

      .overlay-card {
        position: fixed;
        min-width: 156px;
        max-width: min(260px, calc(100vw - 16px));
        max-height: calc(100vh - 16px);
        overflow-y: auto;
        padding: 6px 8px;
        border: 1px solid color-mix(in srgb, var(--active-tool-color, #315e98) 65%, transparent);
        border-radius: 7px;
        background: #fffdf8;
        box-shadow: 0 4px 14px rgba(32, 35, 40, .16);
        color: #242a33;
        pointer-events: none;
      }

      .overlay-card[data-overlay="text"],
      .overlay-card[data-overlay="color"],
      .overlay-card[data-overlay="space"],
      .overlay-card[data-overlay="select"],
      .overlay-card[data-overlay="layout"],
      .overlay-card[data-overlay="borders"],
      .overlay-card[data-overlay="effects"] {
        pointer-events: auto;
      }

      .overlay-eyebrow {
        display: block;
        margin-bottom: 3px;
        color: #68717e;
        font-size: 9px;
        font-weight: 650;
        letter-spacing: .08em;
        text-transform: uppercase;
      }

      .overlay-card strong {
        display: block;
        overflow-wrap: anywhere;
        color: #242a33;
        font-size: 10px;
        font-weight: 650;
      }

      .overlay-detail {
        display: block;
        margin-top: 2px;
        overflow-wrap: anywhere;
        color: #626b77;
        font-size: 9px;
        line-height: 1.35;
      }

      .overlay-color-row {
        display: grid;
        grid-template-columns: 10px 44px minmax(0, 1fr) 26px;
        align-items: center;
        gap: 5px;
        margin-top: 4px;
        color: #626b77;
        font-size: 9px;
      }

      .overlay-swatch {
        width: 10px;
        height: 10px;
        border: 1px solid rgba(36, 42, 51, .35);
        border-radius: 3px;
      }

      .overlay-color-row input[type="color"] {
        width: 26px;
        height: 20px;
        padding: 1px;
        border: 1px solid #d8d3c9;
        border-radius: 4px;
        background: #fff;
        cursor: pointer;
      }

      .overlay-color-row code,
      .overlay-metric code {
        overflow-wrap: anywhere;
        color: #303844;
        font: 9px/1.3 Roboto, "Segoe UI", Arial, sans-serif;
      }

      .overlay-widget {
        display: block;
        margin-top: 4px;
      }

      .style-source {
        display: block;
        width: 100%;
        margin-top: 3px;
        color: #93a2b8;
        font-size: 9px;
        line-height: 1.3;
        overflow-wrap: anywhere;
      }

      .tool-overlay .style-source {
        color: #68717e;
      }

      .overlay-color-row .style-source,
      .box-model-side .style-source {
        grid-column: 1 / -1;
      }

      .overlay-widget-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        margin-bottom: 2px;
        color: #626b77;
        font-size: 9px;
      }

      .overlay-widget select,
      .dimension-unit {
        width: 100%;
        min-height: 22px;
        padding: 2px 5px;
        border: 1px solid #d8d3c9;
        border-radius: 5px;
        background: #fff;
        color: #242a33;
        font: 9px Roboto, "Segoe UI", Arial, sans-serif;
      }

      .overlay-widget input[type="color"] {
        width: 100%;
        height: 22px;
        padding: 1px 2px;
        border: 1px solid #d8d3c9;
        border-radius: 5px;
        background: #fff;
      }

      .dimension-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 5px 7px;
        margin-top: 5px;
      }

      .dimension-field {
        min-width: 0;
      }

      .dimension-field[data-dimension-control] {
        grid-column: 1 / -1;
      }

      .dimension-field-head {
        display: flex;
        min-height: 13px;
        align-items: center;
        justify-content: space-between;
        gap: 3px;
        margin-bottom: 1px;
        color: #626b77;
        font-size: 9px;
      }

      .dimension-control-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 40px;
        align-items: center;
        gap: 3px;
      }

      .dimension-control-row input[type="range"] {
        width: 100%;
        min-width: 0;
        margin: 0;
      }

      .dimension-unit {
        min-width: 0;
        min-height: 21px;
        padding: 1px 2px;
        font-size: 9px;
      }

      .dimension-link {
        display: inline-flex;
        min-height: 21px;
        align-items: center;
        gap: 3px;
        margin-top: 5px;
        padding: 1px 5px;
        color: #626b77;
        font-size: 9px;
      }

      .dimension-link svg {
        width: 11px;
        height: 11px;
        fill: none;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 1.8;
      }

      .dimension-link[aria-pressed="true"] {
        border-color: color-mix(in srgb, var(--active-tool-color, #315e98) 50%, #dedad1);
        background: color-mix(in srgb, var(--active-tool-color, #315e98) 12%, #fffdf8);
        color: #242a33;
      }

      .overlay-card[data-overlay="space"] {
        width: min(260px, calc(100vw - 16px));
      }

      .overlay-toggle {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin: 6px 8px 0 0;
        color: #303844;
        font-size: 9px;
      }

      .overlay-toggle input {
        margin: 0;
        accent-color: var(--active-tool-color, #315e98);
      }

      .overlay-metric {
        display: grid;
        grid-template-columns: 46px minmax(0, 1fr);
        gap: 5px;
        margin-top: 3px;
        color: #68717e;
        font-size: 9px;
      }

      .space-overlay {
        position: fixed;
        z-index: 2;
        pointer-events: none;
      }

      .space-margin-area,
      .space-border-area,
      .space-padding-area,
      .space-content-area {
        position: absolute;
      }

      .space-margin-area {
        inset: 0;
        border: 1px dashed rgba(255, 194, 86, .95);
        background: rgba(255, 194, 86, .19);
      }

      .space-border-area {
        border: 1px solid rgba(116, 165, 255, .95);
        background: rgba(116, 165, 255, .1);
      }

      .space-padding-area {
        border: 1px solid rgba(114, 221, 167, .95);
        background: rgba(114, 221, 167, .18);
      }

      .space-content-area {
        border: 1px solid rgba(86, 190, 246, .95);
        background: rgba(86, 190, 246, .17);
      }

      .alignment-guide {
        position: fixed;
        z-index: 2;
        pointer-events: none;
      }

      .alignment-guide.horizontal {
        right: 0;
        left: 0;
        border-top: 1px dashed color-mix(in srgb, var(--active-tool-color, #315e98) 80%, transparent);
      }

      .alignment-guide.vertical {
        top: 0;
        bottom: 0;
        border-left: 1px dashed color-mix(in srgb, var(--active-tool-color, #315e98) 80%, transparent);
      }

      #mobile-preview-stage {
        position: absolute;
        z-index: auto;
        inset: 0;
        background: #000;
        pointer-events: auto;
        cursor: grab;
      }

      #mobile-preview-stage[data-panning="true"] {
        cursor: grabbing;
      }

      #mobile-preview-frame {
        position: absolute;
        top: 50%;
        left: 50%;
        border-radius: 16px;
        outline: 7px solid #111824;
        box-shadow: 0 0 0 100vmax rgba(5, 9, 15, .66), 0 18px 54px rgba(0, 0, 0, .45);
        pointer-events: none;
      }

      #mobile-preview-screen {
        position: absolute;
        inset: 0;
        overflow: hidden;
        border-radius: 10px;
        background: #fff;
        pointer-events: auto;
      }

      #mobile-preview-iframe {
        position: absolute;
        top: 0;
        left: 0;
        display: block;
        border: 0;
        background: #fff;
        transform-origin: top left;
      }

      #mobile-preview-error {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        padding: 24px;
        background: #fffdf8;
        color: #454d58;
        font-size: 13px;
        text-align: center;
      }

      .mobile-preview-controls {
        position: absolute;
        z-index: 4;
        top: -48px;
        left: 50%;
        display: flex;
        min-height: 36px;
        align-items: center;
        gap: 7px;
        padding: 4px 6px;
        transform: translateX(-50%);
        border: 1px solid #344157;
        border-radius: 9px;
        background: #111824;
        box-shadow: 0 6px 20px rgba(0, 0, 0, .32);
        color: #e8effb;
        pointer-events: auto;
        cursor: grab;
        touch-action: none;
        white-space: nowrap;
      }

      .mobile-preview-controls button {
        min-height: 27px;
        padding: 3px 8px;
        font-size: 10px;
      }

      #mobile-preview-device {
        box-sizing: border-box;
        width: clamp(88px, 30vw, 132px);
        min-height: 27px;
        padding: 3px 4px;
        border: 1px solid #d8d3c9;
        border-radius: 5px;
        background: #fff;
        color: #242a33;
        font-family: inherit;
        font-size: 10px;
        line-height: 1.2;
        pointer-events: auto;
        touch-action: manipulation;
      }

      #mobile-preview-dimensions {
        min-width: 76px;
        color: #bdc9da;
        font: 10px/1.2 Roboto, "Segoe UI", Arial, sans-serif;
        text-align: center;
      }

      #mobile-preview-zoom-value {
        min-width: 32px;
        color: #bdc9da;
        font: 10px/1.2 Roboto, "Segoe UI", Arial, sans-serif;
        text-align: center;
      }

      .mobile-resize-handle {
        position: absolute;
        z-index: 4;
        width: 14px;
        height: 14px;
        min-height: 0;
        padding: 0;
        border: 2px solid #e8effb;
        border-radius: 5px;
        background: #4d83d3;
        pointer-events: auto;
        touch-action: none;
      }

      .mobile-resize-handle[data-resize="n"],
      .mobile-resize-handle[data-resize="s"] {
        left: 50%;
        margin-left: -7px;
        cursor: ns-resize;
      }

      .mobile-resize-handle[data-resize="e"],
      .mobile-resize-handle[data-resize="w"] {
        top: 50%;
        margin-top: -7px;
        cursor: ew-resize;
      }

      .mobile-resize-handle[data-resize="n"] { top: -7px; }
      .mobile-resize-handle[data-resize="s"] { bottom: -7px; }
      .mobile-resize-handle[data-resize="e"] { right: -7px; }
      .mobile-resize-handle[data-resize="w"] { left: -7px; }
      .mobile-resize-handle[data-resize="ne"] { top: -7px; right: -7px; cursor: nesw-resize; }
      .mobile-resize-handle[data-resize="nw"] { top: -7px; left: -7px; cursor: nwse-resize; }
      .mobile-resize-handle[data-resize="se"] { right: -7px; bottom: -7px; cursor: nwse-resize; }
      .mobile-resize-handle[data-resize="sw"] { bottom: -7px; left: -7px; cursor: nesw-resize; }

      #workspace {
        position: absolute;
        top: 16px;
        left: max(8px, calc(100vw - 436px));
        z-index: 3;
        width: 52px;
        pointer-events: none;
      }

      #panel {
        position: absolute;
        top: 0;
        left: calc(100% + 8px);
        display: flex;
        width: min(360px, calc(100vw - 76px));
        min-width: 0;
        max-height: min(500px, calc(100vh - 32px));
        flex-direction: column;
        overflow: hidden;
        border: 1px solid #344157;
        border-radius: 14px;
        background: #111824;
        box-shadow: 0 18px 55px rgba(0, 0, 0, .45);
        color: #f2f5fa;
        pointer-events: auto;
      }

      #workspace[data-panel-side="left"] #panel {
        right: calc(100% + 8px);
        left: auto;
      }

      button, input, select, textarea {
        color: inherit;
        font: inherit;
      }

      button {
        min-height: 30px;
        border: 1px solid #354258;
        border-radius: 7px;
        background: #1a2433;
        cursor: pointer;
      }

      button:hover:not(:disabled) {
        border-color: #667895;
        background: #222f42;
      }

      button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
        outline: 2px solid #80aaff;
        outline-offset: 2px;
      }

      button:disabled, input:disabled, select:disabled, textarea:disabled {
        cursor: not-allowed;
        opacity: .48;
      }

      .titlebar {
        display: flex;
        min-height: 52px;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 9px 11px 9px 15px;
        border-bottom: 1px solid #2a3546;
      }

      .brand {
        min-width: 0;
      }

      .brand h1 {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
        letter-spacing: .02em;
      }

      .brand p {
        margin: 1px 0 0;
        color: #91a0b7;
        font-size: 11px;
      }

      .tool-rail {
        display: flex;
        width: 52px;
        min-height: min(360px, calc(100vh - 16px));
        max-height: min(360px, calc(100vh - 16px));
        flex-direction: column;
        align-items: center;
        gap: 5px;
        padding: 8px 6px;
        overflow: hidden;
        border: 1px solid #344157;
        border-radius: 15px;
        background: #111824;
        box-shadow: 0 18px 55px rgba(0, 0, 0, .45);
        cursor: grab;
        overscroll-behavior: contain;
        pointer-events: auto;
      }

      .tool-list {
        display: flex;
        width: 100%;
        min-height: 0;
        max-height: 214px;
        flex: 0 1 auto;
        flex-direction: column;
        align-items: center;
        gap: 5px;
        padding: 2px 0;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
        scroll-padding-block: 2px;
        scroll-snap-type: y mandatory;
        scrollbar-width: none;
      }

      .tool-list .tool-icon[data-tab] {
        scroll-snap-align: start;
        scroll-snap-stop: always;
      }

      .tool-list::-webkit-scrollbar {
        display: none;
        width: 0;
        height: 0;
      }

      .tool-scroll-up,
      .tool-scroll-down {
        display: grid;
        width: 24px;
        height: 14px;
        min-height: 0;
        flex: 0 0 14px;
        place-items: center;
        padding: 0;
        border: 0;
        border-radius: 4px;
        background: transparent;
        box-shadow: none;
        color: rgba(48, 60, 78, .55);
        cursor: pointer;
        transition: color .12s ease, transform .12s ease;
      }

      .tool-scroll-up:hover:not(:disabled) {
        border-color: transparent;
        background: transparent;
        color: rgba(48, 60, 78, .9);
        transform: translateY(-1px);
      }

      .tool-scroll-down:hover:not(:disabled) {
        border-color: transparent;
        background: transparent;
        color: rgba(48, 60, 78, .9);
        transform: translateY(1px);
      }

      .tool-scroll-up svg,
      .tool-scroll-down svg {
        width: 12px;
        height: 8px;
        fill: none;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 1.4;
      }

      .tool-rail:active {
        cursor: grabbing;
      }

      .rail-mark {
        display: grid;
        width: 36px;
        height: 38px;
        flex: 0 0 auto;
        place-items: center;
        margin-bottom: 2px;
        border-bottom: 1px solid #2a3546;
        color: #a9c5ff;
        cursor: grab;
        touch-action: none;
        user-select: none;
      }

      .rail-mark:active {
        cursor: grabbing;
      }

      .rail-mark:focus-visible {
        outline: 2px solid #477fbd;
        outline-offset: 2px;
        border-radius: 8px;
      }

      .rail-mark img {
        display: block;
        width: 28px;
        height: 28px;
        border-radius: 6px;
        object-fit: contain;
        pointer-events: none;
      }

      .tool-icon {
        position: relative;
        display: grid;
        width: 38px;
        min-width: 38px;
        height: 38px;
        min-height: 38px;
        flex: 0 0 auto;
        place-items: center;
        padding: 0;
        border-color: transparent;
        background: transparent;
        color: #98a6bc;
      }

      .tool-icon svg {
        width: 19px;
        height: 19px;
        fill: none;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 1.7;
      }

      .tool-icon[data-tab="select"] {
        --tool-active-color: #315e98;
      }

      .tool-icon[data-tab="text"] {
        --tool-active-color: #7950a1;
      }

      .tool-icon[data-tab="color"] {
        --tool-active-color: #b85c32;
      }

      .tool-icon[data-tab="space"] {
        --tool-active-color: #217b73;
      }

      .tool-icon[data-tab="layout"] {
        --tool-active-color: #24749b;
      }

      .tool-icon[data-tab="borders"] {
        --tool-active-color: #9a6818;
      }

      .tool-icon[data-tab="effects"] {
        --tool-active-color: #a84272;
      }

      .tool-icon[data-tab="mobile"] {
        --tool-active-color: #5b5bb1;
      }

      .tool-icon[aria-selected="true"],
      .tool-icon[data-preview-active="true"] {
        border-color: var(--tool-active-color);
        background: var(--tool-active-color);
        color: #fff;
      }

      .tool-icon[data-tab]:not([aria-selected="true"]):not([data-preview-active="true"]):hover:not(:disabled) {
        border-color: color-mix(in srgb, var(--tool-active-color) 42%, transparent);
        background: color-mix(in srgb, var(--tool-active-color) 12%, transparent);
        color: var(--tool-active-color);
      }

      .tool-icon[data-tab][aria-selected="true"]:hover:not(:disabled),
      .tool-icon[data-tab][data-preview-active="true"]:hover:not(:disabled) {
        border-color: var(--tool-active-color);
        background: var(--tool-active-color);
        color: #fff;
      }

      .tool-icon[data-tab][aria-selected="true"]:hover:not(:disabled) svg,
      .tool-icon[data-tab][data-preview-active="true"]:hover:not(:disabled) svg {
        filter: brightness(.75);
      }

      .tool-icon::after {
        position: absolute;
        top: 50%;
        right: calc(100% + 9px);
        z-index: 4;
        padding: 5px 7px;
        transform: translateY(-50%);
        border: 1px solid #344157;
        border-radius: 6px;
        background: #111824;
        color: #e8effb;
        content: attr(data-tooltip);
        font-size: 10px;
        opacity: 0;
        pointer-events: none;
        transition: opacity .12s ease;
        white-space: nowrap;
      }

      .tool-icon:hover::after,
      .tool-icon:focus-visible::after {
        opacity: 1;
      }

      .rail-spacer {
        min-height: 0;
        flex: 1;
      }

      .rail-close {
        color: #aebbd0;
      }

      .content {
        flex: 1;
        min-height: 0;
        padding: 9px 12px;
        overflow: auto;
        overscroll-behavior: contain;
      }

      .primary {
        width: 100%;
        min-height: 36px;
        border-color: #5279bb;
        background: #31588e;
        color: #fff;
        font-weight: 600;
      }

      .primary:hover:not(:disabled) {
        background: #3c69a5;
      }

      .primary.active {
        border-color: #d092ff;
        background: #694497;
      }

      .selection-card {
        margin-top: 8px;
        padding: 8px;
        border: 1px solid #2d3b50;
        border-radius: 8px;
        background: #151f2d;
      }

      .selection-card .eyebrow {
        display: block;
        margin-bottom: 3px;
        color: #8e9db4;
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: .08em;
      }

      .metadata-list {
        display: grid;
        gap: 4px;
        margin-top: 6px;
      }

      .metadata-row {
        display: grid;
        grid-template-columns: 50px minmax(0, 1fr);
        align-items: start;
        gap: 5px;
        font-size: 9px;
      }

      .metadata-label {
        color: #8e9db4;
        font-weight: 600;
      }

      .metadata-row code {
        display: block;
        overflow-wrap: anywhere;
        color: #9fb6db;
        font: 9px/1.35 Roboto, "Segoe UI", Arial, sans-serif;
        white-space: normal;
      }

      .field {
        display: block;
        margin: 7px 0 0;
      }

      .custom-style-editor {
        min-width: 0;
        margin: 8px 0 0;
        padding: 5px;
        border: 1px solid #354258;
        border-radius: 6px;
        background: #151f2d;
      }

      .custom-style-editor legend {
        padding: 0 4px;
        color: #93a9ca;
        font-size: 9px;
      }

      .custom-style-fields {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
        align-items: end;
        gap: 4px;
      }

      .custom-style-fields label {
        min-width: 0;
        color: #93a9ca;
        font-size: 9px;
      }

      .custom-style-fields input {
        width: 100%;
        min-width: 0;
        height: 22px;
        margin-top: 2px;
        padding: 2px 4px;
        border: 1px solid #354258;
        border-radius: 4px;
        background: #0d141e;
        color: #f2f5fa;
        font: 10px Roboto, "Segoe UI", Arial, sans-serif;
      }

      .custom-style-fields button {
        min-height: 22px;
        padding: 2px 5px;
        font-size: 9px;
      }

      .box-model-field {
        margin-top: 8px;
      }

      .box-model-master {
        display: grid;
        gap: 2px;
        margin: 4px 0 5px;
        padding: 4px 6px;
        border: 1px solid #354258;
        border-radius: 6px;
        background: #182333;
        color: #c8d1df;
        font-size: 9px;
      }

      .box-model-master-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 5px;
      }

      .box-model-master input[type="range"] {
        height: 15px;
        margin: 0;
      }

      .box-model-sides {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 4px 5px;
      }

      .box-model-side {
        display: grid;
        min-width: 0;
        grid-template-columns: minmax(0, 1fr);
        gap: 2px;
        color: #c8d1df;
        font-size: 10px;
      }

      .box-model-side-head {
        display: flex;
        min-width: 0;
        align-items: center;
        justify-content: space-between;
        gap: 4px;
      }

      .box-model-side input[type="range"] {
        width: 100%;
        min-width: 0;
        height: 16px;
        margin: 0;
        padding: 0;
      }

      .box-model-side .style-source {
        grid-column: 1 / -1;
      }

      .overlay-card .box-model-field {
        margin-top: 6px;
      }

      .overlay-card .box-model-side {
        color: #626b77;
        grid-template-columns: minmax(0, 1fr);
        gap: 2px;
        font-size: 9px;
      }

      .overlay-card .box-model-side input[type="range"] {
        height: 16px;
        padding: 0;
      }

      .field-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        margin-bottom: 3px;
        color: #c8d1df;
        font-size: 10px;
      }

      .value-readout {
        color: #93a9ca;
        font: 9px Roboto, "Segoe UI", Arial, sans-serif;
      }

      textarea,
      select {
        width: 100%;
        border: 1px solid #354258;
        border-radius: 7px;
        background: #0d141e;
      }

      textarea {
        min-height: 44px;
        padding: 5px 7px;
        resize: vertical;
      }

      select {
        min-height: 27px;
        padding: 3px 6px;
        border-radius: 5px;
        font: 10px Roboto, "Segoe UI", Arial, sans-serif;
      }

      input[type="range"] {
        display: block;
        width: 100%;
        height: 16px;
        margin: 0;
        accent-color: #82aaff;
      }

      .color-field {
        display: flex;
        flex-wrap: wrap;
        min-height: 32px;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        margin-top: 6px;
        padding: 4px 6px;
        border: 1px solid #2e3c50;
        border-radius: 7px;
        color: #d5deeb;
        font-size: 10px;
      }

      input[type="color"] {
        width: 32px;
        height: 22px;
        padding: 1px;
        border: 1px solid #48566c;
        border-radius: 5px;
        background: #111824;
        cursor: pointer;
      }

      .guide-toggle {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 7px 0;
        color: #d5deeb;
        font-size: 11px;
      }

      .guide-toggle input {
        accent-color: #82aaff;
      }

      .selection-state-controls {
        margin-top: 11px;
        padding-top: 8px;
        border-top: 1px solid #344157;
      }

      .selection-state-controls .eyebrow {
        display: block;
        margin-bottom: 3px;
        color: #aebbd0;
        font-size: 9px;
        font-weight: 650;
        letter-spacing: .08em;
        text-transform: uppercase;
      }

      .selection-state-note {
        display: block;
        color: #9aa8bd;
        font-size: 9px;
        line-height: 1.3;
      }

      .dom-tree-section {
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid #344157;
      }

      .dom-tree-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        margin-bottom: 5px;
        color: #aebbd0;
        font-size: 9px;
        font-weight: 650;
        letter-spacing: .06em;
        text-transform: uppercase;
      }

      .dom-tree-hint {
        color: #8493a8;
        font-size: 8px;
        font-weight: 400;
        letter-spacing: 0;
        text-transform: none;
      }

      .dom-tree {
        max-height: 270px;
        overflow: auto;
        padding: 5px;
        border: 1px solid #34445a;
        border-radius: 8px;
        background: #121b28;
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, .14);
        overscroll-behavior: contain;
        scrollbar-color: #50627b transparent;
        scrollbar-width: thin;
      }

      .dom-tree-node {
        min-width: 0;
        cursor: pointer;
        user-select: none;
      }

      .dom-tree-row {
        display: flex;
        min-height: 24px;
        align-items: center;
        gap: 4px;
        padding: 1px 2px;
        border-radius: 5px;
        transition: background-color .12s ease;
      }

      .dom-tree-row:hover {
        background: #202d3f;
      }

      .dom-tree-toggle {
        display: grid;
        width: 20px;
        min-width: 20px;
        min-height: 20px;
        flex: 0 0 20px;
        place-items: center;
        padding: 0;
        border: 0;
        background: transparent;
        border-radius: 4px;
        color: #91a5c1;
        cursor: pointer;
        font-size: 11px;
        line-height: 1;
        transition: background-color .12s ease, color .12s ease;
      }

      .dom-tree-toggle:hover:not(:disabled) {
        background: #2a3a50;
        color: #d3e2f7;
      }

      .dom-tree-toggle:disabled {
        visibility: hidden;
      }

      .dom-tree-label {
        display: flex;
        min-height: 21px;
        min-width: 0;
        align-items: center;
        gap: 5px;
        flex: 1;
        overflow: hidden;
        padding: 2px 5px;
        border-radius: 4px;
        font: 9px/1 Roboto, "Segoe UI", Arial, sans-serif;
        white-space: nowrap;
      }

      .dom-tree-tag {
        flex: 0 0 auto;
        color: #b6d2fb;
        font: 600 9px/1.2 ui-monospace, Consolas, monospace;
      }

      .dom-tree-tag-document {
        color: #f0c879;
      }

      .dom-tree-id {
        min-width: 0;
        overflow: hidden;
        color: #c9a7f5;
        text-overflow: ellipsis;
      }

      .dom-tree-class {
        min-width: 0;
        overflow: hidden;
        color: #91d4b0;
        text-overflow: ellipsis;
      }

      .dom-tree-class-more {
        flex: 0 0 auto;
        color: #9aa8bd;
      }

      .dom-tree-node[aria-selected="true"] > .dom-tree-row {
        background: #263d5c;
        box-shadow: inset 2px 0 #82aaff;
      }

      .dom-tree-node:focus-visible {
        outline: none;
      }

      .dom-tree-node:focus-visible > .dom-tree-row {
        outline: 2px solid #82aaff;
        outline-offset: 1px;
      }

      .dom-tree-group {
        margin-left: 9px;
        padding-left: 7px;
        border-left: 1px dashed #3c4b60;
      }

      .dom-tree-pagination {
        display: flex;
        gap: 5px;
        margin: 4px 0 4px 22px;
      }

      .dom-tree-pagination button {
        min-height: 22px;
        padding: 3px 7px;
        border: 1px solid #3b4b62;
        border-radius: 5px;
        background: #1b2839;
        color: #c6d3e5;
        cursor: pointer;
        font-size: 9px;
      }

      .dom-tree-pagination button:hover {
        background: #2b3c54;
      }

      .dom-tree-empty {
        padding: 5px 4px;
        color: #9aa8bd;
        font-size: 9px;
      }

      .mobile-preview-field {
        display: block;
        margin: 9px 0;
        color: #d5deeb;
        font-size: 10px;
      }

      .mobile-preview-field select {
        display: block;
        width: 100%;
        min-height: 28px;
        margin-top: 4px;
        padding: 3px 6px;
        border: 1px solid #354258;
        border-radius: 7px;
        background: #0d141e;
        color: #f2f5fa;
        font: inherit;
      }

      .mobile-preview-state {
        min-height: 28px;
        margin: 8px 0;
        padding: 6px 7px;
        border: 1px solid #2e3c50;
        border-radius: 7px;
        background: #151f2d;
        color: #aebbd0;
        font-size: 10px;
      }

      .mobile-preview-state[data-active="true"] {
        border-color: #426d5a;
        background: #14271f;
        color: #91ddb3;
      }

      .mobile-preview-toggle {
        width: 100%;
        min-height: 30px;
      }

      .footer {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 7px;
        padding: 9px 12px;
        border-top: 1px solid #2a3546;
      }

      .footer button {
        min-height: 32px;
        font-size: 11px;
      }

      .status {
        min-height: 25px;
        padding: 0 13px 9px;
        color: #92a2b9;
        font-size: 10px;
        line-height: 1.4;
      }

      .status[data-state="error"] {
        color: #ff9f9f;
      }

      .status[data-state="success"] {
        color: #91ddb3;
      }

      #panel,
      .tool-rail,
      .mobile-preview-controls {
        border-color: #dedad1;
        background-color: #fffdf8;
        color: #242a33;
      }

      #panel {
        box-shadow: 0 16px 42px rgba(32, 35, 40, .18);
      }

      .tool-rail {
        box-shadow: 0 12px 32px rgba(32, 35, 40, .2);
      }

      .mobile-preview-controls {
        box-shadow: 0 6px 20px rgba(32, 35, 40, .18);
      }

      .titlebar,
      .footer {
        border-color: #e8e4dc;
      }

      .brand p,
      .status {
        color: #68717e;
      }

      .rail-close {
        color: #626b77;
      }

      .tool-icon {
        color: #697381;
      }

      .tool-icon[aria-selected="true"],
      .tool-icon[data-preview-active="true"] {
        border-color: var(--tool-active-color);
        background: var(--tool-active-color);
        color: #fff;
      }

      .tool-icon::after {
        border-color: #dedad1;
        background: #fffdf8;
        color: #242a33;
        box-shadow: 0 4px 12px rgba(32, 35, 40, .12);
      }

      .rail-mark {
        border-color: #e8e4dc;
      }

      #panel button,
      .tool-overlay button,
      .mobile-preview-controls button {
        border-color: #d8d3c9;
        background: #f5f3ee;
        color: #303844;
      }

      .mobile-preview-controls select {
        border-color: #d8d3c9;
        background: #fff;
        color: #242a33;
      }

      #panel button:hover:not(:disabled),
      .tool-overlay button:hover:not(:disabled),
      .mobile-preview-controls button:hover:not(:disabled) {
        border-color: #c4cbd5;
        background: #eeece6;
      }

      .tool-overlay .dimension-link[aria-pressed="true"] {
        border-color: color-mix(in srgb, var(--active-tool-color, #315e98) 50%, #dedad1);
        background: color-mix(in srgb, var(--active-tool-color, #315e98) 12%, #fffdf8);
        color: #242a33;
      }

      .tool-overlay .dimension-link[aria-pressed="true"]:hover:not(:disabled) {
        border-color: color-mix(in srgb, var(--active-tool-color, #315e98) 55%, #dedad1);
        background: color-mix(in srgb, var(--active-tool-color, #315e98) 18%, #fffdf8);
      }

      #panel .primary {
        border-color: #356eae;
        background: #356eae;
        color: #fff;
      }

      #panel .primary:hover:not(:disabled) {
        border-color: #2f6199;
        background: #2f6199;
      }

      #panel .dimension-link {
        border-color: #d8d3c9;
        color: #526982;
      }

      #panel .dimension-link[aria-pressed="true"] {
        border-color: #b9c9e2;
        background: #eaf1fb;
        color: #315e98;
      }

      #panel button:focus-visible,
      #panel input:focus-visible,
      #panel select:focus-visible,
      #panel textarea:focus-visible,
      .mobile-preview-controls button:focus-visible,
      .mobile-preview-controls select:focus-visible {
        outline-color: #477fbd;
      }

      .selection-card {
        border-color: #e2ded6;
        background: #f7f5f0;
      }

      .selection-card .eyebrow,
      .metadata-label {
        color: #68717e;
      }

      #panel .box-model-master,
      .overlay-card .box-model-master {
        border-color: #e2ded6;
        background: #f7f5f0;
        color: #526982;
      }

      .dom-tree-section {
        border-color: #e2ded6;
      }

      .dom-tree-heading {
        color: #526982;
      }

      .dom-tree-hint {
        color: #8794a4;
      }

      .dom-tree {
        border-color: #dce3eb;
        background: #f8fafc;
        box-shadow: inset 0 1px 3px rgba(30, 52, 77, .06);
        scrollbar-color: #bdc9d8 transparent;
      }

      .dom-tree-row:hover {
        background: #edf3fa;
      }

      #panel .dom-tree-toggle {
        border: 0;
        background: transparent;
        color: #647a95;
      }

      #panel .dom-tree-toggle:hover:not(:disabled) {
        background: #e2ebf5;
        color: #345b83;
      }

      .dom-tree-label {
        color: #354253;
      }

      .dom-tree-tag {
        color: #345b83;
      }

      .dom-tree-tag-document {
        color: #906a1c;
      }

      .dom-tree-id {
        color: #78549b;
      }

      .dom-tree-class {
        color: #33785c;
      }

      .dom-tree-class-more {
        color: #8794a4;
      }

      .dom-tree-node[aria-selected="true"] > .dom-tree-row {
        background: #e5effc;
        box-shadow: inset 2px 0 #477fbd;
      }

      .dom-tree-node:focus-visible > .dom-tree-row {
        outline-color: #477fbd;
      }

      .dom-tree-group {
        border-color: #d5dee8;
      }

      #panel .dom-tree-pagination button {
        border-color: #d6e0eb;
        background: #fff;
        color: #40546c;
      }

      #panel .dom-tree-pagination button:hover:not(:disabled) {
        border-color: #bacadd;
        background: #edf3fa;
      }

      .dom-tree-empty {
        color: #68717e;
      }

      .metadata-row code {
        color: #425570;
      }

      #panel .style-source {
        color: #68717e;
      }

      .field-head,
      .color-field,
      .guide-toggle,
      .mobile-preview-field {
        color: #454d58;
      }

      .value-readout,
      #mobile-preview-dimensions {
        color: #526982;
      }

      #panel textarea,
      #panel select,
      .mobile-preview-field select {
        border-color: #d8d3c9;
        background: #fff;
        color: #242a33;
      }

      #panel input[type="range"],
      .guide-toggle input {
        accent-color: #477fbd;
      }

      #panel input[type="color"] {
        border-color: #d8d3c9;
        background: #fff;
      }

      .color-field,
      .mobile-preview-state,
      .custom-style-editor {
        border-color: #e2ded6;
        background: #f7f5f0;
      }

      #panel .custom-style-editor legend,
      #panel .custom-style-fields label {
        color: #526982;
      }

      #panel .custom-style-fields input {
        border-color: #d8d3c9;
        background: #fff;
        color: #242a33;
      }

      .mobile-preview-state {
        color: #68717e;
      }

      .mobile-preview-state[data-active="true"] {
        border-color: #b7d5c0;
        background: #edf6ef;
        color: #28623c;
      }

      #panel .status[data-state="error"] {
        color: #a52e2e;
      }

      #panel .status[data-state="success"] {
        color: #28623c;
      }

      .mobile-resize-handle:hover:not(:disabled) {
        border-color: #fff;
        background: #4d83d3;
      }

      #panel .content {
        scrollbar-color: #c6c1b8 #f4f2ed;
      }
    </style>
    <div class="grid" id="guide-grid" hidden></div>
    <div class="ruler horizontal" id="ruler-horizontal" hidden></div>
    <div class="ruler vertical" id="ruler-vertical" hidden></div>
    <div class="highlight" id="highlight" hidden></div>
    <div class="highlight selected" id="selected-highlight" hidden></div>
    <div class="space-overlay" id="space-overlay" aria-hidden="true" hidden>
      <div class="space-margin-area">
        <div class="space-border-area" id="space-border-area">
          <div class="space-padding-area" id="space-padding-area">
            <div class="space-content-area" id="space-content-area"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="alignment-guide horizontal" id="alignment-horizontal" hidden></div>
    <div class="alignment-guide vertical" id="alignment-vertical" hidden></div>
    <div id="mobile-preview-stage" hidden>
      <div id="mobile-preview-frame">
        <div id="mobile-preview-screen">
          <iframe id="mobile-preview-iframe" title="Mobile website preview"></iframe>
          <div id="mobile-preview-error" role="alert" hidden></div>
        </div>
        <div class="mobile-preview-controls" role="group" aria-label="Mobile preview controls">
          <select id="mobile-preview-device" aria-label="Phone preset" title="Choose a phone preset"></select>
          <span id="mobile-preview-dimensions" title="Drag to pan the mobile preview">390 × 844</span>
          <span id="mobile-preview-zoom-value" aria-live="polite">100%</span>
          <button id="mobile-preview-orientation" type="button" aria-label="Switch to landscape orientation">Landscape</button>
        </div>
        <button class="mobile-resize-handle" type="button" data-resize="n" aria-label="Resize preview height"></button>
        <button class="mobile-resize-handle" type="button" data-resize="s" aria-label="Resize preview height"></button>
        <button class="mobile-resize-handle" type="button" data-resize="e" aria-label="Resize preview width"></button>
        <button class="mobile-resize-handle" type="button" data-resize="w" aria-label="Resize preview width"></button>
        <button class="mobile-resize-handle" type="button" data-resize="ne" aria-label="Resize preview"></button>
        <button class="mobile-resize-handle" type="button" data-resize="nw" aria-label="Resize preview"></button>
        <button class="mobile-resize-handle" type="button" data-resize="se" aria-label="Resize preview"></button>
        <button class="mobile-resize-handle" type="button" data-resize="sw" aria-label="Resize preview"></button>
      </div>
    </div>
    <div class="tool-overlay" id="tool-overlay" aria-hidden="true" hidden>
      <div class="overlay-card" data-overlay="select" hidden>
        <span class="overlay-eyebrow">Select</span>
        <div class="overlay-metric"><span>Tag</span><code id="overlay-element-tag"></code></div>
        <div class="overlay-metric"><span>ID</span><code id="overlay-element-id"></code></div>
        <div class="overlay-metric"><span>Classes</span><code id="overlay-element-classes"></code></div>
        <div class="overlay-metric"><span>Height</span><code id="overlay-element-height"></code></div>
        <div class="overlay-metric"><span>Width</span><code id="overlay-element-width"></code></div>
      </div>
      <div class="overlay-card" data-overlay="text" hidden>
        <span class="overlay-eyebrow">Typography</span>
        <label class="overlay-widget">
          <span class="overlay-widget-head"><span>Font size</span><span class="value-readout"></span></span>
          <input id="overlay-font-size" type="range" min="8" max="72" step="1" value="16" data-style-property="font-size" data-unit="px" data-requires-selection disabled>
        </label>
        <label class="overlay-widget">
          <span class="overlay-widget-head">Font weight</span>
          <select id="overlay-font-weight" data-style-property="font-weight" data-requires-selection disabled>
            <option value="300">Light</option>
            <option value="400">Regular</option>
            <option value="500">Medium</option>
            <option value="600">Semi-bold</option>
            <option value="700">Bold</option>
            <option value="800">Extra-bold</option>
          </select>
        </label>
        <label class="overlay-widget">
          <span class="overlay-widget-head">Font family</span>
          <select id="overlay-font-family" data-style-property="font-family" data-requires-selection disabled>
            <option value="system-ui, sans-serif">System UI</option>
            <option value="Arial, sans-serif">Arial</option>
            <option value="Georgia, serif">Georgia</option>
            <option value="'Times New Roman', serif">Times New Roman</option>
            <option value="ui-monospace, monospace">Monospace</option>
          </select>
        </label>
        <label class="overlay-widget">
          <span class="overlay-widget-head"><span>Line height</span><span class="value-readout"></span></span>
          <input id="overlay-line-height" type="range" min="1" max="2.4" step="0.1" value="1.4" data-style-property="line-height" data-unit="" data-requires-selection disabled>
        </label>
        <label class="overlay-widget">
          <span class="overlay-widget-head">Text alignment</span>
          <select data-style-property="text-align" data-empty-on-unmatched data-requires-selection disabled>
            <option value="start">Start</option>
            <option value="center">Center</option>
            <option value="end">End</option>
            <option value="justify">Justify</option>
          </select>
        </label>
        <label class="overlay-widget">
          <span class="overlay-widget-head">Text decoration</span>
          <select data-style-property="text-decoration" data-empty-on-unmatched data-requires-selection disabled>
            <option value="none">None</option>
            <option value="underline">Underline</option>
            <option value="line-through">Line through</option>
          </select>
        </label>
        <label class="overlay-widget">
          <span class="overlay-widget-head"><span>Letter spacing</span><span class="value-readout"></span></span>
          <input type="range" min="-10" max="50" step="0.1" data-style-property="letter-spacing" data-unit="px" data-requires-selection disabled>
        </label>
      </div>
      <div class="overlay-card" data-overlay="color" hidden>
        <span class="overlay-eyebrow">Color</span>
        <div class="overlay-color-row">
          <span class="overlay-swatch" id="overlay-text-swatch"></span><span>Text</span><code id="overlay-text-color"></code>
          <input type="color" value="#202938" aria-label="On-screen text color" data-style-property="color" data-requires-selection disabled>
        </div>
        <div class="overlay-color-row">
          <span class="overlay-swatch" id="overlay-background-swatch"></span><span>Background</span><code id="overlay-background-color"></code>
          <input type="color" value="#ffffff" aria-label="On-screen background color" data-style-property="background-color" data-requires-selection disabled>
        </div>
      </div>
      <div class="overlay-card" data-overlay="layout" hidden>
        <span class="overlay-eyebrow">Layout</span>
        <label class="overlay-widget">
          <span class="overlay-widget-head">Display</span>
          <select id="overlay-layout-display" data-style-property="display" data-empty-on-unmatched data-requires-selection disabled>
            <option value="" disabled selected>Choose display</option>
            <option value="block">Block</option>
            <option value="inline">Inline</option>
            <option value="inline-block">Inline block</option>
            <option value="flex">Flex</option>
            <option value="inline-flex">Inline flex</option>
            <option value="grid">Grid</option>
            <option value="inline-grid">Inline grid</option>
          </select>
        </label>
        <label class="overlay-widget">
          <span class="overlay-widget-head">Position</span>
          <select id="overlay-layout-position" data-style-property="position" data-empty-on-unmatched data-requires-selection disabled>
            <option value="" disabled selected>Choose position</option>
            <option value="static">Static</option>
            <option value="relative">Relative</option>
            <option value="absolute">Absolute</option>
            <option value="fixed">Fixed</option>
            <option value="sticky">Sticky</option>
          </select>
        </label>
        <label class="overlay-widget">
          <span class="overlay-widget-head">Gap</span>
          <select id="overlay-layout-gap" data-style-property="gap" data-empty-on-unmatched data-requires-selection disabled>
            <option value="" disabled selected>Choose gap</option>
            <option value="normal">Normal</option>
            <option value="0px">0 px</option>
            <option value="4px">4 px</option>
            <option value="8px">8 px</option>
            <option value="12px">12 px</option>
            <option value="16px">16 px</option>
            <option value="24px">24 px</option>
            <option value="32px">32 px</option>
            <option value="40px">40 px</option>
            <option value="48px">48 px</option>
            <option value="64px">64 px</option>
            <option value="80px">80 px</option>
          </select>
        </label>
        <label class="overlay-widget">
          <span class="overlay-widget-head">z-index</span>
          <select id="overlay-layout-z-index" data-style-property="z-index" data-empty-on-unmatched data-requires-selection disabled>
            <option value="" disabled selected>Choose stack order</option>
            <option value="auto">Auto</option>
            <option value="0">0</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="10">10</option>
            <option value="100">100</option>
          </select>
        </label>
        <label class="overlay-widget" data-flex-only data-flex-primary hidden>
          <span class="overlay-widget-head">Flex direction</span>
          <select data-style-property="flex-direction" data-empty-on-unmatched data-requires-selection disabled>
            <option value="row">Row</option>
            <option value="column">Column</option>
            <option value="row-reverse">Row reverse</option>
            <option value="column-reverse">Column reverse</option>
          </select>
        </label>
        <label class="overlay-widget" data-flex-only data-flex-primary hidden>
          <span class="overlay-widget-head">Justify content</span>
          <select data-style-property="justify-content" data-empty-on-unmatched data-requires-selection disabled>
            <option value="flex-start">Start</option>
            <option value="center">Center</option>
            <option value="flex-end">End</option>
            <option value="space-between">Space between</option>
            <option value="space-around">Space around</option>
            <option value="space-evenly">Space evenly</option>
          </select>
        </label>
        <label class="overlay-widget" data-flex-only data-flex-primary hidden>
          <span class="overlay-widget-head">Align items</span>
          <select data-style-property="align-items" data-empty-on-unmatched data-requires-selection disabled>
            <option value="stretch">Stretch</option>
            <option value="flex-start">Start</option>
            <option value="center">Center</option>
            <option value="flex-end">End</option>
            <option value="baseline">Baseline</option>
          </select>
        </label>
        <label class="overlay-widget" data-flex-only hidden>
          <span class="overlay-widget-head">Align content</span>
          <select data-style-property="align-content" data-empty-on-unmatched data-requires-selection disabled>
            <option value="normal">Normal</option>
            <option value="flex-start">Start</option>
            <option value="center">Center</option>
            <option value="flex-end">End</option>
            <option value="space-between">Space between</option>
            <option value="space-around">Space around</option>
            <option value="space-evenly">Space evenly</option>
            <option value="stretch">Stretch</option>
          </select>
        </label>
        <label class="overlay-widget" data-flex-only hidden>
          <span class="overlay-widget-head">Align self</span>
          <select data-style-property="align-self" data-empty-on-unmatched data-requires-selection disabled>
            <option value="auto">Auto</option>
            <option value="stretch">Stretch</option>
            <option value="flex-start">Start</option>
            <option value="center">Center</option>
            <option value="flex-end">End</option>
            <option value="baseline">Baseline</option>
          </select>
        </label>
        <label class="overlay-widget">
          <span class="overlay-widget-head">Overflow</span>
          <select data-style-property="overflow" data-empty-on-unmatched data-requires-selection disabled>
            <option value="visible">Visible</option>
            <option value="hidden">Hidden</option>
            <option value="clip">Clip</option>
            <option value="auto">Auto</option>
            <option value="scroll">Scroll</option>
          </select>
        </label>
        <label class="overlay-toggle"><input id="overlay-grid-toggle" type="checkbox"> Grid</label>
        <label class="overlay-toggle"><input id="overlay-ruler-toggle" type="checkbox"> Rulers</label>
      </div>
      <div class="overlay-card" data-overlay="borders" hidden>
        <span class="overlay-eyebrow">Borders</span>
        <label class="overlay-widget">
          <span class="overlay-widget-head"><span>Border width · all sides</span><span class="value-readout"></span></span>
          <input type="range" min="0" max="20" step="1" data-style-property="border-width" data-unit="px" data-requires-selection disabled>
        </label>
        <label class="overlay-widget">
          <span class="overlay-widget-head">Border style</span>
          <select data-style-property="border-style" data-empty-on-unmatched data-requires-selection disabled>
            <option value="" disabled selected>Choose border style</option>
            <option value="none">None</option>
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
            <option value="double">Double</option>
          </select>
        </label>
        <label class="overlay-widget">
          <span class="overlay-widget-head">Border color</span>
          <input type="color" value="#000000" data-style-property="border-color" data-requires-selection disabled>
        </label>
        <label class="overlay-widget">
          <span class="overlay-widget-head"><span>Corner radius</span><span class="value-readout"></span></span>
          <input type="range" min="0" max="50" step="1" data-style-property="border-radius" data-unit="px" data-requires-selection disabled>
        </label>
        <label class="overlay-widget">
          <span class="overlay-widget-head">Outline</span>
          <select data-style-property="outline" data-empty-on-unmatched data-requires-selection disabled>
            <option value="none">None</option>
            <option value="1px solid currentColor">Thin solid</option>
            <option value="2px solid currentColor">Solid</option>
            <option value="2px dashed currentColor">Dashed</option>
          </select>
        </label>
        <label class="overlay-widget">
          <span class="overlay-widget-head"><span>Outline offset</span><span class="value-readout"></span></span>
          <input type="range" min="-20" max="20" step="1" data-style-property="outline-offset" data-unit="px" data-requires-selection disabled>
        </label>
      </div>
      <div class="overlay-card" data-overlay="effects" hidden>
        <span class="overlay-eyebrow">Effects</span>
        <label class="overlay-widget">
          <span class="overlay-widget-head"><span>Opacity</span><span class="value-readout"></span></span>
          <input type="range" min="0" max="1" step="0.05" data-style-property="opacity" data-unit="" data-requires-selection disabled>
        </label>
        <label class="overlay-widget">
          <span class="overlay-widget-head">Box shadow</span>
          <select data-style-property="box-shadow" data-empty-on-unmatched data-requires-selection disabled>
            <option value="" disabled selected>Choose a shadow</option>
            <option value="none">None</option>
            <option value="0 1px 3px rgba(0, 0, 0, 0.18)">Soft</option>
            <option value="0 4px 12px rgba(0, 0, 0, 0.18)">Medium</option>
            <option value="0 12px 28px rgba(0, 0, 0, 0.24)">Strong</option>
          </select>
        </label>
        <label class="overlay-widget">
          <span class="overlay-widget-head">Filter</span>
          <select data-style-property="filter" data-empty-on-unmatched data-requires-selection disabled>
            <option value="" disabled selected>Choose a filter</option>
            <option value="none">None</option>
            <option value="grayscale(1)">Grayscale</option>
            <option value="sepia(1)">Sepia</option>
            <option value="blur(2px)">Blur</option>
            <option value="contrast(1.2)">More contrast</option>
            <option value="brightness(1.1)">Brighter</option>
            <option value="saturate(1.5)">More saturation</option>
          </select>
        </label>
        <label class="overlay-widget">
          <span class="overlay-widget-head">Transform</span>
          <select data-style-property="transform" data-empty-on-unmatched data-requires-selection disabled>
            <option value="none">None</option>
            <option value="scale(0.95)">Scale down</option>
            <option value="scale(1.05)">Scale up</option>
            <option value="rotate(-3deg)">Rotate left</option>
            <option value="rotate(3deg)">Rotate right</option>
          </select>
        </label>
        <label class="overlay-widget">
          <span class="overlay-widget-head">Text shadow</span>
          <select data-style-property="text-shadow" data-empty-on-unmatched data-requires-selection disabled>
            <option value="none">None</option>
            <option value="1px 1px 2px rgba(0, 0, 0, 0.3)">Subtle</option>
            <option value="0 2px 6px rgba(0, 0, 0, 0.35)">Soft</option>
            <option value="0 3px 10px rgba(0, 0, 0, 0.5)">Strong</option>
          </select>
        </label>
        <label class="overlay-widget">
          <span class="overlay-widget-head">Backdrop filter</span>
          <select data-style-property="backdrop-filter" data-empty-on-unmatched data-requires-selection disabled>
            <option value="none">None</option>
            <option value="blur(4px)">Blur</option>
            <option value="blur(8px)">Strong blur</option>
            <option value="grayscale(1)">Grayscale</option>
          </select>
        </label>
        <label class="overlay-widget">
          <span class="overlay-widget-head">Transition</span>
          <select data-style-property="transition" data-empty-on-unmatched data-requires-selection disabled>
            <option value="none">None</option>
            <option value="all 150ms ease">Quick</option>
            <option value="all 300ms ease">Smooth</option>
            <option value="opacity 200ms ease">Fade</option>
            <option value="transform 200ms ease">Transform</option>
          </select>
        </label>
      </div>
      <div class="overlay-card" data-overlay="space" hidden>
        <span class="overlay-eyebrow">Spacing</span>
        <div class="field box-model-field">
          <span class="field-head">Margin</span>
          <div class="box-model-sides">
            <label class="box-model-side"><span class="box-model-side-head"><span>Top</span><span class="value-readout"></span></span><input type="range" min="0" max="500" step="1" data-style-property="margin-top" data-unit="px" data-requires-selection disabled></label>
            <label class="box-model-side"><span class="box-model-side-head"><span>Right</span><span class="value-readout"></span></span><input type="range" min="0" max="500" step="1" data-style-property="margin-right" data-unit="px" data-requires-selection disabled></label>
            <label class="box-model-side"><span class="box-model-side-head"><span>Bottom</span><span class="value-readout"></span></span><input type="range" min="0" max="500" step="1" data-style-property="margin-bottom" data-unit="px" data-requires-selection disabled></label>
            <label class="box-model-side"><span class="box-model-side-head"><span>Left</span><span class="value-readout"></span></span><input type="range" min="0" max="500" step="1" data-style-property="margin-left" data-unit="px" data-requires-selection disabled></label>
          </div>
        </div>
        <div class="field box-model-field">
          <span class="field-head">Padding</span>
          <div class="box-model-sides">
            <label class="box-model-side"><span class="box-model-side-head"><span>Top</span><span class="value-readout"></span></span><input type="range" min="0" max="200" step="1" data-style-property="padding-top" data-unit="px" data-requires-selection disabled></label>
            <label class="box-model-side"><span class="box-model-side-head"><span>Right</span><span class="value-readout"></span></span><input type="range" min="0" max="200" step="1" data-style-property="padding-right" data-unit="px" data-requires-selection disabled></label>
            <label class="box-model-side"><span class="box-model-side-head"><span>Bottom</span><span class="value-readout"></span></span><input type="range" min="0" max="200" step="1" data-style-property="padding-bottom" data-unit="px" data-requires-selection disabled></label>
            <label class="box-model-side"><span class="box-model-side-head"><span>Left</span><span class="value-readout"></span></span><input type="range" min="0" max="200" step="1" data-style-property="padding-left" data-unit="px" data-requires-selection disabled></label>
          </div>
        </div>
        <div class="dimension-grid">
          <div class="dimension-field" data-dimension-control="width">
            <div class="dimension-field-head"><label for="overlay-width">Width</label><span class="value-readout"></span></div>
            <div class="dimension-control-row">
              <input id="overlay-width" type="range" min="24" max="1200" step="1" data-style-property="width" data-size-value="width" data-requires-selection disabled>
              <select class="dimension-unit" aria-label="Width unit" data-size-unit="width" data-requires-selection disabled><option value="px">px</option><option value="%">%</option></select>
            </div>
          </div>
          <div class="dimension-field" data-dimension-control="height">
            <div class="dimension-field-head"><label for="overlay-height">Height</label><span class="value-readout"></span></div>
            <div class="dimension-control-row">
              <input id="overlay-height" type="range" min="16" max="800" step="1" data-style-property="height" data-size-value="height" data-requires-selection disabled>
              <select class="dimension-unit" aria-label="Height unit" data-size-unit="height" data-requires-selection disabled><option value="px">px</option><option value="%">%</option></select>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div id="workspace">
      <aside id="panel" aria-label="Domino tool properties" aria-hidden="true" hidden>
        <header class="titlebar">
          <div class="brand">
            <h1 id="panel-tool-name"></h1>
            <p id="panel-tool-description"></p>
          </div>
        </header>
      <main class="content">
        <section class="tool-panel" role="tabpanel" data-panel="select">
          <div class="selection-card">
            <span class="eyebrow">Selected element</span>
            <div class="metadata-list">
              <div class="metadata-row"><span class="metadata-label">Tag</span><code id="selected-tag">—</code></div>
              <div class="metadata-row"><span class="metadata-label">ID</span><code id="selected-id">—</code></div>
              <div class="metadata-row"><span class="metadata-label">Classes</span><code id="selected-classes">—</code></div>
              <div class="metadata-row"><span class="metadata-label">Selector</span><code id="selected-selector">Click an element to inspect it.</code></div>
            </div>
          </div>
          <div class="dom-tree-section">
            <div class="dom-tree-heading"><span>DOM tree</span><span class="dom-tree-hint">Click a row to select</span></div>
            <div id="dom-tree" class="dom-tree" role="tree" aria-label="Page DOM tree"></div>
          </div>
          <div class="selection-state-controls">
            <span class="eyebrow">Preview states</span>
            <label class="guide-toggle"><input type="checkbox" data-selection-state="hover" data-requires-selection disabled> Hover</label>
            <label class="guide-toggle"><input type="checkbox" data-selection-state="focus" data-requires-selection disabled> Focus</label>
            <label class="guide-toggle"><input type="checkbox" data-selection-state="active" data-requires-selection disabled> Active</label>
            <label class="guide-toggle"><input type="checkbox" data-selection-state="disabled" data-requires-selection disabled> Disabled</label>
            <label class="guide-toggle"><input type="checkbox" data-selection-state="checked" data-requires-selection disabled> Checked</label>
            <span class="selection-state-note">Previews matching CSS pseudo-state styles without triggering page click handlers.</span>
          </div>
        </section>
        <section class="tool-panel" role="tabpanel" data-panel="text" hidden>
          <label class="field">
            <span class="field-head">Text content</span>
            <textarea id="text-content" data-requires-selection disabled></textarea>
          </label>
          <label class="field">
            <span class="field-head"><span>Font size</span><span class="value-readout"></span></span>
            <input type="range" min="8" max="72" step="1" value="16" data-style-property="font-size" data-unit="px" data-requires-selection disabled>
          </label>
          <label class="field">
            <span class="field-head">Font family</span>
            <select id="font-family" data-style-property="font-family" data-requires-selection disabled>
              <option value="system-ui, sans-serif">System UI</option>
              <option value="Arial, sans-serif">Arial</option>
              <option value="Georgia, serif">Georgia</option>
              <option value="'Times New Roman', serif">Times New Roman</option>
              <option value="ui-monospace, monospace">Monospace</option>
            </select>
          </label>
          <label class="field">
            <span class="field-head">Font weight</span>
            <select id="font-weight" data-style-property="font-weight" data-requires-selection disabled>
              <option value="300">Light</option>
              <option value="400">Regular</option>
              <option value="500">Medium</option>
              <option value="600">Semi-bold</option>
              <option value="700">Bold</option>
              <option value="800">Extra-bold</option>
            </select>
          </label>
          <label class="field">
            <span class="field-head"><span>Line height</span><span class="value-readout"></span></span>
            <input type="range" min="1" max="2.4" step="0.1" value="1.4" data-style-property="line-height" data-unit="" data-requires-selection disabled>
          </label>
          <label class="field">
            <span class="field-head">Text alignment</span>
            <select data-style-property="text-align" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose alignment</option>
              <option value="start">Start</option>
              <option value="end">End</option>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
              <option value="justify">Justify</option>
            </select>
          </label>
          <label class="field">
            <span class="field-head">Text decoration</span>
            <select data-style-property="text-decoration" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose decoration</option>
              <option value="none">None</option>
              <option value="underline">Underline</option>
              <option value="overline">Overline</option>
              <option value="line-through">Line through</option>
            </select>
          </label>
          <label class="field">
            <span class="field-head"><span>Letter spacing</span><span class="value-readout"></span></span>
            <input type="range" min="-10" max="50" step="0.1" data-style-property="letter-spacing" data-unit="px" data-requires-selection disabled>
          </label>
          <label class="field">
            <span class="field-head"><span>Word spacing</span><span class="value-readout"></span></span>
            <input type="range" min="-10" max="50" step="1" data-style-property="word-spacing" data-unit="px" data-requires-selection disabled>
          </label>
          <label class="field">
            <span class="field-head">White space</span>
            <select data-style-property="white-space" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose behavior</option>
              <option value="normal">Normal</option>
              <option value="nowrap">No wrap</option>
              <option value="pre">Preserve</option>
              <option value="pre-wrap">Preserve and wrap</option>
              <option value="pre-line">Preserve lines</option>
              <option value="break-spaces">Break spaces</option>
            </select>
          </label>
        </section>
        <section class="tool-panel" role="tabpanel" data-panel="color" hidden>
          <label class="color-field">Text color
            <input type="color" value="#202938" data-style-property="color" data-requires-selection disabled>
          </label>
          <label class="color-field">Background
            <input type="color" value="#ffffff" data-style-property="background-color" data-requires-selection disabled>
          </label>
        </section>
        <section class="tool-panel" role="tabpanel" data-panel="space" hidden>
          <div class="field box-model-field">
            <span class="field-head">Margin</span>
            <label class="box-model-master">
              <span class="box-model-master-head"><span>All sides</span><span class="value-readout"></span></span>
              <input type="range" min="0" max="500" step="1" data-box-model-master="margin" data-unit="px" data-requires-selection disabled>
            </label>
            <div class="box-model-sides">
              <label class="box-model-side"><span class="box-model-side-head"><span>Top</span><span class="value-readout"></span></span><input type="range" min="0" max="500" step="1" data-style-property="margin-top" data-unit="px" data-requires-selection disabled></label>
              <label class="box-model-side"><span class="box-model-side-head"><span>Right</span><span class="value-readout"></span></span><input type="range" min="0" max="500" step="1" data-style-property="margin-right" data-unit="px" data-requires-selection disabled></label>
              <label class="box-model-side"><span class="box-model-side-head"><span>Bottom</span><span class="value-readout"></span></span><input type="range" min="0" max="500" step="1" data-style-property="margin-bottom" data-unit="px" data-requires-selection disabled></label>
              <label class="box-model-side"><span class="box-model-side-head"><span>Left</span><span class="value-readout"></span></span><input type="range" min="0" max="500" step="1" data-style-property="margin-left" data-unit="px" data-requires-selection disabled></label>
            </div>
          </div>
          <div class="field box-model-field">
            <span class="field-head">Padding</span>
            <label class="box-model-master">
              <span class="box-model-master-head"><span>All sides</span><span class="value-readout"></span></span>
              <input type="range" min="0" max="200" step="1" data-box-model-master="padding" data-unit="px" data-requires-selection disabled>
            </label>
            <div class="box-model-sides">
              <label class="box-model-side"><span class="box-model-side-head"><span>Top</span><span class="value-readout"></span></span><input type="range" min="0" max="200" step="1" data-style-property="padding-top" data-unit="px" data-requires-selection disabled></label>
              <label class="box-model-side"><span class="box-model-side-head"><span>Right</span><span class="value-readout"></span></span><input type="range" min="0" max="200" step="1" data-style-property="padding-right" data-unit="px" data-requires-selection disabled></label>
              <label class="box-model-side"><span class="box-model-side-head"><span>Bottom</span><span class="value-readout"></span></span><input type="range" min="0" max="200" step="1" data-style-property="padding-bottom" data-unit="px" data-requires-selection disabled></label>
              <label class="box-model-side"><span class="box-model-side-head"><span>Left</span><span class="value-readout"></span></span><input type="range" min="0" max="200" step="1" data-style-property="padding-left" data-unit="px" data-requires-selection disabled></label>
            </div>
          </div>
          <div class="field">
            <span class="field-head">Dimensions</span>
            <div class="dimension-grid">
              <div class="dimension-field" data-dimension-control="width">
                <div class="dimension-field-head"><label for="panel-width">Width</label><span class="value-readout"></span></div>
                <div class="dimension-control-row">
                  <input id="panel-width" type="range" min="24" max="1200" step="1" data-style-property="width" data-size-value="width" data-requires-selection disabled>
                  <select class="dimension-unit" aria-label="Width unit" data-size-unit="width" data-requires-selection disabled><option value="px">px</option><option value="%">%</option></select>
                </div>
              </div>
              <div class="dimension-field" data-dimension-control="height">
                <div class="dimension-field-head"><label for="panel-height">Height</label><span class="value-readout"></span></div>
                <div class="dimension-control-row">
                  <input id="panel-height" type="range" min="16" max="800" step="1" data-style-property="height" data-size-value="height" data-requires-selection disabled>
                  <select class="dimension-unit" aria-label="Height unit" data-size-unit="height" data-requires-selection disabled><option value="px">px</option><option value="%">%</option></select>
                </div>
              </div>
            </div>
            <div class="dimension-grid">
              <label class="dimension-field">
                <span class="dimension-field-head"><span>Min width · px</span><span class="value-readout"></span></span>
                <input type="range" min="0" max="2000" step="1" data-style-property="min-width" data-unit="px" data-requires-selection disabled>
              </label>
              <label class="dimension-field">
                <span class="dimension-field-head"><span>Max width · px</span><span class="value-readout"></span></span>
                <input type="range" min="0" max="2000" step="1" data-range-empty="none" data-style-property="max-width" data-unit="px" data-requires-selection disabled>
              </label>
              <label class="dimension-field">
                <span class="dimension-field-head"><span>Min height · px</span><span class="value-readout"></span></span>
                <input type="range" min="0" max="2000" step="1" data-style-property="min-height" data-unit="px" data-requires-selection disabled>
              </label>
              <label class="dimension-field">
                <span class="dimension-field-head"><span>Max height · px</span><span class="value-readout"></span></span>
                <input type="range" min="0" max="2000" step="1" data-range-empty="none" data-style-property="max-height" data-unit="px" data-requires-selection disabled>
              </label>
            </div>
            <label class="field">
              <span class="field-head">Box sizing</span>
              <select data-style-property="box-sizing" data-empty-on-unmatched data-requires-selection disabled>
                <option value="" disabled selected>Choose box sizing</option>
                <option value="content-box">Content box</option>
                <option value="border-box">Border box</option>
              </select>
            </label>
            <button class="dimension-link" type="button" data-link-dimensions data-requires-selection disabled aria-label="Link width and height proportions" aria-pressed="false" title="Lock width and height proportions">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72"></path><path d="M14 11a5 5 0 0 0-7.07 0l-3 3A5 5 0 0 0 11 21.07l1.72-1.72"></path><path d="m8 16 8-8"></path></svg>
              <span>Lock proportions</span>
            </button>
          </div>
        </section>
        <section class="tool-panel" role="tabpanel" data-panel="layout" hidden>
          <label class="guide-toggle"><input id="grid-toggle" type="checkbox"> 20px grid</label>
          <label class="guide-toggle"><input id="ruler-toggle" type="checkbox"> Viewport rulers</label>
          <label class="field">
            <span class="field-head">Display</span>
            <select data-style-property="display" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose display</option>
              <option value="block">Block</option>
              <option value="inline">Inline</option>
              <option value="inline-block">Inline block</option>
              <option value="flex">Flex</option>
              <option value="inline-flex">Inline flex</option>
              <option value="grid">Grid</option>
              <option value="inline-grid">Inline grid</option>
            </select>
          </label>
          <label class="field">
            <span class="field-head">Position</span>
            <select data-style-property="position" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose position</option>
              <option value="static">Static</option>
              <option value="relative">Relative</option>
              <option value="absolute">Absolute</option>
              <option value="fixed">Fixed</option>
              <option value="sticky">Sticky</option>
            </select>
          </label>
          <div class="field">
            <span class="field-head">Position offsets</span>
            <div class="dimension-grid">
              <label class="dimension-field">
                <span class="dimension-field-head"><span>Top · px</span><span class="value-readout"></span></span>
                <input type="range" min="-1000" max="2000" step="1" data-range-empty="auto" data-style-property="top" data-unit="px" data-requires-selection disabled>
              </label>
              <label class="dimension-field">
                <span class="dimension-field-head"><span>Left · px</span><span class="value-readout"></span></span>
                <input type="range" min="-1000" max="2000" step="1" data-range-empty="auto" data-style-property="left" data-unit="px" data-requires-selection disabled>
              </label>
              <label class="dimension-field">
                <span class="dimension-field-head"><span>Right · px</span><span class="value-readout"></span></span>
                <input type="range" min="-1000" max="2000" step="1" data-range-empty="auto" data-style-property="right" data-unit="px" data-requires-selection disabled>
              </label>
              <label class="dimension-field">
                <span class="dimension-field-head"><span>Bottom · px</span><span class="value-readout"></span></span>
                <input type="range" min="-1000" max="2000" step="1" data-range-empty="auto" data-style-property="bottom" data-unit="px" data-requires-selection disabled>
              </label>
            </div>
          </div>
          <label class="field" data-flex-only data-flex-primary hidden>
            <span class="field-head">Flex direction</span>
            <select data-style-property="flex-direction" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose direction</option>
              <option value="row">Row</option>
              <option value="row-reverse">Row reverse</option>
              <option value="column">Column</option>
              <option value="column-reverse">Column reverse</option>
            </select>
          </label>
          <label class="field" data-flex-only hidden>
            <span class="field-head">Flex flow</span>
            <select data-style-property="flex-flow" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose flow</option>
              <option value="row nowrap">Row · no wrap</option>
              <option value="row wrap">Row · wrap</option>
              <option value="row-reverse nowrap">Reverse row · no wrap</option>
              <option value="row-reverse wrap">Reverse row · wrap</option>
              <option value="column nowrap">Column · no wrap</option>
              <option value="column wrap">Column · wrap</option>
              <option value="column-reverse nowrap">Reverse column · no wrap</option>
              <option value="column-reverse wrap">Reverse column · wrap</option>
            </select>
          </label>
          <label class="field" data-flex-only hidden>
            <span class="field-head">Flex wrap</span>
            <select data-style-property="flex-wrap" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose wrapping</option>
              <option value="nowrap">No wrap</option>
              <option value="wrap">Wrap</option>
              <option value="wrap-reverse">Wrap reverse</option>
            </select>
          </label>
          <label class="field" data-flex-only hidden>
            <span class="field-head">Flex</span>
            <select data-style-property="flex" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose flex sizing</option>
              <option value="initial">Initial</option>
              <option value="auto">Auto</option>
              <option value="none">None</option>
              <option value="1">Grow</option>
              <option value="0 1 auto">Shrink only</option>
            </select>
          </label>
          <label class="field" data-flex-only hidden>
            <span class="field-head"><span>Flex grow</span><span class="value-readout"></span></span>
            <input type="range" min="0" max="10" step="0.1" data-style-property="flex-grow" data-requires-selection disabled>
          </label>
          <label class="field" data-flex-only hidden>
            <span class="field-head"><span>Flex shrink</span><span class="value-readout"></span></span>
            <input type="range" min="0" max="10" step="0.1" data-style-property="flex-shrink" data-requires-selection disabled>
          </label>
          <label class="field" data-flex-only hidden>
            <span class="field-head">Flex basis</span>
            <select data-style-property="flex-basis" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose basis</option>
              <option value="auto">Auto</option>
              <option value="content">Content</option>
              <option value="0">0</option>
              <option value="25%">25%</option>
              <option value="50%">50%</option>
              <option value="75%">75%</option>
              <option value="100%">100%</option>
            </select>
          </label>
          <label class="field" data-flex-only hidden>
            <span class="field-head"><span>Flex item order</span><span class="value-readout"></span></span>
            <input type="range" min="-10" max="10" step="1" data-style-property="order" data-requires-selection disabled>
          </label>
          <label class="field" data-flex-only data-flex-primary hidden>
            <span class="field-head">Justify content</span>
            <select data-style-property="justify-content" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose distribution</option>
              <option value="normal">Normal</option>
              <option value="flex-start">Start</option>
              <option value="center">Center</option>
              <option value="flex-end">End</option>
              <option value="space-between">Space between</option>
              <option value="space-around">Space around</option>
              <option value="space-evenly">Space evenly</option>
            </select>
          </label>
          <label class="field" data-flex-only data-flex-primary hidden>
            <span class="field-head">Align items</span>
            <select data-style-property="align-items" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose alignment</option>
              <option value="normal">Normal</option>
              <option value="stretch">Stretch</option>
              <option value="flex-start">Start</option>
              <option value="center">Center</option>
              <option value="flex-end">End</option>
              <option value="baseline">Baseline</option>
            </select>
          </label>
          <label class="field" data-flex-only hidden>
            <span class="field-head">Align content</span>
            <select data-style-property="align-content" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose content alignment</option>
              <option value="normal">Normal</option>
              <option value="flex-start">Start</option>
              <option value="center">Center</option>
              <option value="flex-end">End</option>
              <option value="space-between">Space between</option>
              <option value="space-around">Space around</option>
              <option value="space-evenly">Space evenly</option>
              <option value="stretch">Stretch</option>
              <option value="baseline">Baseline</option>
            </select>
          </label>
          <label class="field" data-flex-only hidden>
            <span class="field-head">Align self</span>
            <select data-style-property="align-self" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose item alignment</option>
              <option value="auto">Auto</option>
              <option value="normal">Normal</option>
              <option value="flex-start">Start</option>
              <option value="center">Center</option>
              <option value="flex-end">End</option>
              <option value="stretch">Stretch</option>
              <option value="baseline">Baseline</option>
            </select>
          </label>
          <label class="field">
            <span class="field-head"><span>Gap</span><span class="value-readout"></span></span>
            <input type="range" min="0" max="80" step="1" data-style-property="gap" data-unit="px" data-requires-selection disabled>
          </label>
          <label class="field">
            <span class="field-head"><span>Row gap</span><span class="value-readout"></span></span>
            <input type="range" min="0" max="80" step="1" data-style-property="row-gap" data-unit="px" data-requires-selection disabled>
          </label>
          <label class="field">
            <span class="field-head"><span>Column gap</span><span class="value-readout"></span></span>
            <input type="range" min="0" max="80" step="1" data-style-property="column-gap" data-unit="px" data-requires-selection disabled>
          </label>
          <label class="field">
            <span class="field-head">Grid columns</span>
            <select data-style-property="grid-template-columns" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose columns</option>
              <option value="none">None</option>
              <option value="repeat(2, 1fr)">2 equal columns</option>
              <option value="repeat(3, 1fr)">3 equal columns</option>
              <option value="repeat(4, 1fr)">4 equal columns</option>
              <option value="1fr 2fr">1 to 2 columns</option>
            </select>
          </label>
          <label class="field">
            <span class="field-head">Stack order</span>
            <select data-style-property="z-index" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose stack order</option>
              <option value="auto">Auto</option>
              <option value="0">0</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="10">10</option>
              <option value="100">100</option>
            </select>
          </label>
          <label class="field">
            <span class="field-head">Overflow</span>
            <select data-style-property="overflow" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose overflow</option>
              <option value="visible">Visible</option>
              <option value="hidden">Hidden</option>
              <option value="clip">Clip</option>
              <option value="scroll">Scroll</option>
              <option value="auto">Auto</option>
            </select>
          </label>
          <label class="field">
            <span class="field-head">Overflow X</span>
            <select data-style-property="overflow-x" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose horizontal overflow</option>
              <option value="visible">Visible</option>
              <option value="hidden">Hidden</option>
              <option value="clip">Clip</option>
              <option value="scroll">Scroll</option>
              <option value="auto">Auto</option>
            </select>
          </label>
          <label class="field">
            <span class="field-head">Overflow Y</span>
            <select data-style-property="overflow-y" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose vertical overflow</option>
              <option value="visible">Visible</option>
              <option value="hidden">Hidden</option>
              <option value="clip">Clip</option>
              <option value="scroll">Scroll</option>
              <option value="auto">Auto</option>
            </select>
          </label>
        </section>
        <section class="tool-panel" role="tabpanel" data-panel="borders" hidden>
          <label class="field">
            <span class="field-head"><span>Border width · all sides</span><span class="value-readout"></span></span>
            <input type="range" min="0" max="20" step="1" data-style-property="border-width" data-unit="px" data-requires-selection disabled>
          </label>
          <label class="field">
            <span class="field-head">Border style</span>
            <select data-style-property="border-style" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose border style</option>
              <option value="none">None</option>
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
              <option value="double">Double</option>
            </select>
          </label>
          <label class="color-field">Border color
            <input type="color" value="#000000" data-style-property="border-color" data-requires-selection disabled>
          </label>
          <label class="field">
            <span class="field-head"><span>Corner radius</span><span class="value-readout"></span></span>
            <input type="range" min="0" max="50" step="1" data-style-property="border-radius" data-unit="px" data-requires-selection disabled>
          </label>
          <label class="field">
            <span class="field-head">Outline</span>
            <select data-style-property="outline" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose outline</option>
              <option value="none">None</option>
              <option value="1px solid currentColor">Thin solid</option>
              <option value="2px solid currentColor">Solid</option>
              <option value="2px dashed currentColor">Dashed</option>
              <option value="2px dotted currentColor">Dotted</option>
            </select>
          </label>
          <label class="field">
              <span class="field-head"><span>Outline offset</span><span class="value-readout"></span></span>
              <input type="range" min="-20" max="20" step="1" data-style-property="outline-offset" data-unit="px" data-requires-selection disabled>
          </label>
        </section>
        <section class="tool-panel" role="tabpanel" data-panel="effects" hidden>
          <label class="field">
            <span class="field-head"><span>Opacity</span><span class="value-readout"></span></span>
            <input type="range" min="0" max="1" step="0.05" data-style-property="opacity" data-unit="" data-requires-selection disabled>
          </label>
          <label class="field">
            <span class="field-head">Box shadow</span>
            <select data-style-property="box-shadow" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose a shadow</option>
              <option value="none">None</option>
              <option value="0 1px 3px rgba(0, 0, 0, 0.18)">Soft</option>
              <option value="0 4px 12px rgba(0, 0, 0, 0.18)">Medium</option>
              <option value="0 12px 28px rgba(0, 0, 0, 0.24)">Strong</option>
            </select>
          </label>
          <label class="field">
            <span class="field-head">Filter</span>
            <select data-style-property="filter" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose a filter</option>
              <option value="none">None</option>
              <option value="grayscale(1)">Grayscale</option>
              <option value="sepia(1)">Sepia</option>
              <option value="blur(2px)">Blur</option>
              <option value="contrast(1.2)">More contrast</option>
              <option value="brightness(1.1)">Brighter</option>
              <option value="saturate(1.5)">More saturation</option>
            </select>
          </label>
          <label class="field">
            <span class="field-head">Transform</span>
            <select data-style-property="transform" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose a transform</option>
              <option value="none">None</option>
              <option value="scale(0.95)">Scale down</option>
              <option value="scale(1.05)">Scale up</option>
              <option value="rotate(-3deg)">Rotate left</option>
              <option value="rotate(3deg)">Rotate right</option>
            </select>
          </label>
          <label class="field">
            <span class="field-head">Text shadow</span>
            <select data-style-property="text-shadow" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose text shadow</option>
              <option value="none">None</option>
              <option value="1px 1px 2px rgba(0, 0, 0, 0.3)">Subtle</option>
              <option value="0 2px 6px rgba(0, 0, 0, 0.35)">Soft</option>
              <option value="0 3px 10px rgba(0, 0, 0, 0.5)">Strong</option>
            </select>
          </label>
          <label class="field">
            <span class="field-head">Backdrop filter</span>
            <select data-style-property="backdrop-filter" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose backdrop filter</option>
              <option value="none">None</option>
              <option value="blur(4px)">Blur</option>
              <option value="blur(8px)">Strong blur</option>
              <option value="grayscale(1)">Grayscale</option>
              <option value="saturate(1.5)">Saturate</option>
            </select>
          </label>
          <label class="field">
            <span class="field-head">Transition</span>
            <select data-style-property="transition" data-empty-on-unmatched data-requires-selection disabled>
              <option value="" disabled selected>Choose transition</option>
              <option value="none">None</option>
              <option value="all 150ms ease">Quick</option>
              <option value="all 300ms ease">Smooth</option>
              <option value="opacity 200ms ease">Fade</option>
              <option value="transform 200ms ease">Transform</option>
              <option value="color 200ms ease, background-color 200ms ease">Color</option>
            </select>
          </label>
        </section>
        <section class="tool-panel" role="tabpanel" data-panel="mobile" hidden>
          <label class="mobile-preview-field" for="mobile-device">
            Device preset
            <select id="mobile-device">
              <option value="iphone-se">iPhone SE · 375 × 667</option>
              <option value="iphone-14">iPhone 14 · 390 × 844</option>
              <option value="iphone-15">iPhone 15 · 393 × 852</option>
              <option value="iphone-16-pro">iPhone 16 Pro · 402 × 874</option>
              <option value="pixel-7">Pixel 7 · 412 × 915</option>
              <option value="pixel-8">Pixel 8 · 412 × 915</option>
              <option value="galaxy-s23">Galaxy S23 · 360 × 780</option>
              <option value="galaxy-s24">Galaxy S24 · 360 × 780</option>
            </select>
          </label>
          <div class="mobile-preview-state" id="mobile-preview-state" aria-live="polite" data-active="false">Preview is off.</div>
          <button class="primary mobile-preview-toggle" id="mobile-preview-toggle" type="button">Start mobile preview</button>
        </section>
      </main>
      <footer class="footer">
        <button id="copy-css" type="button">Copy CSS</button>
        <button id="reset-selected" type="button" disabled>Reset selected</button>
      </footer>
      <div class="status" id="status" role="status" aria-live="polite">Select an element to begin.</div>
      </aside>
      <nav class="tool-rail" id="tool-rail" role="tablist" aria-label="Domino tools">
        <div class="rail-mark" id="drag-handle" role="button" tabindex="0" title="Click to toggle the active tools panel; drag to move Domino" aria-label="Toggle the active tools panel">
          <img id="domino-logo" alt="" aria-hidden="true" draggable="false">
        </div>
        <button class="tool-scroll-up" id="tool-scroll-up" type="button" aria-label="Scroll to previous tools" title="Scroll to previous tools" disabled>
          <svg viewBox="0 0 12 8" aria-hidden="true" focusable="false"><path d="m2 6 4-4 4 4"></path></svg>
        </button>
        <div class="tool-list" role="presentation">
        <button class="tool-icon" type="button" role="tab" data-tab="select" data-tooltip="Select" aria-label="Select and inspect" aria-controls="panel" aria-selected="false" aria-expanded="false">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 3 14 13-6 1-3 5L5 3Z"></path></svg>
        </button>
        <button class="tool-icon" type="button" role="tab" data-tab="layout" data-tooltip="Layout" aria-label="Layout" aria-controls="panel" aria-selected="false" aria-expanded="false">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4.5" width="10.5" height="15" rx="1.5"></rect><rect x="16" y="4.5" width="5" height="6.5" rx="1"></rect><rect x="16" y="13" width="5" height="6.5" rx="1"></rect></svg>
        </button>
        <button class="tool-icon" type="button" role="tab" data-tab="space" data-tooltip="Spacing" aria-label="Spacing and size" aria-controls="panel" aria-selected="false" aria-expanded="false">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="8" y="8" width="8" height="8" rx="1"></rect><path d="M3 12h4m10 0h4M5 10l-2 2 2 2m14-4 2 2-2 2M12 3v4m0 10v4m-2-16 2-2 2 2m-4 14 2 2 2-2"></path></svg>
        </button>
        <button class="tool-icon" type="button" role="tab" data-tab="text" data-tooltip="Typography" aria-label="Typography" aria-controls="panel" aria-selected="false" aria-expanded="false">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 6h16M12 6v13M8.5 19h7"></path></svg>
        </button>
        <button class="tool-icon" type="button" role="tab" data-tab="color" data-tooltip="Color" aria-label="Color" aria-controls="panel" aria-selected="false" aria-expanded="false">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3.2a8.8 8.8 0 1 0 0 17.6h1.1a2 2 0 0 0 1.3-3.5 1.4 1.4 0 0 1 1-2.4H18a3 3 0 0 0 3-3c0-4.8-4-8.7-9-8.7Z"></path><circle cx="8" cy="9" r="1"></circle><circle cx="12" cy="7" r="1"></circle><circle cx="16" cy="9" r="1"></circle><circle cx="7.5" cy="13" r="1"></circle></svg>
        </button>
        <button class="tool-icon" type="button" role="tab" data-tab="borders" data-tooltip="Borders" aria-label="Borders" aria-controls="panel" aria-selected="false" aria-expanded="false">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4" y="4" width="16" height="16" rx="4"></rect><path d="M8 8h8v8H8z"></path></svg>
        </button>
        <button class="tool-icon" type="button" role="tab" data-tab="effects" data-tooltip="Effects" aria-label="Effects" aria-controls="panel" aria-selected="false" aria-expanded="false">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 2 1.8 7.2L21 11l-7.2 1.8L12 20l-1.8-7.2L3 11l7.2-1.8L12 2Z"></path><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"></path></svg>
        </button>
        <button class="tool-icon" type="button" role="tab" data-tab="mobile" data-tooltip="Mobile preview" aria-label="Mobile preview" aria-controls="panel" aria-selected="false" aria-expanded="false">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="6" y="2.5" width="12" height="19" rx="2"></rect><path d="M10 5h4M11 18.5h2"></path></svg>
        </button>
        </div>
        <button class="tool-scroll-down" id="tool-scroll-down" type="button" aria-label="Scroll to more tools" title="Scroll to more tools" disabled>
          <svg viewBox="0 0 12 8" aria-hidden="true" focusable="false"><path d="m2 2 4 4 4-4"></path></svg>
        </button>
        <div class="rail-spacer"></div>
        <button class="tool-icon rail-close" id="close-button" type="button" data-tooltip="Close Domino" aria-label="Close Domino">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m7 7 10 10M17 7 7 17"></path></svg>
        </button>
      </nav>
    </div>
  `;

  const customStyleEditorTemplate = document.createElement("template");
  customStyleEditorTemplate.innerHTML = `
    <fieldset class="custom-style-editor">
      <legend>Custom CSS</legend>
      <div class="custom-style-fields">
        <label>Property
          <input class="custom-style-property" type="text" placeholder="--accent-color" autocapitalize="off" spellcheck="false" data-requires-selection disabled>
        </label>
        <label>Value
          <input class="custom-style-value" type="text" placeholder="e.g. 1rem" autocapitalize="off" spellcheck="false" data-requires-selection disabled>
        </label>
        <button class="custom-style-apply" type="button" data-requires-selection disabled>Apply</button>
      </div>
    </fieldset>
  `;
  shadow.querySelectorAll(".tool-panel").forEach((toolPanel) => {
    toolPanel.append(customStyleEditorTemplate.content.cloneNode(true));
  });

  shadow.querySelector("#domino-logo").src = chrome.runtime.getURL("logo.png");

  const workspace = shadow.querySelector("#workspace");
  const panel = shadow.querySelector("#panel");
  const panelToolName = shadow.querySelector("#panel-tool-name");
  const panelToolDescription = shadow.querySelector("#panel-tool-description");
  const toolRail = shadow.querySelector("#tool-rail");
  const toolList = shadow.querySelector(".tool-list");
  const toolScrollUpButton = shadow.querySelector("#tool-scroll-up");
  const toolScrollDownButton = shadow.querySelector("#tool-scroll-down");
  const mobilePreviewStage = shadow.querySelector("#mobile-preview-stage");
  const mobilePreviewFrame = shadow.querySelector("#mobile-preview-frame");
  const mobilePreviewScreen = shadow.querySelector("#mobile-preview-screen");
  const mobilePreviewIframe = shadow.querySelector("#mobile-preview-iframe");
  const mobilePreviewError = shadow.querySelector("#mobile-preview-error");
  const mobilePreviewDimensions = shadow.querySelector("#mobile-preview-dimensions");
  const mobilePreviewZoomValue = shadow.querySelector("#mobile-preview-zoom-value");
  const mobileDeviceSelect = shadow.querySelector("#mobile-device");
  const mobilePreviewDeviceSelect = shadow.querySelector("#mobile-preview-device");
  const mobilePreviewTool = shadow.querySelector('[data-tab="mobile"]');
  const mobilePreviewOrientation = shadow.querySelector("#mobile-preview-orientation");
  const selectedTag = shadow.querySelector("#selected-tag");
  const selectedId = shadow.querySelector("#selected-id");
  const selectedClasses = shadow.querySelector("#selected-classes");
  const selectedSelector = shadow.querySelector("#selected-selector");
  const domTree = shadow.querySelector("#dom-tree");
  const textContent = shadow.querySelector("#text-content");
  const status = shadow.querySelector("#status");
  const highlight = shadow.querySelector("#highlight");
  const selectedHighlight = shadow.querySelector("#selected-highlight");
  const toolOverlay = shadow.querySelector("#tool-overlay");
  const spaceOverlay = shadow.querySelector("#space-overlay");
  const spaceBorderArea = shadow.querySelector("#space-border-area");
  const spacePaddingArea = shadow.querySelector("#space-padding-area");
  const spaceContentArea = shadow.querySelector("#space-content-area");
  const alignmentHorizontal = shadow.querySelector("#alignment-horizontal");
  const alignmentVertical = shadow.querySelector("#alignment-vertical");
  const overlayCards = new Map(Array.from(shadow.querySelectorAll("[data-overlay]"), (card) => [card.dataset.overlay, card]));
  const placedOverlayCards = new WeakSet();
  const grid = shadow.querySelector("#guide-grid");
  const horizontalRuler = shadow.querySelector("#ruler-horizontal");
  const verticalRuler = shadow.querySelector("#ruler-vertical");
  const styleChanges = new Map();
  const textChanges = new Map();
  const originalStyleSources = new Map();
  const styleSourceHints = new Map();
  let styleSourceInspectionVersion = 0;
  let styleSheetSnapshot = null;
  let styleSheetSnapshotPromise = null;
  let styleSheetSnapshotErrorReported = false;
  shadow.querySelectorAll("#panel [data-style-property]").forEach((control) => {
    const container = control.closest(
      ".dimension-field, .box-model-side, .color-field, .overlay-color-row, .overlay-widget, .field"
    ) || control.parentElement;
    if (!container) {
      return;
    }

    const hint = document.createElement("span");
    hint.className = "style-source";
    hint.textContent = "Original source: —";
    hint.dataset.styleSourceFor = control.dataset.styleProperty;
    container.append(hint);

    const hints = styleSourceHints.get(control.dataset.styleProperty) || [];
    hints.push(hint);
    styleSourceHints.set(control.dataset.styleProperty, hints);
  });
  const selectionStates = new Set();
  const selectionStateAttributePrefix = `data-domino-preview-${Math.random().toString(36).slice(2)}-`;
  const domTreePageSize = 30;
  let selectionStateStyle = null;
  let selectionStateStyleDocument = null;
  let selectedElement = null;
  let domTreeDocument = null;
  let domTreeRoot = null;
  let domTreeExpanded = new Set();
  let domTreeCollapsed = new Set();
  let domTreeChildStart = new Map();
  let domTreeNodeElements = new WeakMap();
  let hoveredElement = null;
  let picking = false;
  let clickSuppressionTarget = null;
  let activeTool = null;
  let activeToolPanelOpen = false;
  let lastActiveTool = "select";
  let suppressLogoClick = false;
  let suppressLogoClickTimer = null;
  let linkedDimensions = false;
  let dimensionAspectRatio = null;
  let mobilePreviewActive = false;
  let mobilePreviewZoom = 1;
  let mobilePreviewOffsetX = 0;
  let mobilePreviewOffsetY = 0;
  let appliedMobileDevice = "iphone-se";
  let mobilePreviewWidth = mobileDevicePresets["iphone-se"].width;
  let mobilePreviewHeight = mobileDevicePresets["iphone-se"].height;
  let mobilePreviewLoadTimer = null;
  let mobilePreviewInteractionCleanup = null;
  let disposed = false;

  for (const option of mobileDeviceSelect.options) {
    const trayOption = option.cloneNode(true);
    trayOption.textContent = option.textContent.split(" · ")[0];
    trayOption.title = option.textContent;
    mobilePreviewDeviceSelect.append(trayOption);
  }

  function setStatus(message, state = "") {
    status.textContent = message;
    status.dataset.state = state;
  }

  function setOuterViewport(width, height) {
    outerViewport = { width, height };
    host.style.setProperty("--domino-outer-width", `${width}px`);
    host.style.setProperty("--domino-outer-height", `${height}px`);
  }

  function updateToolListScrollCue() {
    const maxScroll = toolList.scrollHeight - toolList.clientHeight;
    const canScrollUp = toolList.scrollTop > 1;
    const canScrollDown = maxScroll > 1 && toolList.scrollTop < maxScroll - 1;
    toolScrollUpButton.disabled = !canScrollUp;
    toolScrollDownButton.disabled = !canScrollDown;
  }

  function getMobilePreviewScale() {
    const fitScale = Math.max(0.01, Math.min(
      1,
      Math.max(1, outerViewport.width - 64) / mobilePreviewWidth,
      Math.max(1, outerViewport.height - 128) / mobilePreviewHeight
    ));
    return fitScale * mobilePreviewZoom;
  }

  function setMobilePreviewZoom(zoom) {
    mobilePreviewZoom = Math.max(0.5, Math.min(2, Math.round(zoom * 10) / 10));
    updateMobilePreviewControls();
  }

  function handleMobilePreviewWheel(event, zoomOnUnmodifiedScroll = false) {
    if (
      !mobilePreviewActive ||
      event.deltaY === 0 ||
      (event.target instanceof Element && event.target.closest(".mobile-preview-controls select")) ||
      (!(event.ctrlKey || event.metaKey) && !zoomOnUnmodifiedScroll)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setMobilePreviewZoom(mobilePreviewZoom + (event.deltaY < 0 ? 0.1 : -0.1));
  }

  function syncMobilePreviewElement(element, properties = [], includeText = false) {
    const previewDocument = mobilePreviewIframe.contentDocument;
    if (!previewDocument) {
      return;
    }

    const selector = getSelector(element);
    if (!selector) {
      return;
    }

    const previewElement = previewDocument.querySelector(selector);
    if (!previewElement) {
      return;
    }

    for (const property of properties) {
      const value = element.style.getPropertyValue(property);
      const priority = element.style.getPropertyPriority(property);
      if (value) {
        previewElement.style.setProperty(property, value, priority);
      } else {
        previewElement.style.removeProperty(property);
      }
    }

    if (includeText) {
      previewElement.textContent = element.textContent;
    }
  }

  function trackStyleChange(element, property) {
    let changes = styleChanges.get(element);
    if (!changes) {
      changes = new Map();
      styleChanges.set(element, changes);
    }

    if (changes.has(property)) {
      return;
    }

    const original = {
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property)
    };
    if (property === "margin" || property === "padding") {
      original.longhands = Object.fromEntries(
        ["top", "right", "bottom", "left"].map((side) => {
          const longhand = `${property}-${side}`;
          return [longhand, {
            value: element.style.getPropertyValue(longhand),
            priority: element.style.getPropertyPriority(longhand)
          }];
        })
      );
    }
    changes.set(property, original);
  }

  function syncMobilePreviewChanges() {
    for (const [element, properties] of Array.from(styleChanges)) {
      const counterpart = getPageCounterpart(element);
      if (counterpart) {
        for (const property of properties.keys()) {
          trackStyleChange(counterpart, property);
        }
      }
      syncMobilePreviewElement(element, Array.from(properties.keys()));
    }

    for (const element of Array.from(textChanges.keys())) {
      const counterpart = getPageCounterpart(element);
      if (counterpart && !textChanges.has(counterpart)) {
        textChanges.set(counterpart, counterpart.textContent);
      }
      syncMobilePreviewElement(element, [], true);
    }
  }

  function clearMobilePreviewLoadTimer() {
    if (mobilePreviewLoadTimer !== null) {
      clearTimeout(mobilePreviewLoadTimer);
      mobilePreviewLoadTimer = null;
    }
  }

  function detachMobilePreviewInteractionHandlers() {
    if (mobilePreviewInteractionCleanup) {
      mobilePreviewInteractionCleanup();
      mobilePreviewInteractionCleanup = null;
    }
  }

  function attachMobilePreviewInteractionHandlers(previewDocument) {
    detachMobilePreviewInteractionHandlers();
    const previewWindow = previewDocument.defaultView;
    if (!previewWindow) {
      return;
    }

    previewDocument.addEventListener("pointermove", onPageMove, true);
    previewDocument.addEventListener("pointerdown", onPagePick, true);
    previewDocument.addEventListener("scroll", updateViewportOverlays, {
      capture: true,
      passive: true
    });
    previewDocument.addEventListener("keydown", onPageKeydown, true);
    previewDocument.addEventListener("wheel", handleMobilePreviewWheel, {
      capture: true,
      passive: false
    });
    previewWindow.addEventListener("click", onPageClick, true);
    previewWindow.addEventListener("resize", updateViewportOverlays);
    mobilePreviewInteractionCleanup = () => {
      previewDocument.removeEventListener("pointermove", onPageMove, true);
      previewDocument.removeEventListener("pointerdown", onPagePick, true);
      previewDocument.removeEventListener("scroll", updateViewportOverlays, true);
      previewDocument.removeEventListener("keydown", onPageKeydown, true);
      previewDocument.removeEventListener("wheel", handleMobilePreviewWheel, true);
      previewWindow.removeEventListener("click", onPageClick, true);
      previewWindow.removeEventListener("resize", updateViewportOverlays);
    };
  }

  function handleMobilePreviewLoad() {
    if (!mobilePreviewActive) {
      detachMobilePreviewInteractionHandlers();
      return;
    }

    detachMobilePreviewInteractionHandlers();
    const previewDocument = mobilePreviewIframe.contentDocument;
    if (previewDocument?.URL === "about:blank") {
      return;
    }

    clearMobilePreviewLoadTimer();
    mobilePreviewError.hidden = true;
    if (previewDocument) {
      const scrollbarStyle = previewDocument.createElement("style");
      scrollbarStyle.dataset.dominoPreviewScrollbars = "";
      scrollbarStyle.textContent = `
        html, body { scrollbar-width: none !important; }
        html::-webkit-scrollbar, body::-webkit-scrollbar {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
        }
      `;
      (previewDocument.head || previewDocument.documentElement).append(scrollbarStyle);
      attachMobilePreviewInteractionHandlers(previewDocument);
    } else {
      setStatus("Domino cannot inspect elements in this cross-origin mobile preview.", "error");
    }
    syncMobilePreviewChanges();
  }

  function updateMobilePreviewControls() {
    const button = shadow.querySelector("#mobile-preview-toggle");
    const state = shadow.querySelector("#mobile-preview-state");
    button.textContent = mobilePreviewActive ? "Stop mobile preview" : "Start mobile preview";
    mobilePreviewTool.dataset.previewActive = String(mobilePreviewActive);
    mobilePreviewTool.setAttribute("aria-label", mobilePreviewActive ? "Stop mobile preview" : "Mobile preview");
    mobilePreviewTool.dataset.tooltip = mobilePreviewActive ? "Stop mobile preview" : "Mobile preview";
    state.dataset.active = String(mobilePreviewActive);
    state.textContent = mobilePreviewActive
      ? `Previewing ${mobileDeviceSelect.selectedOptions[0].textContent} · ${mobilePreviewWidth} × ${mobilePreviewHeight} px.`
      : "Preview is off.";
    mobilePreviewStage.hidden = !mobilePreviewActive;
    mobilePreviewDimensions.textContent = `${mobilePreviewWidth} × ${mobilePreviewHeight}`;
    mobilePreviewZoomValue.textContent = `${Math.round(mobilePreviewZoom * 100)}%`;
    const scale = getMobilePreviewScale();
    const previewWidth = mobilePreviewWidth * scale;
    const previewHeight = mobilePreviewHeight * scale;
    const visibleWidth = Math.min(64, previewWidth);
    const visibleHeight = Math.min(64, previewHeight);
    mobilePreviewOffsetX = Math.max(
      visibleWidth - outerViewport.width / 2 - previewWidth / 2,
      Math.min(outerViewport.width / 2 - visibleWidth + previewWidth / 2, mobilePreviewOffsetX)
    );
    mobilePreviewOffsetY = Math.max(
      visibleHeight - outerViewport.height / 2 - previewHeight / 2,
      Math.min(outerViewport.height / 2 - visibleHeight + previewHeight / 2, mobilePreviewOffsetY)
    );
    mobilePreviewFrame.style.width = `${previewWidth}px`;
    mobilePreviewFrame.style.height = `${previewHeight}px`;
    mobilePreviewFrame.style.marginLeft = `${-previewWidth / 2 + mobilePreviewOffsetX}px`;
    mobilePreviewFrame.style.marginTop = `${-previewHeight / 2 + mobilePreviewOffsetY}px`;
    mobilePreviewScreen.style.width = `${previewWidth}px`;
    mobilePreviewScreen.style.height = `${previewHeight}px`;
    mobilePreviewIframe.style.width = `${mobilePreviewWidth}px`;
    mobilePreviewIframe.style.height = `${mobilePreviewHeight}px`;
    mobilePreviewIframe.style.transform = `scale(${scale})`;
    const nextOrientation = mobilePreviewWidth < mobilePreviewHeight ? "landscape" : "portrait";
    mobilePreviewOrientation.textContent = nextOrientation === "landscape" ? "Landscape" : "Portrait";
    mobilePreviewOrientation.setAttribute("aria-label", `Switch to ${nextOrientation} orientation`);
  }

  function changeMobilePreview(enabled) {
    const requestedDevice = mobileDeviceSelect.value;

    if (enabled) {
      const preset = mobileDevicePresets[requestedDevice];
      if (!preset) {
        setStatus("Choose a supported mobile device.", "error");
        return;
      }

      const shouldLoadPage = !mobilePreviewActive;
      if (!mobilePreviewActive || requestedDevice !== appliedMobileDevice) {
        mobilePreviewWidth = preset.width;
        mobilePreviewHeight = preset.height;
      }
      appliedMobileDevice = requestedDevice;
      mobilePreviewActive = true;
      mobilePreviewError.hidden = true;
      if (shouldLoadPage) {
        mobilePreviewIframe.src = window.location.href;
        mobilePreviewLoadTimer = setTimeout(() => {
          if (mobilePreviewActive && mobilePreviewIframe.contentDocument?.URL === "about:blank") {
            mobilePreviewError.textContent = "This site blocked the embedded preview. The original page is still available behind it.";
            mobilePreviewError.hidden = false;
            setStatus("This site blocked the embedded mobile preview.", "error");
          }
        }, 5000);
      }
    } else {
      mobilePreviewActive = false;
      clearMobilePreviewLoadTimer();
      detachMobilePreviewInteractionHandlers();
      mobilePreviewIframe.src = "about:blank";
      mobilePreviewError.hidden = true;
    }

    updateMobilePreviewControls();
    keepWorkspaceInViewport();
    setStatus(mobilePreviewActive
      ? `Mobile preview active: ${mobilePreviewWidth} × ${mobilePreviewHeight} px.`
      : "Mobile preview stopped.", "success");
  }

  function initializeMobilePreview() {
    mobilePreviewIframe.addEventListener("load", handleMobilePreviewLoad, {
      signal: controller.signal
    });
    updateMobilePreviewControls();
    keepWorkspaceInViewport();
  }

  function beginMobilePreviewResize(event) {
    if (event.button !== 0 || !mobilePreviewActive) {
      return;
    }

    const handle = event.currentTarget;
    const direction = handle.dataset.resize;
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = mobilePreviewWidth;
    const startHeight = mobilePreviewHeight;
    const scale = getMobilePreviewScale();
    handle.setPointerCapture(event.pointerId);

    const movePreview = (moveEvent) => {
      const deltaX = (moveEvent.clientX - startX) / scale;
      const deltaY = (moveEvent.clientY - startY) / scale;
      const widthDelta = direction.includes("e") ? deltaX : direction.includes("w") ? -deltaX : 0;
      const heightDelta = direction.includes("s") ? deltaY : direction.includes("n") ? -deltaY : 0;
      mobilePreviewWidth = Math.round(Math.max(240, Math.min(1200, startWidth + widthDelta)));
      mobilePreviewHeight = Math.round(Math.max(320, Math.min(1600, startHeight + heightDelta)));
      updateMobilePreviewControls();
    };

    const stopResizing = () => {
      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
      handle.removeEventListener("pointermove", movePreview);
      handle.removeEventListener("pointerup", stopResizing);
      handle.removeEventListener("pointercancel", stopResizing);
      updateMobilePreviewControls();
    };

    handle.addEventListener("pointermove", movePreview);
    handle.addEventListener("pointerup", stopResizing, { once: true });
    handle.addEventListener("pointercancel", stopResizing, { once: true });
    event.preventDefault();
  }

  function switchMobilePreviewOrientation() {
    [mobilePreviewWidth, mobilePreviewHeight] = [mobilePreviewHeight, mobilePreviewWidth];
    updateMobilePreviewControls();
  }

  function beginMobilePreviewPan(event) {
    if (event.button !== 0 || !mobilePreviewActive) {
      return;
    }

    const target = event.target;
    const isControlElement = target instanceof Element && target.closest("button, select");
    const isControlBar = target instanceof Element && target.closest(".mobile-preview-controls");
    if (isControlElement || (target !== mobilePreviewStage && !isControlBar)) {
      return;
    }

    const startX = event.clientX;
    const startY = event.clientY;
    const startOffsetX = mobilePreviewOffsetX;
    const startOffsetY = mobilePreviewOffsetY;
    mobilePreviewStage.setPointerCapture(event.pointerId);
    mobilePreviewStage.dataset.panning = "true";
    event.preventDefault();
    event.stopPropagation();

    const movePreview = (moveEvent) => {
      mobilePreviewOffsetX = startOffsetX + moveEvent.clientX - startX;
      mobilePreviewOffsetY = startOffsetY + moveEvent.clientY - startY;
      updateMobilePreviewControls();
    };

    const stopPanning = () => {
      if (mobilePreviewStage.hasPointerCapture(event.pointerId)) {
        mobilePreviewStage.releasePointerCapture(event.pointerId);
      }
      mobilePreviewStage.removeAttribute("data-panning");
      mobilePreviewStage.removeEventListener("pointermove", movePreview);
      mobilePreviewStage.removeEventListener("pointerup", stopPanning);
      mobilePreviewStage.removeEventListener("pointercancel", stopPanning);
    };

    mobilePreviewStage.addEventListener("pointermove", movePreview);
    mobilePreviewStage.addEventListener("pointerup", stopPanning, { once: true });
    mobilePreviewStage.addEventListener("pointercancel", stopPanning, { once: true });
  }

  function keepWorkspaceInViewport() {
    const railRect = toolRail.getBoundingClientRect();
    const maxLeft = Math.max(8, outerViewport.width - railRect.width - 8);
    const railHeight = railRect.height;
    const maxTop = Math.max(8, outerViewport.height - railHeight - 8);
    const left = Math.max(8, Math.min(maxLeft, railRect.left));
    const top = Math.max(8, Math.min(maxTop, railRect.top));

    workspace.style.left = `${left}px`;
    workspace.style.top = `${top}px`;

    if (!panel.hidden) {
      positionPanelInViewport();
    }
  }

  function positionPanelInViewport() {
    const railRect = toolRail.getBoundingClientRect();
    const maxPanelWidth = Math.max(0, Math.min(360, outerViewport.width - 76));
    const rightSpace = outerViewport.width - railRect.right - 8;
    const leftSpace = railRect.left - 8;
    const side = rightSpace >= maxPanelWidth || rightSpace >= leftSpace ? "right" : "left";
    const availableSpace = side === "right" ? rightSpace : leftSpace;

    workspace.dataset.panelSide = side;
    panel.style.width = `${Math.max(0, Math.min(maxPanelWidth, availableSpace))}px`;

    const panelRect = panel.getBoundingClientRect();
    const maxPanelTop = Math.max(8, outerViewport.height - panelRect.height - 8);
    const panelTop = Math.max(8, Math.min(maxPanelTop, railRect.top));
    panel.style.top = `${panelTop - railRect.top}px`;
  }

  function updateActiveToolPanel() {
    const panelTool = activeTool || lastActiveTool;
    const toolCopy = toolPanelCopy[panelTool] || toolPanelCopy.select;
    const activeToolButton = activeTool && shadow.querySelector(`[data-tab="${activeTool}"]`);
    const activeToolColor = activeToolButton
      ? getComputedStyle(activeToolButton).getPropertyValue("--tool-active-color").trim()
      : "";
    host.style.setProperty("--active-tool-color", activeToolColor || "#315e98");
    panelToolName.textContent = toolCopy.name;
    panelToolDescription.textContent = toolCopy.description;
    panel.hidden = !activeToolPanelOpen;
    panel.setAttribute("aria-hidden", String(!activeToolPanelOpen));

    shadow.querySelectorAll("[data-tab]").forEach((tab) => {
      const isActive = tab.dataset.tab === activeTool;
      tab.setAttribute("aria-selected", String(isActive));
      tab.setAttribute("aria-expanded", String(activeToolPanelOpen && tab.dataset.tab === panelTool));
    });
    shadow.querySelectorAll("[data-panel]").forEach((section) => {
      section.hidden = section.dataset.panel !== panelTool;
    });
    keepWorkspaceInViewport();
    updateToolOverlays();
  }

  function setActiveTool(tool) {
    if (activeTool !== tool && tool) {
      resetOverlayCardPosition(tool);
    }

    if (tool) {
      lastActiveTool = tool;
    }

    activeTool = tool;
    if (!tool || tool === "mobile") {
      clearSelectedElement();
    }
    updateActiveToolPanel();
    setPicking(Boolean(tool && tool !== "mobile"));
  }

  function toggleActiveToolPanel() {
    activeToolPanelOpen = !activeToolPanelOpen;
    updateActiveToolPanel();
    if (activeToolPanelOpen && activeTool) {
      setPicking(activeTool !== "mobile");
    }
  }

  function isToolboxEvent(event) {
    return event.composedPath().includes(host);
  }

  function getPageElement(event) {
    if (isToolboxEvent(event)) {
      return null;
    }

    return event.composedPath().find((node) => node?.nodeType === 1) || null;
  }

  function getElementWindow(element) {
    return element.ownerDocument.defaultView || window;
  }

  function getElementComputedStyle(element) {
    return getElementWindow(element).getComputedStyle(element);
  }

  function getElementViewportRect(element) {
    const elementRect = element.getBoundingClientRect();
    const frameElement = getElementWindow(element).frameElement;
    if (!frameElement) {
      return {
        left: elementRect.left,
        top: elementRect.top,
        right: elementRect.right,
        bottom: elementRect.bottom,
        width: elementRect.width,
        height: elementRect.height,
        scaleX: 1,
        scaleY: 1
      };
    }

    const frameRect = frameElement.getBoundingClientRect();
    const scaleX = frameElement.offsetWidth > 0 ? frameRect.width / frameElement.offsetWidth : 1;
    const scaleY = frameElement.offsetHeight > 0 ? frameRect.height / frameElement.offsetHeight : 1;
    const left = frameRect.left + elementRect.left * scaleX;
    const top = frameRect.top + elementRect.top * scaleY;
    const width = elementRect.width * scaleX;
    const height = elementRect.height * scaleY;
    return {
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      scaleX,
      scaleY
    };
  }

  function getUniqueIdSelector(element) {
    if (!element.id) {
      return null;
    }

    const elementDocument = element.ownerDocument;
    const selector = `#${CSS.escape(element.id)}`;

    try {
      return elementDocument.querySelectorAll(selector).length === 1 ? selector : null;
    } catch (error) {
      console.error("Domino could not check an element ID selector.", error);
      return null;
    }
  }

  function getSelector(element) {
    if (!element || !element.isConnected) {
      return null;
    }

    const elementDocument = element.ownerDocument;
    const ownId = getUniqueIdSelector(element);
    if (ownId) {
      return ownId;
    }

    const segments = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      const idSelector = getUniqueIdSelector(current);
      if (idSelector) {
        segments.unshift(idSelector);
        break;
      }

      if (current === elementDocument.body || current === elementDocument.documentElement) {
        segments.unshift(current.localName);
        break;
      }

      const parent = current.parentElement;
      if (!parent) {
        return null;
      }

      const siblings = Array.from(parent.children).filter((sibling) => sibling.localName === current.localName);
      const position = siblings.indexOf(current) + 1;
      const segment = siblings.length > 1 ? `${current.localName}:nth-of-type(${position})` : current.localName;
      segments.unshift(segment);
      current = parent;
    }

    const selector = segments.join(" > ");

    try {
      const matches = elementDocument.querySelectorAll(selector);
      return matches.length === 1 && matches[0] === element ? selector : null;
    } catch (error) {
      console.error("Domino could not build a selector for an edited element.", error);
      return null;
    }
  }

  function getPageCounterpart(element) {
    const previewDocument = mobilePreviewIframe.contentDocument;
    if (!previewDocument) {
      return null;
    }

    const elementDocument = element.ownerDocument;
    const counterpartDocument = elementDocument === document
      ? previewDocument
      : elementDocument === previewDocument ? document : null;
    const selector = counterpartDocument ? getSelector(element) : null;
    return selector ? counterpartDocument.querySelector(selector) : null;
  }

  function getEditTargets(element) {
    const counterpart = getPageCounterpart(element);
    return counterpart && counterpart !== element ? [element, counterpart] : [element];
  }

  function updateHighlight(element, selected = false) {
    const overlay = selected ? selectedHighlight : highlight;
    if (!element || !element.isConnected) {
      overlay.hidden = true;
      updateToolOverlays();
      return;
    }

    if (selected) {
      highlight.hidden = true;
    }

    const rect = getElementViewportRect(element);
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${Math.max(0, rect.width)}px`;
    overlay.style.height = `${Math.max(0, rect.height)}px`;
    overlay.hidden = false;
    updateToolOverlays();
  }

  function toColorHex(value, fallback) {
    const components = value.match(/[\d.]+/g);
    if (!components || components.length < 3) {
      return fallback;
    }

    if (value.startsWith("rgba") && Number(components[3]) === 0) {
      return fallback;
    }

    return `#${components.slice(0, 3).map((component) => {
      const channel = Math.max(0, Math.min(255, Math.round(Number(component))));
      return channel.toString(16).padStart(2, "0");
    }).join("")}`;
  }

  function getPixelValue(computedStyle, property) {
    const value = Number.parseFloat(computedStyle.getPropertyValue(property));
    return Number.isFinite(value) ? value : 0;
  }

  function positionOverlayCard(card, rect, keepPosition) {
    if (keepPosition && placedOverlayCards.has(card)) {
      return;
    }
    if (!keepPosition) {
      placedOverlayCards.delete(card);
    }

    const cardRect = card.getBoundingClientRect();
    const margin = 8;
    const gap = 8;
    const maxLeft = Math.max(margin, window.innerWidth - cardRect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - cardRect.height - margin);
    const horizontalPositions = [
      rect.left,
      rect.right - cardRect.width,
      (rect.left + rect.right - cardRect.width) / 2
    ];
    const verticalPositions = [
      rect.top,
      rect.bottom - cardRect.height,
      (rect.top + rect.bottom - cardRect.height) / 2
    ];
    const candidates = [
      ...horizontalPositions.map((left) => ({ left, top: rect.top - cardRect.height - gap })),
      ...horizontalPositions.map((left) => ({ left, top: rect.bottom + gap })),
      ...verticalPositions.map((top) => ({ left: rect.right + gap, top })),
      ...verticalPositions.map((top) => ({ left: rect.left - cardRect.width - gap, top }))
    ];
    let bestPosition = null;
    let bestScore = Infinity;

    for (const candidate of candidates) {
      const left = Math.max(margin, Math.min(maxLeft, candidate.left));
      const top = Math.max(margin, Math.min(maxTop, candidate.top));
      const overlapWidth = Math.max(0, Math.min(left + cardRect.width, rect.right) - Math.max(left, rect.left));
      const overlapHeight = Math.max(0, Math.min(top + cardRect.height, rect.bottom) - Math.max(top, rect.top));
      const overlapArea = overlapWidth * overlapHeight;
      const clampDistance = Math.abs(left - candidate.left) + Math.abs(top - candidate.top);
      const score = overlapArea * 10000 + clampDistance;

      if (score < bestScore) {
        bestPosition = { left, top };
        bestScore = score;
      }
    }

    if (bestPosition) {
      card.style.left = `${bestPosition.left}px`;
      card.style.top = `${bestPosition.top}px`;
      if (keepPosition) {
        placedOverlayCards.add(card);
      }
    }
  }

  function resetOverlayCardPosition(tool) {
    const card = overlayCards.get(tool);
    if (card) {
      placedOverlayCards.delete(card);
    }
  }

  function updateSpaceOverlay(element, rect, computedStyle) {
    const marginTop = Math.max(0, getPixelValue(computedStyle, "margin-top")) * rect.scaleY;
    const marginRight = Math.max(0, getPixelValue(computedStyle, "margin-right")) * rect.scaleX;
    const marginBottom = Math.max(0, getPixelValue(computedStyle, "margin-bottom")) * rect.scaleY;
    const marginLeft = Math.max(0, getPixelValue(computedStyle, "margin-left")) * rect.scaleX;
    const borderTop = getPixelValue(computedStyle, "border-top-width") * rect.scaleY;
    const borderRight = getPixelValue(computedStyle, "border-right-width") * rect.scaleX;
    const borderBottom = getPixelValue(computedStyle, "border-bottom-width") * rect.scaleY;
    const borderLeft = getPixelValue(computedStyle, "border-left-width") * rect.scaleX;
    const paddingTop = getPixelValue(computedStyle, "padding-top") * rect.scaleY;
    const paddingRight = getPixelValue(computedStyle, "padding-right") * rect.scaleX;
    const paddingBottom = getPixelValue(computedStyle, "padding-bottom") * rect.scaleY;
    const paddingLeft = getPixelValue(computedStyle, "padding-left") * rect.scaleX;

    spaceOverlay.hidden = false;
    spaceOverlay.style.left = `${rect.left - marginLeft}px`;
    spaceOverlay.style.top = `${rect.top - marginTop}px`;
    spaceOverlay.style.width = `${Math.max(0, rect.width + marginLeft + marginRight)}px`;
    spaceOverlay.style.height = `${Math.max(0, rect.height + marginTop + marginBottom)}px`;
    spaceBorderArea.style.left = `${marginLeft}px`;
    spaceBorderArea.style.top = `${marginTop}px`;
    spaceBorderArea.style.width = `${rect.width}px`;
    spaceBorderArea.style.height = `${rect.height}px`;
    spacePaddingArea.style.left = `${borderLeft}px`;
    spacePaddingArea.style.top = `${borderTop}px`;
    spacePaddingArea.style.width = `${Math.max(0, rect.width - borderLeft - borderRight)}px`;
    spacePaddingArea.style.height = `${Math.max(0, rect.height - borderTop - borderBottom)}px`;
    spaceContentArea.style.left = `${paddingLeft}px`;
    spaceContentArea.style.top = `${paddingTop}px`;
    spaceContentArea.style.width = `${Math.max(0, rect.width - borderLeft - borderRight - paddingLeft - paddingRight)}px`;
    spaceContentArea.style.height = `${Math.max(0, rect.height - borderTop - borderBottom - paddingTop - paddingBottom)}px`;

  }

  function updateToolOverlays() {
    const overlayElement = selectedElement || (picking ? hoveredElement : null);
    const card = overlayCards.get(activeTool);

    if (!activeTool || !overlayElement || !overlayElement.isConnected || !card) {
      toolOverlay.hidden = true;
      spaceOverlay.hidden = true;
      alignmentHorizontal.hidden = true;
      alignmentVertical.hidden = true;
      return;
    }

    toolOverlay.hidden = false;
    overlayCards.forEach((overlayCard, tool) => {
      overlayCard.hidden = tool !== activeTool;
    });

    const elementRect = overlayElement.getBoundingClientRect();
    const rect = getElementViewportRect(overlayElement);
    const computedStyle = getElementComputedStyle(overlayElement);

    if (activeTool === "select") {
      shadow.querySelector("#overlay-element-tag").textContent = overlayElement.localName;
      shadow.querySelector("#overlay-element-id").textContent = overlayElement.id || "—";
      shadow.querySelector("#overlay-element-classes").textContent =
        Array.from(overlayElement.classList).join(" ") || "—";
      shadow.querySelector("#overlay-element-height").textContent = `${Math.round(elementRect.height)} px`;
      shadow.querySelector("#overlay-element-width").textContent = `${Math.round(elementRect.width)} px`;
      alignmentHorizontal.style.top = `${rect.top + rect.height / 2}px`;
      alignmentVertical.style.left = `${rect.left + rect.width / 2}px`;
      spaceOverlay.hidden = true;
      alignmentHorizontal.hidden = false;
      alignmentVertical.hidden = false;
    } else if (activeTool === "text") {
      spaceOverlay.hidden = true;
      alignmentHorizontal.hidden = true;
      alignmentVertical.hidden = true;
    } else if (activeTool === "color") {
      const textColor = computedStyle.getPropertyValue("color");
      const backgroundColor = computedStyle.getPropertyValue("background-color");
      const textSwatch = shadow.querySelector("#overlay-text-swatch");
      const backgroundSwatch = shadow.querySelector("#overlay-background-swatch");
      textSwatch.style.backgroundColor = textColor;
      backgroundSwatch.style.backgroundColor = backgroundColor;
      shadow.querySelector("#overlay-text-color").textContent = toColorHex(textColor, "#202938");
      shadow.querySelector("#overlay-background-color").textContent = toColorHex(backgroundColor, "transparent");
      spaceOverlay.hidden = true;
      alignmentHorizontal.hidden = true;
      alignmentVertical.hidden = true;
    } else if (activeTool === "space") {
      updateSpaceOverlay(overlayElement, rect, computedStyle);
      alignmentHorizontal.hidden = true;
      alignmentVertical.hidden = true;
    } else if (activeTool === "layout") {
      spaceOverlay.hidden = true;
      alignmentHorizontal.hidden = true;
      alignmentVertical.hidden = true;
    } else if (activeTool === "borders") {
      spaceOverlay.hidden = true;
      alignmentHorizontal.hidden = true;
      alignmentVertical.hidden = true;
    } else if (activeTool === "effects") {
      spaceOverlay.hidden = true;
      alignmentHorizontal.hidden = true;
      alignmentVertical.hidden = true;
    }

    positionOverlayCard(card, rect, Boolean(selectedElement));
  }

  function updateRangeReadout(input) {
    const control = input.closest("[data-dimension-control], .dimension-field, .box-model-side, .overlay-widget, .field");
    const readout = control && control.querySelector(".value-readout");
    if (readout) {
      const dimensionControl = input.closest("[data-dimension-control]");
      const unit = dimensionControl
        ? dimensionControl.querySelector("[data-size-unit]").value
        : input.dataset.unit || "";
      readout.textContent = input.dataset.rangeValueEmpty || `${input.value}${unit}`;
    }
  }

  function setRangeFromComputed(input, computedStyle) {
    const property = input.dataset.styleProperty;
    const computedValue = computedStyle.getPropertyValue(property).trim();
    let value = Number.parseFloat(computedValue);

    if (!Number.isFinite(value) && property === "line-height") {
      value = 1.4;
    } else if (!Number.isFinite(value)) {
      if (computedValue && input.dataset.rangeEmpty) {
        input.dataset.rangeValueEmpty = input.dataset.rangeEmpty;
      } else {
        delete input.dataset.rangeValueEmpty;
      }
      value = 0;
    } else {
      delete input.dataset.rangeValueEmpty;
    }

    const min = Number(input.min);
    const max = Number(input.max);
    input.value = String(Math.max(min, Math.min(max, value)));
    updateRangeReadout(input);
  }

  function updateBoxModelMasterControls(computedStyle) {
    const sides = ["top", "right", "bottom", "left"];
    shadow.querySelectorAll("[data-box-model-master]").forEach((input) => {
      const property = input.dataset.boxModelMaster;
      const values = sides.map((side) => Number.parseFloat(computedStyle.getPropertyValue(`${property}-${side}`)));
      const isUniform = values.every(Number.isFinite)
        && values.every((value) => Math.abs(value - values[0]) < 0.05);
      const validValues = values.filter(Number.isFinite);
      const average = validValues.length
        ? validValues.reduce((sum, value) => sum + value, 0) / validValues.length
        : 0;
      const min = Number(input.min);
      const max = Number(input.max);
      input.value = String(Math.round(Math.max(min, Math.min(max, average))));

      const displayedValue = isUniform
        ? `${Number(values[0].toFixed(1))}${input.dataset.unit || ""}`
        : "Mixed";
      input.closest(".box-model-master").querySelector(".value-readout").textContent = displayedValue;
      input.setAttribute("aria-valuetext", isUniform ? displayedValue : "Mixed values");
    });
  }

  function canEditText(element) {
    const HTMLElementConstructor = element.ownerDocument.defaultView?.HTMLElement;
    if (!HTMLElementConstructor || !(element instanceof HTMLElementConstructor) || element.childElementCount > 0) {
      return false;
    }

    return !["INPUT", "TEXTAREA", "SELECT", "IMG", "BR", "HR", "META", "LINK"].includes(element.tagName);
  }

  function collectSelectionStateRules(rules, documentStateNames, blockedStylesheets) {
    let cssText = "";

    for (const rule of rules) {
      if (typeof rule.selectorText === "string" && rule.style) {
        const selectorText = rule.selectorText.replace(/:(hover|focus|active|checked|disabled)\b/g, (pseudoClass) => {
          const stateName = pseudoClass.slice(1);
          return documentStateNames.has(stateName)
            ? `[${selectionStateAttributePrefix}${stateName}]`
            : pseudoClass;
        });
        if (selectorText !== rule.selectorText && rule.style.cssText) {
          cssText += `${selectorText}{${rule.style.cssText}}`;
        }
        continue;
      }

      if (!rule.cssRules) {
        continue;
      }

      try {
        const nestedCss = collectSelectionStateRules(rule.cssRules, documentStateNames, blockedStylesheets);
        if (nestedCss) {
          const blockStart = rule.cssText.indexOf("{");
          if (blockStart !== -1) {
            cssText += `${rule.cssText.slice(0, blockStart)}{${nestedCss}}`;
          }
        }
      } catch {
        blockedStylesheets.count += 1;
      }
    }

    return cssText;
  }

  function updateSelectionStatePreview() {
    if (!selectedElement) {
      return;
    }

    const previewDocument = selectedElement.ownerDocument;
    for (const stateName of ["hover", "focus", "active", "checked", "disabled"]) {
      const attribute = `${selectionStateAttributePrefix}${stateName}`;
      if (selectionStates.has(stateName)) {
        selectedElement.setAttribute(attribute, "");
      } else {
        selectedElement.removeAttribute(attribute);
      }
    }

    if (!selectionStates.size) {
      selectionStateStyle?.remove();
      selectionStateStyle = null;
      selectionStateStyleDocument = null;
      return;
    }

    if (selectionStateStyleDocument !== previewDocument) {
      selectionStateStyle?.remove();
      selectionStateStyle = previewDocument.createElement("style");
      selectionStateStyle.dataset.dominoSelectionStates = "";
      selectionStateStyleDocument = previewDocument;
      (previewDocument.head || previewDocument.documentElement).append(selectionStateStyle);
    }

    const blockedStylesheets = { count: 0 };
    let cssText = "";
    for (const stylesheet of previewDocument.styleSheets) {
      if (stylesheet.ownerNode === selectionStateStyle) {
        continue;
      }

      try {
        cssText += collectSelectionStateRules(stylesheet.cssRules, selectionStates, blockedStylesheets);
      } catch {
        blockedStylesheets.count += 1;
      }
    }
    selectionStateStyle.textContent = cssText;

    if (!selectionStateStyle.sheet) {
      setStatus("The page blocked state-preview styles. These states may not display correctly.", "error");
    } else if (blockedStylesheets.count) {
      setStatus("Some page stylesheets are inaccessible, so state previews may be incomplete.", "error");
    }
  }

  function clearSelectionStatePreview() {
    if (selectedElement) {
      for (const stateName of ["hover", "focus", "active", "checked", "disabled"]) {
        selectedElement.removeAttribute(`${selectionStateAttributePrefix}${stateName}`);
      }
    }
    selectionStates.clear();
    shadow.querySelectorAll("[data-selection-state]").forEach((input) => {
      input.checked = false;
    });
    selectionStateStyle?.remove();
    selectionStateStyle = null;
    selectionStateStyleDocument = null;
  }

  const inheritedStyleProperties = new Set([
    "color",
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "letter-spacing",
    "text-align",
    "text-transform",
    "visibility",
    "white-space",
    "word-spacing"
  ]);
  const stylePropertyShorthands = {
    "background-color": ["background"],
    "border-color": ["border", "border-color", "border-top", "border-right", "border-bottom", "border-left"],
    "border-radius": ["border-radius"],
    "border-style": ["border", "border-style", "border-top", "border-right", "border-bottom", "border-left"],
    "border-width": ["border", "border-width", "border-top", "border-right", "border-bottom", "border-left"],
    "column-gap": ["gap"],
    "flex-basis": ["flex"],
    "flex-direction": ["flex-flow"],
    "flex-grow": ["flex"],
    "flex-shrink": ["flex"],
    "flex-wrap": ["flex-flow"],
    "font-family": ["font"],
    "font-size": ["font"],
    "font-weight": ["font"],
    "line-height": ["font"],
    "margin-bottom": ["margin"],
    "margin-left": ["margin"],
    "margin-right": ["margin"],
    "margin-top": ["margin"],
    "padding-bottom": ["padding"],
    "padding-left": ["padding"],
    "padding-right": ["padding"],
    "padding-top": ["padding"],
    "row-gap": ["gap"],
    "overflow-x": ["overflow"],
    "overflow-y": ["overflow"]
  };

  function splitSelectorList(selectorText) {
    const selectors = [];
    let start = 0;
    let bracketDepth = 0;
    let parenthesisDepth = 0;
    let quote = "";
    let escaped = false;

    for (let index = 0; index < selectorText.length; index += 1) {
      const character = selectorText[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (quote) {
        if (character === quote) {
          quote = "";
        }
        continue;
      }
      if (character === "'" || character === "\"") {
        quote = character;
      } else if (character === "[") {
        bracketDepth += 1;
      } else if (character === "]") {
        bracketDepth -= 1;
      } else if (character === "(") {
        parenthesisDepth += 1;
      } else if (character === ")") {
        parenthesisDepth -= 1;
      } else if (character === "," && bracketDepth === 0 && parenthesisDepth === 0) {
        selectors.push(selectorText.slice(start, index).trim());
        start = index + 1;
      }
    }

    selectors.push(selectorText.slice(start).trim());
    return selectors.filter(Boolean);
  }

  function getSelectorSpecificity(selector) {
    const withoutStrings = selector.replace(/(["']).*?\1/g, " ");
    const attributes = withoutStrings.match(/\[[^\]]*\]/g) || [];
    const withoutAttributes = withoutStrings.replace(/\[[^\]]*\]/g, " ");
    const ids = (withoutAttributes.match(/#[\w-]+/g) || []).length;
    const classes = (withoutAttributes.match(/\.[\w-]+/g) || []).length;
    const pseudoElements = (withoutAttributes.match(/::[\w-]+/g) || []).length;
    const pseudoClasses = (withoutAttributes.match(/:(?!:)[\w-]+(?:\([^)]*\))?/g) || [])
      .filter((pseudoClass) => !pseudoClass.startsWith(":where(")).length;
    const typeSelectorText = withoutAttributes
      .replace(/#[\w-]+|\.[\w-]+|::?[\w-]+(?:\([^)]*\))?/g, " ")
      .replace(/[*|]/g, " ");
    const types = (typeSelectorText.match(/(?:^|[\s>+~])([a-zA-Z_][\w-]*)/g) || []).length;

    return [ids, classes + attributes.length + pseudoClasses, types + pseudoElements];
  }

  function compareStyleSources(candidate, current) {
    if (!current) {
      return true;
    }
    if (candidate.important !== current.important) {
      return candidate.important;
    }
    if (candidate.inline !== current.inline) {
      return candidate.inline;
    }
    for (let index = 0; index < candidate.specificity.length; index += 1) {
      if (candidate.specificity[index] !== current.specificity[index]) {
        return candidate.specificity[index] > current.specificity[index];
      }
    }
    return candidate.order > current.order;
  }

  function getDeclaredStyleValue(style, property) {
    const validProperties = new Set([
      property,
      ...(stylePropertyShorthands[property] || []),
      "all"
    ]);
    let winner = null;

    for (let index = 0; index < style.length; index += 1) {
      const declaration = style.item(index).toLowerCase();
      if (!validProperties.has(declaration)) {
        continue;
      }

      const value = style.getPropertyValue(declaration);
      if (!value) {
        continue;
      }
      const candidate = {
        value,
        important: style.getPropertyPriority(declaration) === "important",
        order: index
      };
      if (!winner
        || candidate.important && !winner.important
        || candidate.important === winner.important && candidate.order > winner.order) {
        winner = candidate;
      }
    }

    return winner;
  }

  function yieldToBrowser() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  async function collectStyleSourceRules(element, resolution, snapshot = null) {
    const previewDocument = element.ownerDocument;
    const previewWindow = previewDocument.defaultView;
    const styleRules = [];
    let order = 0;
    let processedRules = 0;
    const roots = new Set([previewDocument]);
    let root = element.getRootNode();
    while (root && root !== previewDocument) {
      roots.add(root);
      root = root.host?.getRootNode();
    }

    async function collectRules(rules) {
      for (const rule of rules) {
        processedRules += 1;
        if (processedRules % 200 === 0) {
          await yieldToBrowser();
        }

        const ruleText = rule.cssText || "";
        const header = ruleText.slice(0, ruleText.indexOf("{")).trim().toLowerCase();

        if (typeof rule.selectorText === "string" && rule.style) {
          styleRules.push({ selectorText: rule.selectorText, style: rule.style, order });
          order += 1;
          continue;
        }

        if (header.startsWith("@media") && !previewWindow.matchMedia(rule.conditionText).matches) {
          continue;
        }
        if (header.startsWith("@supports")
          && previewWindow.CSS?.supports
          && !previewWindow.CSS.supports(rule.conditionText)) {
          continue;
        }
        if (header.startsWith("@container")) {
          resolution.incomplete = true;
          continue;
        }
        if (header.startsWith("@layer")) {
          resolution.incomplete = true;
        }

        if (rule.cssRules) {
          try {
            await collectRules(rule.cssRules);
          } catch {
            resolution.incomplete = true;
          }
        } else if (rule.styleSheet) {
          try {
            await collectRules(rule.styleSheet.cssRules);
          } catch {
            resolution.incomplete = true;
          }
        }
      }
    }

    if (snapshot?.stylesheets.length) {
      for (const stylesheet of snapshot.stylesheets) {
        try {
          await collectRules(stylesheet.cssRules);
        } catch {
          resolution.incomplete = true;
        }
      }
    } else {
      const stylesheets = new Set();
      for (const styleRoot of roots) {
        for (const stylesheet of styleRoot.styleSheets || []) {
          stylesheets.add(stylesheet);
        }
        for (const stylesheet of styleRoot.adoptedStyleSheets || []) {
          stylesheets.add(stylesheet);
        }
      }

      for (const stylesheet of stylesheets) {
        try {
          if (stylesheet.disabled) {
            continue;
          }
          const mediaText = stylesheet.media?.mediaText;
          if (mediaText && mediaText !== "all" && !previewWindow.matchMedia(mediaText).matches) {
            continue;
          }
          await collectRules(stylesheet.cssRules);
        } catch {
          resolution.incomplete = true;
          if (stylesheet.href) {
            resolution.blockedStylesheets.add(stylesheet.href);
          }
        }
      }
    }

    return styleRules;
  }

  async function parseStyleSheetSnapshot(response) {
    const snapshot = {
      stylesheets: [],
      incomplete: Boolean(response.incomplete || response.failures?.length)
    };
    const importRule = /@import\s+(?:url\([^)]*\)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')[^;]*;/gi;

    for (const source of response.styleSheets) {
      if (typeof source?.text !== "string") {
        snapshot.incomplete = true;
        continue;
      }

      try {
        const stylesheet = new CSSStyleSheet();
        await stylesheet.replace(source.text.replace(importRule, ""));
        snapshot.stylesheets.push(stylesheet);
      } catch (error) {
        snapshot.incomplete = true;
        console.error("Domino could not parse a cached page stylesheet.", source.sourceURL, error);
      }
    }

    return snapshot;
  }

  function getStyleInheritanceParent(element) {
    if (element.parentElement) {
      return element.parentElement;
    }

    return element.getRootNode().host || null;
  }

  async function findMatchingStyleSource(element, property, rules, resolution) {
    let winner = null;
    const inlineDeclaration = getDeclaredStyleValue(element.style, property);
    if (inlineDeclaration) {
      winner = {
        selector: "inline style",
        important: inlineDeclaration.important,
        inline: true,
        specificity: [0, 0, 0],
        order: inlineDeclaration.order
      };
    }

    for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex += 1) {
      if (ruleIndex > 0 && ruleIndex % 200 === 0) {
        await yieldToBrowser();
      }

      const rule = rules[ruleIndex];
      const declaration = getDeclaredStyleValue(rule.style, property);
      if (!declaration) {
        continue;
      }

      let matchingSelector = null;
      let matchingSpecificity = null;
      for (const selector of splitSelectorList(rule.selectorText)) {
        if (/:(?:is|not|has|where|nth-child|nth-last-child)\(/.test(selector)) {
          resolution.incomplete = true;
        }
        try {
          if (!element.matches(selector)) {
            continue;
          }
        } catch {
          resolution.incomplete = true;
          continue;
        }

        const specificity = getSelectorSpecificity(selector);
        if (!matchingSpecificity
          || specificity.some((value, index) => value > matchingSpecificity[index]
            && specificity.slice(0, index).every((part, partIndex) => part === matchingSpecificity[partIndex]))) {
          matchingSelector = selector;
          matchingSpecificity = specificity;
        }
      }
      if (!matchingSelector) {
        continue;
      }

      const candidate = {
        selector: matchingSelector,
        important: declaration.important,
        inline: false,
        specificity: matchingSpecificity,
        order: rule.order
      };
      if (compareStyleSources(candidate, winner)) {
        winner = candidate;
      }
    }

    return winner;
  }

  async function captureOriginalStyleSources(element, snapshot = null) {
    const resolution = {
      incomplete: Boolean(snapshot?.incomplete),
      blockedStylesheets: new Set()
    };
    const rules = await collectStyleSourceRules(element, resolution, snapshot);
    const sources = new Map();
    const properties = new Set(Array.from(shadow.querySelectorAll("[data-style-property]"), (control) =>
      control.dataset.styleProperty));

    for (const property of properties) {
      let source = await findMatchingStyleSource(element, property, rules, resolution);
      let inheritedFrom = null;
      if (!source && inheritedStyleProperties.has(property)) {
        for (let ancestor = getStyleInheritanceParent(element); ancestor; ancestor = getStyleInheritanceParent(ancestor)) {
          source = await findMatchingStyleSource(ancestor, property, rules, resolution);
          if (source) {
            inheritedFrom = ancestor;
            break;
          }
        }
      }

      let label;
      if (source) {
        const prefix = inheritedFrom ? "Inherited from " : "";
        label = `${prefix}${source.selector}${resolution.incomplete ? " (partial)" : ""}`;
      } else {
        const blockedHosts = Array.from(resolution.blockedStylesheets, (href) => {
          try {
            return new URL(href).host;
          } catch {
            return href;
          }
        });
        label = blockedHosts.length
          ? `CSS blocked: ${blockedHosts.slice(0, 2).join(", ")}${blockedHosts.length > 2 ? ", …" : ""}`
          : resolution.incomplete
            ? "Source unresolved"
            : "Browser default";
      }
      sources.set(property, label);
    }

    return sources;
  }

  function updateStyleSourceHints() {
    styleSourceHints.forEach((hints, property) => {
      const source = originalStyleSources.get(property) || "—";
      hints.forEach((hint) => {
        hint.textContent = `Original source: ${source}`;
        hint.title = source.startsWith("CSS blocked:")
          ? "The browser blocked access to these stylesheet rules, so their selectors cannot be read."
          : "Original CSS source captured when this element was selected.";
      });
    });
  }

  function loadStyleSheetSnapshot() {
    if (!styleSheetSnapshotPromise) {
      styleSheetSnapshotPromise = chrome.runtime.sendMessage({
        type: "domino:load-style-sheets"
      }).then(async (response) => {
        if (!response?.ok || !Array.isArray(response.styleSheets)) {
          throw new Error(response?.error || "Chrome did not return page stylesheets.");
        }

        styleSheetSnapshot = await parseStyleSheetSnapshot(response);
        return styleSheetSnapshot;
      });
    }

    return styleSheetSnapshotPromise;
  }

  function requestStyleSourceSnapshot(element) {
    const requestId = ++styleSourceInspectionVersion;
    void loadStyleSheetSnapshot().then(async (snapshot) => {
      if (requestId !== styleSourceInspectionVersion || selectedElement !== element) {
        return;
      }

      const sources = await captureOriginalStyleSources(element, snapshot);
      if (requestId !== styleSourceInspectionVersion || selectedElement !== element) {
        return;
      }

      originalStyleSources.clear();
      sources.forEach((source, property) => originalStyleSources.set(property, source));
      updateStyleSourceHints();
    }).catch((error) => {
      if (requestId !== styleSourceInspectionVersion || selectedElement !== element) {
        return;
      }

      if (!styleSheetSnapshotErrorReported) {
        styleSheetSnapshotErrorReported = true;
        console.error("Domino could not load page stylesheets for CSS source lookup.", error);
        const message = error instanceof Error ? error.message : String(error);
        setStatus(`Could not load CSS sources: ${message}`, "error");
      }
    });
  }

  function getDomTreeParent(element) {
    return element.parentElement || element.getRootNode().host || null;
  }

  function getDomTreeChildCollections(element) {
    const collections = [];
    if (element.shadowRoot) {
      collections.push(element.shadowRoot.children);
    }
    collections.push(element.children);
    return collections;
  }

  function getDomTreeChildCount(element) {
    return getDomTreeChildCollections(element)
      .reduce((count, children) => count + children.length, 0);
  }

  function getDomTreeChildren(element, start, end) {
    const result = [];
    let offset = 0;
    for (const children of getDomTreeChildCollections(element)) {
      const localStart = Math.max(0, start - offset);
      const localEnd = Math.min(children.length, end - offset);
      for (let index = localStart; index < localEnd; index += 1) {
        result.push(children[index]);
      }
      offset += children.length;
      if (offset >= end) {
        break;
      }
    }
    return result;
  }

  function getDomTreeChildIndex(parent, child) {
    let offset = 0;
    for (const children of getDomTreeChildCollections(parent)) {
      for (let index = 0; index < children.length; index += 1) {
        if (children[index] === child) {
          return offset + index;
        }
      }
      offset += children.length;
    }
    return -1;
  }

  function getDomTreeLabel(element) {
    const classes = Array.from(element.classList);
    const parts = [element.localName];
    if (element.id) {
      parts.push(`#${element.id}`);
    }
    parts.push(...classes.slice(0, 2).map((className) => `.${className}`));
    if (classes.length > 2) {
      parts.push("...");
    }
    return parts.join("");
  }

  function createDomTreePageButton(element, direction) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dom-tree-page-button";
    button.dataset.direction = direction;
    button.tabIndex = -1;
    button.textContent = direction === "previous" ? "Previous 30" : "Next 30";
    button.setAttribute(
      "aria-label",
      `${direction === "previous" ? "Previous" : "Next"} group of child elements for ${getDomTreeLabel(element)}`
    );
    return button;
  }

  function renderDomTreeNode(element, depth) {
    const item = document.createElement("div");
    const label = getDomTreeLabel(element);
    const childCount = getDomTreeChildCount(element);
    const expanded = domTreeExpanded.has(element);
    item.className = "dom-tree-node";
    item.setAttribute("role", "treeitem");
    item.setAttribute("aria-level", String(depth));
    item.setAttribute("aria-selected", String(element === selectedElement));
    item.setAttribute("aria-label", label);
    item.title = label;
    item.tabIndex = element === selectedElement || (!selectedElement && element === domTreeDocument.documentElement)
      ? 0
      : -1;
    if (childCount > 0) {
      item.setAttribute("aria-expanded", String(expanded));
    }
    domTreeNodeElements.set(item, element);

    const row = document.createElement("div");
    row.className = "dom-tree-row";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "dom-tree-toggle";
    toggle.tabIndex = -1;
    toggle.disabled = childCount === 0;
    toggle.textContent = childCount === 0 ? "" : expanded ? "▾" : "▸";
    toggle.setAttribute("aria-label", `${expanded ? "Collapse" : "Expand"} ${label}`);
    const text = document.createElement("span");
    text.className = "dom-tree-label";
    const tag = document.createElement("span");
    tag.className = "dom-tree-tag";
    if (element.localName === "html" || element.localName === "body") {
      tag.classList.add("dom-tree-tag-document");
    }
    tag.textContent = element.localName;
    text.append(tag);
    if (element.id) {
      const id = document.createElement("span");
      id.className = "dom-tree-id";
      id.textContent = `#${element.id}`;
      text.append(id);
    }
    const classes = Array.from(element.classList);
    classes.slice(0, 2).forEach((className) => {
      const classLabel = document.createElement("span");
      classLabel.className = "dom-tree-class";
      classLabel.textContent = `.${className}`;
      text.append(classLabel);
    });
    if (classes.length > 2) {
      const more = document.createElement("span");
      more.className = "dom-tree-class-more";
      more.textContent = "...";
      text.append(more);
    }
    row.append(toggle, text);
    item.append(row);

    if (expanded && childCount > 0) {
      const maxStart = Math.max(0, childCount - 1);
      const start = Math.min(domTreeChildStart.get(element) || 0, maxStart);
      const end = Math.min(start + domTreePageSize, childCount);
      const group = document.createElement("div");
      group.className = "dom-tree-group";
      group.setAttribute("role", "group");
      getDomTreeChildren(element, start, end).forEach((child) => {
        group.append(renderDomTreeNode(child, depth + 1));
      });

      if (start > 0 || end < childCount) {
        const pagination = document.createElement("div");
        pagination.className = "dom-tree-pagination";
        if (start > 0) {
          pagination.append(createDomTreePageButton(element, "previous"));
        }
        if (end < childCount) {
          pagination.append(createDomTreePageButton(element, "next"));
        }
        group.append(pagination);
      }
      item.append(group);
    }
    return item;
  }

  function refreshDomTree() {
    const treeDocument = selectedElement?.ownerDocument || document;
    const root = treeDocument.documentElement;
    if (domTreeDocument !== treeDocument || domTreeRoot !== root) {
      domTreeDocument = treeDocument;
      domTreeRoot = root;
      domTreeExpanded = new Set(root ? [root] : []);
      domTreeCollapsed = new Set();
      domTreeChildStart = new Map();
    }

    domTree.replaceChildren();
    domTreeNodeElements = new WeakMap();
    if (!root) {
      const empty = document.createElement("div");
      empty.className = "dom-tree-empty";
      empty.textContent = "No document elements available.";
      domTree.append(empty);
      return;
    }

    if (selectedElement?.ownerDocument === treeDocument && selectedElement.isConnected) {
      let child = selectedElement;
      for (let parent = getDomTreeParent(child); parent; child = parent, parent = getDomTreeParent(parent)) {
        if (!domTreeCollapsed.has(parent)) {
          domTreeExpanded.add(parent);
        }
        const childIndex = getDomTreeChildIndex(parent, child);
        const start = domTreeChildStart.get(parent) || 0;
        if (childIndex >= 0 && (childIndex < start || childIndex >= start + domTreePageSize)) {
          domTreeChildStart.set(parent, Math.floor(childIndex / domTreePageSize) * domTreePageSize);
        }
        if (parent === root) {
          break;
        }
      }
    }
    domTree.append(renderDomTreeNode(root, 1));
  }

  function focusDomTreeItem(element) {
    const items = domTree.querySelectorAll('[role="treeitem"]');
    for (const item of items) {
      if (domTreeNodeElements.get(item) === element) {
        item.focus();
        return;
      }
    }
  }

  function refreshDomTreeAfterToggle(element, expanded) {
    if (expanded) {
      domTreeCollapsed.delete(element);
      domTreeExpanded.add(element);
    } else {
      domTreeExpanded.delete(element);
      domTreeCollapsed.add(element);
    }
    refreshDomTree();
    focusDomTreeItem(element);
  }

  function refreshSelectionControls() {
    const hasSelection = Boolean(selectedElement);
    updateStyleSourceHints();
    shadow.querySelectorAll("[data-requires-selection]").forEach((control) => {
      control.disabled = !hasSelection;
    });
    shadow.querySelector("#reset-selected").disabled = !hasSelection;
    refreshDomTree();

    if (!selectedElement) {
      updateFlexOnlyControls("");
      selectedTag.textContent = "—";
      selectedId.textContent = "—";
      selectedClasses.textContent = "—";
      selectedSelector.textContent = "Click an element to inspect it.";
      textContent.value = "";
      return;
    }

    selectedTag.textContent = selectedElement.localName;
    selectedId.textContent = selectedElement.id || "—";
    selectedClasses.textContent = selectedElement.classList.length
      ? Array.from(selectedElement.classList).join(" ")
      : "—";
    selectedSelector.textContent = getSelector(selectedElement) || "No unique document selector available.";
    const canEdit = canEditText(selectedElement);
    textContent.disabled = !canEdit;
    textContent.value = canEdit ? selectedElement.textContent : "";

    const computedStyle = getElementComputedStyle(selectedElement);
    updateFlexOnlyControls(computedStyle.getPropertyValue("display"));
    updateBoxModelMasterControls(computedStyle);
    shadow.querySelectorAll('input[type="range"][data-style-property]:not([data-size-value])').forEach((input) => {
      setRangeFromComputed(input, computedStyle);
    });

    shadow.querySelectorAll('[data-size-value="width"], [data-size-value="height"]').forEach((input) => {
      setDimensionControlFromComputed(input, selectedElement);
    });

    shadow.querySelectorAll("select[data-style-property][data-empty-on-unmatched]").forEach((select) => {
      const property = select.dataset.styleProperty;
      const value = selectedElement.style.getPropertyValue(property) || computedStyle.getPropertyValue(property);
      select.value = Array.from(select.options).some((option) => option.value === value) ? value : "";
    });

    shadow.querySelectorAll('input[type="color"][data-style-property]').forEach((input) => {
      const property = input.dataset.styleProperty;
      const fallback = property === "color"
        ? "#202938"
        : property === "border-color"
          ? "#000000"
          : "#ffffff";
      input.value = toColorHex(computedStyle.getPropertyValue(property), fallback);
    });

    const fontFamily = shadow.querySelector("#font-family");
    const overlayFontFamily = shadow.querySelector("#overlay-font-family");
    const fontWeight = shadow.querySelector("#font-weight");
    const overlayFontWeight = shadow.querySelector("#overlay-font-weight");
    const computedFamily = computedStyle.getPropertyValue("font-family");
    const computedWeight = computedStyle.getPropertyValue("font-weight");
    fontFamily.value = Array.from(fontFamily.options).some((option) => option.value === computedFamily)
      ? computedFamily
      : "system-ui, sans-serif";
    overlayFontFamily.value = Array.from(overlayFontFamily.options).some((option) => option.value === computedFamily)
      ? computedFamily
      : "system-ui, sans-serif";
    fontWeight.value = Array.from(fontWeight.options).some((option) => option.value === computedWeight)
      ? computedWeight
      : "400";
    overlayFontWeight.value = Array.from(overlayFontWeight.options).some((option) => option.value === computedWeight)
      ? computedWeight
      : "400";
  }

  function setSelectedElement(element) {
    clearSelectionStatePreview();
    clearCustomStyleInputs();
    if (selectedElement !== element) {
      resetOverlayCardPosition(activeTool);
      domTreeCollapsed.clear();
    }
    selectedElement = element;
    hoveredElement = null;
    originalStyleSources.clear();
    requestStyleSourceSnapshot(element);
    if (linkedDimensions) {
      dimensionAspectRatio = getElementAspectRatio(element);
    }
    refreshSelectionControls();
    updateHighlight(selectedElement, true);
    setStatus(picking
      ? "Element selected. Click another element or choose a tool."
      : "Element selected. Choose a tool to make live changes.");
  }

  function clearSelectedElement() {
    clearSelectionStatePreview();
    clearCustomStyleInputs();
    styleSourceInspectionVersion += 1;
    originalStyleSources.clear();
    selectedElement = null;
    hoveredElement = null;
    clickSuppressionTarget = null;
    dimensionAspectRatio = null;
    refreshSelectionControls();
    updateHighlight(null, true);
  }

  function setPicking(enabled) {
    picking = enabled;
    if (!enabled) {
      hoveredElement = null;
    }

    if (enabled) {
      setStatus("Click an element on the page. Press Escape to cancel.");
    } else if (selectedElement) {
      updateHighlight(selectedElement, true);
      setStatus("Element selected. Choose a tool to make live changes.");
    } else {
      updateHighlight(null);
      setStatus("Choose Select to pick an element.");
    }
    updateToolOverlays();
  }

  function syncStyleControls(element, property, computedStyle = null, updateBoxModelMasters = true) {
    if (element !== selectedElement) {
      return;
    }

    const currentComputedStyle = computedStyle || getElementComputedStyle(element);
    shadow.querySelectorAll("[data-style-property]").forEach((control) => {
      if (control.dataset.styleProperty !== property) {
        return;
      }

      if (control.type === "range") {
        if (control.dataset.sizeValue) {
          setDimensionControlFromComputed(control, element);
        } else {
          setRangeFromComputed(control, currentComputedStyle);
        }
      } else if (control.type === "color") {
        const fallback = property === "color"
          ? "#202938"
          : property === "border-color"
            ? "#000000"
            : "#ffffff";
        control.value = toColorHex(currentComputedStyle.getPropertyValue(property), fallback);
      } else if (control.tagName === "SELECT") {
        const value = element.style.getPropertyValue(property) || currentComputedStyle.getPropertyValue(property);
        if (Array.from(control.options).some((option) => option.value === value)) {
          control.value = value;
        }
      }
    });
    if (property === "display") {
      updateFlexOnlyControls(currentComputedStyle.getPropertyValue("display"));
    }
    if (
      updateBoxModelMasters
      && /^(?:margin|padding)(?:-(?:top|right|bottom|left))?$/.test(property)
    ) {
      updateBoxModelMasterControls(currentComputedStyle);
    }
  }

  function updateFlexOnlyControls(display) {
    const isFlex = display === "flex" || display === "inline-flex";
    shadow.querySelectorAll("[data-flex-only]").forEach((control) => {
      control.hidden = !isFlex || !control.hasAttribute("data-flex-primary");
    });
  }

  function setPageStyles(element, styles) {
    const properties = Object.keys(styles);
    const controlProperties = new Set(properties);
    for (const property of properties) {
      const boxModelProperty = property.startsWith("margin")
        ? "margin"
        : property.startsWith("padding") ? "padding" : null;
      if (boxModelProperty) {
        for (const side of ["top", "right", "bottom", "left"]) {
          controlProperties.add(`${boxModelProperty}-${side}`);
        }
      }
    }

    for (const target of getEditTargets(element)) {
      for (const property of properties) {
        trackStyleChange(target, property);
        target.style.setProperty(property, styles[property]);
      }
    }

    const computedStyle = element === selectedElement ? getElementComputedStyle(element) : null;
    for (const property of controlProperties) {
      syncStyleControls(element, property, computedStyle, false);
    }
    if (computedStyle && properties.some((property) => property.startsWith("margin") || property.startsWith("padding"))) {
      updateBoxModelMasterControls(computedStyle);
    }
    updateHighlight(element, true);
    syncMobilePreviewElement(element, properties);
  }

  function setPageStyle(element, property, value) {
    setPageStyles(element, { [property]: value });
  }

  function applyCustomStyle(editor) {
    if (!selectedElement) {
      return;
    }

    const propertyInput = editor.querySelector(".custom-style-property");
    const valueInput = editor.querySelector(".custom-style-value");
    const property = propertyInput.value.trim();
    const value = valueInput.value.trim();
    if (!/^(?:--[A-Za-z_][A-Za-z0-9_-]*|-?[A-Za-z][A-Za-z0-9_-]*)$/.test(property) || !value) {
      setStatus("Enter a valid CSS property and a non-empty value.", "error");
      propertyInput.focus();
      return;
    }

    const validationStyle = selectedElement.ownerDocument.createElement("div").style;
    validationStyle.setProperty(property, value);
    if (!validationStyle.getPropertyValue(property)) {
      setStatus(`Invalid value for ${property}.`, "error");
      valueInput.focus();
      return;
    }

    setPageStyle(selectedElement, property, value);
    setStatus(`Applied ${property}.`, "success");
  }

  function clearCustomStyleInputs() {
    shadow.querySelectorAll(".custom-style-property, .custom-style-value").forEach((input) => {
      input.value = "";
    });
  }

  function getDimensionReference(element, property) {
    const elementWindow = getElementWindow(element);
    const position = getElementComputedStyle(element).position;
    if (position === "fixed" && !element.offsetParent) {
      return property === "width" ? elementWindow.innerWidth : elementWindow.innerHeight;
    }

    const containingBlock = position === "absolute" || position === "fixed"
      ? element.offsetParent || element.parentElement
      : element.parentElement;
    if (!containingBlock) {
      return property === "width" ? elementWindow.innerWidth : elementWindow.innerHeight;
    }

    const dimension = property === "width" ? containingBlock.clientWidth : containingBlock.clientHeight;
    if (!Number.isFinite(dimension) || dimension <= 0) {
      return 0;
    }

    if (position === "absolute") {
      return dimension;
    }

    const containingStyle = elementWindow.getComputedStyle(containingBlock);
    const padding = property === "width"
      ? Number.parseFloat(containingStyle.paddingLeft) + Number.parseFloat(containingStyle.paddingRight)
      : Number.parseFloat(containingStyle.paddingTop) + Number.parseFloat(containingStyle.paddingBottom);
    return Math.max(0, dimension - (Number.isFinite(padding) ? padding : 0));
  }

  function getDimensionValue(element, property, unit) {
    const inlineValue = element.style.getPropertyValue(property).trim();
    const percentageMatch = inlineValue.match(/^(-?(?:\d+\.?\d*|\.\d+))\s*%$/);
    if (unit === "%" && percentageMatch) {
      return Number(percentageMatch[1]);
    }

    const computedValue = Number.parseFloat(getElementComputedStyle(element).getPropertyValue(property));
    if (!Number.isFinite(computedValue)) {
      return 0;
    }
    if (unit !== "%") {
      return computedValue;
    }

    const reference = getDimensionReference(element, property);
    return reference > 0 ? computedValue / reference * 100 : 0;
  }

  function getDimensionUnit(property) {
    return shadow.querySelector(`[data-size-unit="${property}"]`).value;
  }

  function setDimensionRangeLimits(input, unit) {
    if (unit === "%") {
      input.min = "0";
      input.max = "100";
    } else if (input.dataset.sizeValue === "width") {
      input.min = "24";
      input.max = "1200";
    } else {
      input.min = "16";
      input.max = "800";
    }
  }

  function setDimensionControlFromComputed(input, element) {
    const control = input.closest("[data-dimension-control]");
    const unit = control.querySelector("[data-size-unit]").value;
    setDimensionRangeLimits(input, unit);
    const value = getDimensionValue(element, input.dataset.sizeValue, unit);
    const min = Number(input.min);
    const max = Number(input.max);
    input.value = String(Math.round(Math.max(min, Math.min(max, value))));
    updateRangeReadout(input);
  }

  function getElementAspectRatio(element) {
    const computedStyle = getElementComputedStyle(element);
    const width = Number.parseFloat(computedStyle.getPropertyValue("width"));
    const height = Number.parseFloat(computedStyle.getPropertyValue("height"));
    return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
      ? width / height
      : null;
  }

  function getDimensionPixels(element, property, value, unit) {
    if (unit !== "%") {
      return value;
    }

    const reference = getDimensionReference(element, property);
    return reference > 0 ? value * reference / 100 : value;
  }

  function setLinkedDimension(element, changedProperty, value, unit) {
    const ratio = dimensionAspectRatio || getElementAspectRatio(element);
    if (!ratio) {
      return;
    }

    const changedPixels = getDimensionPixels(element, changedProperty, value, unit);
    const otherProperty = changedProperty === "width" ? "height" : "width";
    const otherPixels = changedProperty === "width" ? changedPixels / ratio : changedPixels * ratio;
    const otherUnit = getDimensionUnit(otherProperty);
    const reference = otherUnit === "%" ? getDimensionReference(element, otherProperty) : 0;
    const convertedValue = otherUnit === "%" && reference > 0
      ? otherPixels / reference * 100
      : otherPixels;
    const otherInput = shadow.querySelector(`[data-size-value="${otherProperty}"]`);
    setDimensionRangeLimits(otherInput, otherUnit);
    const min = Number(otherInput.min);
    const max = Number(otherInput.max);
    const clampedValue = Math.round(Math.max(min, Math.min(max, convertedValue)));
    setPageStyle(element, otherProperty, `${clampedValue}${otherUnit}`);
  }

  function updateDimensionUnit(property, unit) {
    shadow.querySelectorAll(`[data-size-unit="${property}"]`).forEach((select) => {
      select.value = unit;
    });
    if (selectedElement) {
      shadow.querySelectorAll(`[data-size-value="${property}"]`).forEach((input) => {
        setDimensionControlFromComputed(input, selectedElement);
      });
    }
  }

  function setDimensionLink(enabled) {
    linkedDimensions = enabled;
    dimensionAspectRatio = enabled && selectedElement ? getElementAspectRatio(selectedElement) : null;
    shadow.querySelectorAll("[data-link-dimensions]").forEach((button) => {
      button.setAttribute("aria-pressed", String(linkedDimensions));
    });
  }

  function buildCss() {
    const blocks = new Map();

    for (const [element, properties] of styleChanges) {
      const selector = getSelector(element);
      if (!selector) {
        throw new Error("A changed element no longer has a unique selector in the document.");
      }

      let declarations = blocks.get(selector);
      if (!declarations) {
        declarations = new Map();
        blocks.set(selector, declarations);
      }

      for (const property of properties.keys()) {
        const value = element.style.getPropertyValue(property);
        const priority = element.style.getPropertyPriority(property);
        declarations.set(property, `  ${property}: ${value}${priority ? " !important" : ""};`);
      }
    }

    return Array.from(blocks, ([selector, declarations]) =>
      `${selector} {\n${Array.from(declarations.values()).join("\n")}\n}`
    ).join("\\n\\n");
  }

  function drawRulers() {
    horizontalRuler.replaceChildren();
    verticalRuler.replaceChildren();

    for (let offset = 0; offset <= window.innerWidth; offset += 50) {
      const tick = document.createElement("span");
      tick.className = offset % 100 === 0 ? "tick major" : "tick";
      tick.style.left = `${offset}px`;
      horizontalRuler.append(tick);

      if (offset % 100 === 0) {
        const label = document.createElement("span");
        label.className = "ruler-label";
        label.textContent = String(offset);
        label.style.left = `${offset}px`;
        horizontalRuler.append(label);
      }
    }

    for (let offset = 0; offset <= window.innerHeight; offset += 50) {
      const tick = document.createElement("span");
      tick.className = offset % 100 === 0 ? "tick major" : "tick";
      tick.style.top = `${offset}px`;
      verticalRuler.append(tick);

      if (offset % 100 === 0) {
        const label = document.createElement("span");
        label.className = "ruler-label";
        label.textContent = String(offset);
        label.style.top = `${offset}px`;
        verticalRuler.append(label);
      }
    }
  }

  function updateViewportOverlays() {
    if (shadow.querySelector("#ruler-toggle").checked) {
      drawRulers();
    }

    if (selectedElement) {
      updateHighlight(selectedElement, true);
    } else if (picking && hoveredElement) {
      updateHighlight(hoveredElement);
    }
  }

  function dispose() {
    if (disposed) {
      return;
    }

    disposed = true;
    controller.abort();
    if (suppressLogoClickTimer !== null) {
      clearTimeout(suppressLogoClickTimer);
    }
    clearMobilePreviewLoadTimer();
    detachMobilePreviewInteractionHandlers();
    clearSelectionStatePreview();
    mobilePreviewIframe.src = "about:blank";
    host.remove();
    if (window[sessionKey] === session) {
      delete window[sessionKey];
    }
  }

  const session = { dispose };
  window[sessionKey] = session;

  function onPageMove(event) {
    if (!picking) {
      return;
    }

    if (isToolboxEvent(event)) {
      hoveredElement = null;
      updateHighlight(selectedElement, Boolean(selectedElement));
      return;
    }

    const element = getPageElement(event);
    hoveredElement = element;
    if (element) {
      updateHighlight(element);
    } else if (selectedElement) {
      updateHighlight(selectedElement, true);
    } else {
      updateHighlight(null);
    }
  }

  function onPagePick(event) {
    if (isToolboxEvent(event)) {
      clickSuppressionTarget = null;
      return;
    }

    if (!picking) {
      clickSuppressionTarget = null;
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const element = getPageElement(event);
    if (!element) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    clickSuppressionTarget = element;
    setSelectedElement(element);
  }

  function onPageClick(event) {
    if (isToolboxEvent(event)) {
      clickSuppressionTarget = null;
      return;
    }

    const target = clickSuppressionTarget;
    if (!target) {
      return;
    }

    clickSuppressionTarget = null;
    if (event.detail === 0) {
      return;
    }

    const clickedElement = event.composedPath().find((node) => node?.nodeType === 1);
    if (!clickedElement || !(target === clickedElement || target.contains(clickedElement) || clickedElement.contains(target))) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function onPageKeydown(event) {
    if (isToolboxEvent(event)) {
      return;
    }

    if (mobilePreviewActive && (event.ctrlKey || event.metaKey)) {
      if (event.key === "+" || event.key === "=" || event.code === "NumpadAdd") {
        event.preventDefault();
        event.stopPropagation();
        setMobilePreviewZoom(mobilePreviewZoom + 0.1);
        return;
      }
      if (event.key === "-" || event.key === "_" || event.code === "NumpadSubtract") {
        event.preventDefault();
        event.stopPropagation();
        setMobilePreviewZoom(mobilePreviewZoom - 0.1);
        return;
      }
      if (event.key === "0" || event.code === "Numpad0") {
        event.preventDefault();
        event.stopPropagation();
        setMobilePreviewZoom(1);
        return;
      }
    }

    if (picking && event.key === "Escape") {
      event.preventDefault();
      setPicking(false);
      setStatus("Element picking cancelled.");
    }
  }

  shadow.querySelectorAll("[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const tool = tab.dataset.tab;
      const toggledOff = activeTool === tool;
      setActiveTool(toggledOff ? null : tool);
      if (tab.dataset.tab === "mobile") {
        if (toggledOff) {
          if (mobilePreviewActive) {
            changeMobilePreview(false);
          }
        } else {
          changeMobilePreview(!mobilePreviewActive);
        }
      }
    }, { signal: controller.signal });
  });

  domTree.addEventListener("click", (event) => {
    const target = event.target;
    const pageButton = target.closest(".dom-tree-page-button");
    const item = target.closest('[role="treeitem"]');
    const element = item && domTreeNodeElements.get(item);
    if (!element) {
      return;
    }

    if (pageButton) {
      const currentStart = domTreeChildStart.get(element) || 0;
      const nextStart = pageButton.dataset.direction === "previous"
        ? Math.max(0, currentStart - domTreePageSize)
        : currentStart + domTreePageSize;
      domTreeChildStart.set(element, nextStart);
      refreshDomTree();
      focusDomTreeItem(element);
      return;
    }

    if (target.closest(".dom-tree-toggle")) {
      refreshDomTreeAfterToggle(element, !domTreeExpanded.has(element));
      return;
    }

    setSelectedElement(element);
    focusDomTreeItem(element);
  }, { signal: controller.signal });

  domTree.addEventListener("keydown", (event) => {
    const item = event.target.closest('[role="treeitem"]');
    const element = item && domTreeNodeElements.get(item);
    if (!element) {
      return;
    }

    const visibleItems = Array.from(domTree.querySelectorAll('[role="treeitem"]'));
    const itemIndex = visibleItems.indexOf(item);
    const focusVisibleItem = (index) => {
      if (index >= 0 && index < visibleItems.length) {
        event.preventDefault();
        visibleItems[index].focus();
      }
    };

    if (event.key === "ArrowDown") {
      focusVisibleItem(itemIndex + 1);
    } else if (event.key === "ArrowUp") {
      focusVisibleItem(itemIndex - 1);
    } else if (event.key === "Home") {
      focusVisibleItem(0);
    } else if (event.key === "End") {
      focusVisibleItem(visibleItems.length - 1);
    } else if (event.key === "ArrowRight" && getDomTreeChildCount(element) > 0) {
      event.preventDefault();
      if (!domTreeExpanded.has(element)) {
        refreshDomTreeAfterToggle(element, true);
      } else {
        const group = Array.from(item.children).find((child) => child.classList.contains("dom-tree-group"));
        const childItem = group && Array.from(group.children)
          .find((child) => child.getAttribute("role") === "treeitem");
        childItem?.focus();
      }
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (domTreeExpanded.has(element)) {
        refreshDomTreeAfterToggle(element, false);
      } else {
        focusDomTreeItem(getDomTreeParent(element));
      }
    } else if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      setSelectedElement(element);
      focusDomTreeItem(element);
    }
  }, { signal: controller.signal });

  shadow.querySelectorAll("[data-size-unit]").forEach((select) => {
    select.addEventListener("change", (event) => {
      updateDimensionUnit(select.dataset.sizeUnit, event.currentTarget.value);
    }, { signal: controller.signal });
  });

  shadow.querySelectorAll("[data-link-dimensions]").forEach((button) => {
    button.addEventListener("click", () => setDimensionLink(!linkedDimensions), { signal: controller.signal });
  });

  shadow.querySelector("#close-button").addEventListener("click", dispose, { signal: controller.signal });

  shadow.querySelector("#mobile-preview-toggle").addEventListener("click", () => {
    void changeMobilePreview(!mobilePreviewActive);
  }, { signal: controller.signal });
  mobilePreviewStage.addEventListener("wheel", (event) => handleMobilePreviewWheel(event, true), {
    passive: false,
    signal: controller.signal
  });
  mobilePreviewStage.addEventListener("pointerdown", beginMobilePreviewPan, {
    signal: controller.signal
  });
  const handleMobileDeviceChange = (event) => {
    const selectedDevice = event.currentTarget.value;
    const preset = mobileDevicePresets[selectedDevice];
    if (!preset) {
      setStatus("Choose a supported mobile device.", "error");
      return;
    }

    mobileDeviceSelect.value = selectedDevice;
    mobilePreviewDeviceSelect.value = selectedDevice;
    mobilePreviewWidth = preset.width;
    mobilePreviewHeight = preset.height;
    if (mobilePreviewActive) {
      void changeMobilePreview(true);
    } else {
      updateMobilePreviewControls();
    }
  };
  mobileDeviceSelect.addEventListener("change", handleMobileDeviceChange, { signal: controller.signal });
  mobilePreviewDeviceSelect.addEventListener("change", handleMobileDeviceChange, { signal: controller.signal });
  const dragHandle = shadow.querySelector("#drag-handle");
  dragHandle.addEventListener("click", () => {
    if (suppressLogoClick) {
      suppressLogoClick = false;
      if (suppressLogoClickTimer !== null) {
        clearTimeout(suppressLogoClickTimer);
        suppressLogoClickTimer = null;
      }
      return;
    }
    toggleActiveToolPanel();
  }, { signal: controller.signal });
  dragHandle.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleActiveToolPanel();
    }
  }, { signal: controller.signal });
  mobilePreviewOrientation.addEventListener("click", switchMobilePreviewOrientation, {
    signal: controller.signal
  });
  shadow.querySelectorAll(".mobile-resize-handle").forEach((handle) => {
    handle.addEventListener("pointerdown", beginMobilePreviewResize, { signal: controller.signal });
  });

  textContent.addEventListener("input", () => {
    if (!selectedElement || !canEditText(selectedElement)) {
      return;
    }

    for (const target of getEditTargets(selectedElement)) {
      if (!canEditText(target)) {
        continue;
      }

      if (!textChanges.has(target)) {
        textChanges.set(target, target.textContent);
      }

      target.textContent = textContent.value;
      syncMobilePreviewElement(target, [], true);
    }

    updateHighlight(selectedElement, true);
  }, { signal: controller.signal });

  toolList.addEventListener("scroll", updateToolListScrollCue, {
    passive: true,
    signal: controller.signal
  });
  toolScrollUpButton.addEventListener("click", () => {
    const [firstTool, nextTool] = toolList.querySelectorAll("[data-tab]");
    const step = firstTool && nextTool
      ? nextTool.getBoundingClientRect().top - firstTool.getBoundingClientRect().top
      : toolList.clientHeight;
    toolList.scrollBy({ top: -step, behavior: "smooth" });
  }, { signal: controller.signal });
  toolScrollDownButton.addEventListener("click", () => {
    const [firstTool, nextTool] = toolList.querySelectorAll("[data-tab]");
    const step = firstTool && nextTool
      ? nextTool.getBoundingClientRect().top - firstTool.getBoundingClientRect().top
      : toolList.clientHeight;
    toolList.scrollBy({ top: step, behavior: "smooth" });
  }, { signal: controller.signal });

  shadow.querySelectorAll('input[type="range"][data-style-property]').forEach((input) => {
    input.addEventListener("input", () => {
      if (!selectedElement) {
        return;
      }

      delete input.dataset.rangeValueEmpty;
      updateRangeReadout(input);
      const property = input.dataset.styleProperty;
      const dimensionControl = input.closest("[data-dimension-control]");
      const unit = dimensionControl
        ? dimensionControl.querySelector("[data-size-unit]").value
        : input.dataset.unit || "";
      setPageStyle(selectedElement, property, `${input.value}${unit}`);
      if (linkedDimensions && input.dataset.sizeValue) {
        setLinkedDimension(selectedElement, property, Number(input.value), unit);
      }
    }, { signal: controller.signal });
  });

  shadow.querySelectorAll("[data-box-model-master]").forEach((input) => {
    input.addEventListener("input", () => {
      if (!selectedElement) {
        return;
      }

      const property = input.dataset.boxModelMaster;
      const value = `${input.value}${input.dataset.unit || ""}`;
      const styles = {};
      for (const side of ["top", "right", "bottom", "left"]) {
        styles[`${property}-${side}`] = value;
      }
      setPageStyles(selectedElement, styles);
    }, { signal: controller.signal });
  });

  shadow.querySelectorAll('select[data-style-property], input[type="color"][data-style-property]').forEach((input) => {
    input.addEventListener("input", () => {
      if (selectedElement) {
        setPageStyle(selectedElement, input.dataset.styleProperty, input.value);
      }
    }, { signal: controller.signal });
    input.addEventListener("change", () => {
      if (selectedElement) {
        setPageStyle(selectedElement, input.dataset.styleProperty, input.value);
      }
    }, { signal: controller.signal });
  });

  shadow.querySelectorAll(".custom-style-editor").forEach((editor) => {
    editor.querySelector(".custom-style-apply").addEventListener("click", () => {
      applyCustomStyle(editor);
    }, { signal: controller.signal });
    editor.querySelectorAll("input").forEach((input) => {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          applyCustomStyle(editor);
        }
      }, { signal: controller.signal });
    });
  });

  const gridToggle = shadow.querySelector("#grid-toggle");
  const overlayGridToggle = shadow.querySelector("#overlay-grid-toggle");
  gridToggle.addEventListener("change", (event) => {
    grid.hidden = !event.currentTarget.checked;
    overlayGridToggle.checked = event.currentTarget.checked;
  }, { signal: controller.signal });
  overlayGridToggle.addEventListener("change", (event) => {
    grid.hidden = !event.currentTarget.checked;
    gridToggle.checked = event.currentTarget.checked;
  }, { signal: controller.signal });

  const rulerToggle = shadow.querySelector("#ruler-toggle");
  const overlayRulerToggle = shadow.querySelector("#overlay-ruler-toggle");
  rulerToggle.addEventListener("change", (event) => {
    const enabled = event.currentTarget.checked;
    horizontalRuler.hidden = !enabled;
    verticalRuler.hidden = !enabled;
    overlayRulerToggle.checked = enabled;
    if (enabled) {
      drawRulers();
    }
  }, { signal: controller.signal });
  overlayRulerToggle.addEventListener("change", (event) => {
    const enabled = event.currentTarget.checked;
    horizontalRuler.hidden = !enabled;
    verticalRuler.hidden = !enabled;
    rulerToggle.checked = enabled;
    if (enabled) {
      drawRulers();
    }
  }, { signal: controller.signal });

  shadow.querySelectorAll("[data-selection-state]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const { selectionState } = event.currentTarget.dataset;
      if (!selectionState || !selectedElement) {
        return;
      }

      if (event.currentTarget.checked) {
        selectionStates.add(selectionState);
      } else {
        selectionStates.delete(selectionState);
      }
      updateSelectionStatePreview();
    }, { signal: controller.signal });
  });

  shadow.querySelector("#copy-css").addEventListener("click", async () => {
    try {
      const css = buildCss();
      if (!css) {
        setStatus("No style changes to copy. Text edits are not included in CSS.", "error");
        return;
      }

      await navigator.clipboard.writeText(css);
      setStatus("CSS copied to the clipboard.", "success");
    } catch (error) {
      console.error("Domino could not copy the CSS changes.", error);
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Could not copy CSS: ${message}`, "error");
    }
  }, { signal: controller.signal });

  shadow.querySelector("#reset-selected").addEventListener("click", () => {
    if (!selectedElement) {
      return;
    }

    const targets = getEditTargets(selectedElement);
    for (const target of targets) {
      const changes = styleChanges.get(target);
      if (changes) {
        for (const [property, original] of changes) {
          if (original.longhands) {
            target.style.removeProperty(property);
            for (const [longhand, originalSide] of Object.entries(original.longhands)) {
              if (originalSide.value) {
                target.style.setProperty(longhand, originalSide.value, originalSide.priority);
              } else {
                target.style.removeProperty(longhand);
              }
            }
          } else if (original.value) {
            target.style.setProperty(property, original.value, original.priority);
          } else {
            target.style.removeProperty(property);
          }
        }
        styleChanges.delete(target);
      }

      if (textChanges.has(target)) {
        target.textContent = textChanges.get(target);
        textChanges.delete(target);
      }
    }

    if (linkedDimensions) {
      dimensionAspectRatio = getElementAspectRatio(selectedElement);
    }

    refreshSelectionControls();
    updateHighlight(selectedElement, true);
    setStatus("Changes to the selected element were reset.");
  }, { signal: controller.signal });

  toolRail.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button, .tool-list") || event.button !== 0) {
      return;
    }

    const rect = toolRail.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = rect.left;
    const startTop = rect.top;
    const maxLeft = Math.max(8, outerViewport.width - rect.width - 8);
    const maxTop = Math.max(8, outerViewport.height - rect.height - 8);
    const captureTarget = event.target.closest("#drag-handle") || toolRail;
    let dragging = false;
    captureTarget.setPointerCapture(event.pointerId);

    const moveWorkspace = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      if (!dragging && Math.hypot(deltaX, deltaY) < 4) {
        return;
      }
      dragging = true;
      moveEvent.preventDefault();
      const left = Math.max(8, Math.min(maxLeft, startLeft + deltaX));
      const top = Math.max(8, Math.min(maxTop, startTop + deltaY));
      workspace.style.left = `${left}px`;
      workspace.style.top = `${top}px`;
      keepWorkspaceInViewport();
    };

    const stopDragging = () => {
      if (captureTarget.hasPointerCapture(event.pointerId)) {
        captureTarget.releasePointerCapture(event.pointerId);
      }
      toolRail.removeEventListener("pointermove", moveWorkspace);
      toolRail.removeEventListener("pointerup", stopDragging);
      toolRail.removeEventListener("pointercancel", stopDragging);
      if (dragging) {
        suppressLogoClick = true;
        if (suppressLogoClickTimer !== null) {
          clearTimeout(suppressLogoClickTimer);
        }
        suppressLogoClickTimer = setTimeout(() => {
          suppressLogoClick = false;
          suppressLogoClickTimer = null;
        }, 0);
      }
    };

    toolRail.addEventListener("pointermove", moveWorkspace);
    toolRail.addEventListener("pointerup", stopDragging, { once: true });
    toolRail.addEventListener("pointercancel", stopDragging, { once: true });
  }, { signal: controller.signal });

  shadow.querySelector("#font-family").addEventListener("change", (event) => {
    if (selectedElement) {
      setPageStyle(selectedElement, "font-family", event.currentTarget.value);
    }
  }, { signal: controller.signal });

  shadow.querySelector("#font-weight").addEventListener("change", (event) => {
    if (selectedElement) {
      setPageStyle(selectedElement, "font-weight", event.currentTarget.value);
    }
  }, { signal: controller.signal });

  [
    "pointerdown",
    "pointerup",
    "pointercancel",
    "mousedown",
    "mouseup",
    "click",
    "dblclick",
    "auxclick",
    "contextmenu",
    "keydown",
    "keyup",
    "touchstart",
    "touchend",
    "touchcancel"
  ].forEach((eventType) => {
    host.addEventListener(eventType, (event) => {
      event.stopPropagation();
    }, { signal: controller.signal });
  });

  document.addEventListener("pointermove", onPageMove, {
    capture: true,
    signal: controller.signal
  });
  document.addEventListener("pointerdown", onPagePick, {
    capture: true,
    signal: controller.signal
  });
  window.addEventListener("click", onPageClick, {
    capture: true,
    signal: controller.signal
  });
  document.addEventListener("scroll", updateViewportOverlays, {
    capture: true,
    passive: true,
    signal: controller.signal
  });
  document.addEventListener("keydown", onPageKeydown, {
    capture: true,
    signal: controller.signal
  });
  window.addEventListener("resize", () => {
    setOuterViewport(window.innerWidth, window.innerHeight);
    updateToolListScrollCue();
    updateMobilePreviewControls();
    keepWorkspaceInViewport();
    updateViewportOverlays();
  }, {
    passive: true,
    signal: controller.signal
  });

  refreshSelectionControls();
  document.documentElement.append(host);
  setActiveTool("select");
  updateToolListScrollCue();
  void initializeMobilePreview();
})();
