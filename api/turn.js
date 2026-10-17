// Vercel serverless function: fresh Cloudflare TURN credentials for the live pages.
// speed.cloudflare.com only answers requests carrying its own origin, so the static site
// cannot call it from the browser - this function does it server-side and allows any origin.
// Cached at the edge for 10 minutes. When it fails the pages fall back to STUN + direct.
module.exports = async (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600');
  try {
    const r = await fetch('https://speed.cloudflare.com/turn-creds', {
      headers: {
        origin: 'https://speed.cloudflare.com',
        referer: 'https://speed.cloudflare.com/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
      }
    });
    if (!r.ok) throw new Error('upstream ' + r.status);
    const j = await r.json();
    if (!j || !j.username || !j.urls) throw new Error('bad credentials');
    res.status(200).json(j);
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) });
  }
};
