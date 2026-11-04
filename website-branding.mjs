// Injected by the HTTP server only. The shared native HTML stays unchanged.
export function websiteHtml(html) {
  // Legal documents use an implicit head; their title still anchors metadata.
  return websitePickerHtml(String(html)).replace('</head>', websiteBannerStyle + '</head>').replace('<title>', '<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48"><link rel="icon" type="image/png" sizes="32x32" href="/favicon.png"><title>');
}
export function websiteIcon(path) {
  if(path==='/favicon.ico')return {file:'favicon.ico',type:'image/x-icon'};
  if(path==='/favicon.png')return {file:'favicon.png',type:'image/png'};
  return null;
}

// The public website gives the provider artwork more room and blends its
// export edges into the hero. Native app layouts retain their own spacing.
const websiteBannerStyle = `<style id="su-website-banner-fit">
.hero .su-original-artwork {
  border-radius: 0;
  background: transparent;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent), linear-gradient(0deg, transparent, #000 24%, #000 95%, transparent);
  -webkit-mask-composite: source-in;
  mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent), linear-gradient(0deg, transparent, #000 24%, #000 95%, transparent);
  mask-composite: intersect;
}
@media (min-width: 900px) {
  .hero {
    grid-template-columns: minmax(0, 29fr) minmax(0, 71fr);
    padding: 30px;
    column-gap: 18px;
  }
  .hero h1 {font-size: clamp(32px, 3.35vw, 47px); letter-spacing: -1.2px; margin-bottom: 14px;}
  .hero p {font-size: 14px; line-height: 1.55; margin-bottom: 0;}
  .hero .su-original-artwork {
    width: calc(100% + 38px);
    max-width: none;
    margin: -8px -30px 4px -8px;
  }
  .hero .su-search-wrap {width: 96%; margin: 8px auto 0;}
}
@media (max-width: 899px) {
  .hero {padding: 24px 20px;}
  .hero .su-original-artwork {width: calc(100% + 32px); max-width: none; margin: 10px -16px 14px;}
}
</style>`;

// Website-only entry point. Native source and app packaging are untouched.
export function websitePickerHtml(html) {
  const anchor='<details id="recentSearches"';
  if(!html.includes('<main id="top">'))return html;
  if(html.includes('id="suWebPickTogether"'))return html;
  if(html.split(anchor).length!==2)throw Error('Website picker navigation anchor changed');
  return html.replace(anchor,'<div class="su-together-launch"><button type="button" id="suWebPickTogether" aria-controls="suWebTogether" aria-pressed="false"><span class="su-together-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/></svg></span><span class="su-together-copy"><span class="su-together-label">PICK TOGETHER</span><span class="su-together-title">Pick a Movie. Together</span></span><span class="su-together-arrow" aria-hidden="true">→</span></button></div>'+anchor)
    .replace('</head>','<style>.su-together-launch{width:min(850px,100%);margin:14px auto 0;grid-column:2}#suWebPickTogether{display:flex;align-items:center;gap:16px;width:100%;min-height:82px;padding:15px 18px;text-align:left;color:#edf3ff;background:linear-gradient(110deg,#19243c,#151d32 65%,#211e40);border:1px solid #5f6eb1;border-radius:13px;box-shadow:0 0 22px #7973ff13;cursor:pointer;transition:border-color .2s,box-shadow .2s,background .2s}#suWebPickTogether:hover{border-color:#a1a8ff;box-shadow:0 0 26px #7973ff29;background:linear-gradient(110deg,#20304c,#1b2440 65%,#2b254d)}#suWebPickTogether:focus-visible{outline:2px solid #c4d3ff;outline-offset:4px}.su-together-icon{display:grid;place-items:center;flex:none;width:46px;height:46px;border:1px solid #8a97ff45;border-radius:12px;background:linear-gradient(135deg,#6d87ff26,#925ce82e);color:#c2caff}.su-together-icon svg{width:26px;height:26px}.su-together-copy{display:flex;flex:1;flex-direction:column;gap:3px}.su-together-label{font:700 10px/1.3 system-ui,sans-serif;letter-spacing:2px;color:#a8b9e9}.su-together-title{font:650 20px/1.3 system-ui,sans-serif;letter-spacing:-.3px}.su-together-arrow{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:10px;background:linear-gradient(120deg,#6d87ff,#7956e9);font:400 24px/1 system-ui,sans-serif;color:white}@media(max-width:600px){#suWebPickTogether{padding:13px;gap:12px}.su-together-title{font-size:17px}.su-together-icon{width:40px;height:40px}.su-together-arrow{width:34px;height:34px}}@media(prefers-reduced-motion:reduce){#suWebPickTogether{transition:none}}main[hidden],su-web-pick-together[hidden]{display:none!important}</style></head>')
    .replace('</main>','</main><su-web-pick-together id="suWebTogether" hidden></su-web-pick-together>')
    .replace('</body>','<script type="module" src="website-pick-together-ui.mjs"></script></body>');
}
