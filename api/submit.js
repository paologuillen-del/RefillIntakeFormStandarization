const FORM_URL   = 'https://api.questionnaire.solutions.openloophealth.com/create-form';
const ZOHO_URL   = 'https://flow.zoho.com/807549388/flow/webhook/incoming?zapikey=1001.cb2e6ae260048858ecda7ad14b91a4f8.7255ee8beda8a453d1f87c311f13ca79&isdebug=false';
const PATIENT_URL = 'https://api.integrations.clinic.openloophealth.com/patients';

async function checkPatientExists(patientId) {
  if (!patientId) return false;
  try {
    const res = await fetch(`${PATIENT_URL}/${patientId}?source=HEALTHIE`, {
      headers: { 'x-api-key': process.env.OLH_API_KEY },
    });
    const data = await res.json();
    return data.message !== 'Patient not found.';
  } catch {
    return false;
  }
}

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

  const payload    = req.body;
  const patientId  = (payload.patient_id || '').trim();
  const found      = await checkPatientExists(patientId);
  const createTicket = found; // true when patient exists and ticket should be created

  const zohoPayload = { ...payload, createTicket };

  // Fire Zoho webhook and form API in parallel
  const [, apiRes] = await Promise.all([
    fetch(ZOHO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(zohoPayload),
    }).catch(err => console.error('[api/submit] Zoho webhook error:', err)),

    fetch(FORM_URL, {
      method: 'POST',
      headers: {
        'Content-Type':        'application/json',
        'AuthorizationShard':  shard,
        'AuthorizationSource': source,
      },
      body: JSON.stringify({ data: payload }),
    }),
  ]);

  try {
    const text = await apiRes.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return res.status(apiRes.status).json(data);
  } catch (err) {
    console.error('[api/submit] fetch error:', err);
    return res.status(500).json({ error: 'Failed to reach upstream API' });
  }
};
