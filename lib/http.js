'use strict';

function json(res, status, value, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [key, val] of Object.entries(headers)) res.setHeader(key, val);
  res.end(JSON.stringify(value));
}

function method(req, allowed) {
  if (allowed.includes(req.method)) return true;
  json(req.res, 405, { error: 'Méthode non prise en charge.' }, { Allow: allowed.join(', ') });
  return false;
}

async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let text = '';
  for await (const chunk of req) text += chunk;
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new Error('Données de formulaire invalides.'); }
}

module.exports = { json, method, body };
