'use strict';

const { json, body } = require('../../lib/http');
const { safeEqual, createAdminCookie } = require('../../lib/security');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non prise en charge.' }, { Allow: 'POST' });
  try {
    if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) return json(res, 503, { error: 'Accès organisateur non configuré.' });
    const data = await body(req);
    if (!safeEqual(data.password, process.env.ADMIN_PASSWORD)) return json(res, 401, { error: 'Mot de passe incorrect.' });
    return json(res, 200, { authenticated: true }, { 'Set-Cookie': createAdminCookie(req) });
  } catch (error) { return json(res, 400, { error: error.message || 'Connexion impossible.' }); }
};
