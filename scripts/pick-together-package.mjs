export function pickTogetherHtml(html) {
  if(html.includes('id="suPickTogether"')) throw Error('Pick Together is already packaged');
  const anchor='<nav class="su-discover" aria-label="Quick discovery">';
  if(html.split(anchor).length!==2) throw Error('Pick Together navigation anchor changed');
  return html.replace(anchor,anchor+'<button type="button" class="su-action" id="suPickTogether" aria-controls="suTogether" aria-pressed="false">Pick Together · Preview</button>')
    .replace('</head>','<style>#suPickTogether[aria-pressed="true"]{background:#2d3b57;border-color:#546380;color:#e5ecff}main[hidden],su-pick-together[hidden]{display:none!important}</style></head>')
    .replace('</main>','</main><su-pick-together id="suTogether" hidden></su-pick-together>')
    .replace('</body>','<script type="module" src="pick-together-ui.mjs"></script></body>');
}
