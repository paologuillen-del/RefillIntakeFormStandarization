const TARGET_URL = 'https://api.questionnaire.solutions.openloophealth.com/create-form';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const shard  = process.env.AUTHORIZATION_SHARD;
  const source = process.env.AUTHORIZATION_SOURCE;

  if (!shard || !source) {
    console.error('[api/submit] Missing auth env vars');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  try {
    const apiRes = await fetch(TARGET_URL, {
      method: 'POST',
      headers: {
        'Content-Type':       'application/json',
        'AuthorizationShard':  shard,
        'AuthorizationSource': source,
      },
      body: JSON.stringify({ data: req.body }),
    });

    const text = await apiRes.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    return res.status(apiRes.status).json(data);
  } catch (err) {
    console.error('[api/submit] fetch error:', err);
    return res.status(500).json({ error: 'Failed to reach upstream API' });
  }
};
