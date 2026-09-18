/* Development build only. Relays commands from the Maccabi page to the
   background, so a run can be driven from the page's console:

     window.postMessage({ __hremDev: 'req', id: 1, msg: { type: 'dev:state' } }, '*')

   and the reply comes back as a message with __hremDev: 'res'. Anything on the
   page could send these, which is why this script is never in the store build. */
window.addEventListener('message', (e: MessageEvent) => {
  if (e.source !== window || !e.data || e.data.__hremDev !== 'req') return;
  const { id, msg } = e.data;
  chrome.runtime.sendMessage(msg).then(
    (res) => window.postMessage({ __hremDev: 'res', id, res }, '*'),
    (err: unknown) => window.postMessage({ __hremDev: 'res', id, res: { error: String(err) } }, '*'),
  );
});
