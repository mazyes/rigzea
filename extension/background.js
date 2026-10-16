// Receives a listing from the Rigzea page, remembers it per target site and opens the posting form.
// The post-form URLs are best guesses: confirm them while logged in (see README).
const FORMS = {
  ss: 'https://home.ss.ge/ka/udzravi-qoneba/create',
  myhome: 'https://statements.myhome.ge/ka/statement/create?referrer=myhome',
};

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== 'rigzea:post') return;
  const targets = (msg.targets || []).filter(t => FORMS[t]);
  (async () => {
    for (const t of targets) {
      await chrome.storage.session.set({ [`job:${t}`]: { listing: msg.listing, at: Date.now() } });
      await chrome.tabs.create({ url: FORMS[t] });
    }
    reply({ ok: targets.length > 0 });
  })();
  return true;
});
