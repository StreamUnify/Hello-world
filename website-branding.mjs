// Injected by the HTTP server only. The shared native HTML stays unchanged.
export function websiteHtml(html) {
  // Legal documents use an implicit head; their title still anchors metadata.
  return String(html).replace('<title>', '<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48"><link rel="icon" type="image/png" sizes="32x32" href="/favicon.png"><title>');
}
export function websiteIcon(path) {
  if(path==='/favicon.ico')return {file:'favicon.ico',type:'image/x-icon'};
  if(path==='/favicon.png')return {file:'favicon.png',type:'image/png'};
  return null;
}
