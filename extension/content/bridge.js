// Runs on rigzea.com: relays the page's "rigzea:post" message to the extension and acknowledges it.
window.addEventListener('message', async (e) => {
  if (e.source !== window || e.data?.type !== 'rigzea:post') return;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'rigzea:post', targets: e.data.targets, listing: e.data.listing });
    if (res?.ok) window.postMessage({ type: 'rigzea:ack' }, window.location.origin);
  } catch { /* extension reloaded: no ack, the page shows its "not found" hint */ }
});
