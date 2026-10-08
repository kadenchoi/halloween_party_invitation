// Vercel Serverless Function → available at /api/participants
//   GET  → list every pup who has joined
//   POST → add a pup  { name, coat, breed }
//
// Storage: Upstash Redis (free tier), reached through its REST API.
// Vercel sets the env vars for you when you add the Upstash integration.

const { randomUUID } = require('crypto');

const KEY = 'halloween:pups';
const MAX_NAME = 12;
const COATS = ['black', 'brown', 'white'];
const BREEDS = ['corgi', 'mixed', 'shiba', 'frenchie', 'bichon', 'akita', 'poodle', 'golden', 'schnauzer'];

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

// Sends one Redis command, e.g. redis('HSET', key, field, value)
async function redis(...command) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error('Database not connected yet. Add the Upstash integration in Vercel, then redeploy.');
  }
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || `Database error (HTTP ${res.status})`);
  }
  return data.result;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const raw = (await redis('HVALS', KEY)) || [];
      const participants = raw
        .map((s) => JSON.parse(s))
        .sort((a, b) => a.joinedAt - b.joinedAt);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ participants });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

      const name = String(body.name ?? '').replace(/[\u0000-\u001f]/g, '').trim();
      if (!name || [...name].length > MAX_NAME) {
        return res.status(400).json({ error: 'Name must be 1 to 12 characters.' });
      }
      if (!COATS.includes(body.coat)) {
        return res.status(400).json({ error: 'Please pick a coat color.' });
      }
      if (!BREEDS.includes(body.breed)) {
        return res.status(400).json({ error: 'Please pick a breed.' });
      }

      const pup = {
        id: randomUUID(),
        name,
        coat: body.coat,
        breed: body.breed,
        joinedAt: Date.now(),
      };
      await redis('HSET', KEY, pup.id, JSON.stringify(pup));
      return res.status(201).json({ pup });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Server error. Please try again.' });
  }
};
