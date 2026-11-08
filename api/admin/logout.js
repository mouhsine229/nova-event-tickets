'use strict';

const { json } = require('../../lib/http');
const { clearAdminCookie } = require('../../lib/security');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non prise en charge.' }, { Allow: 'POST' });
  return json(res, 200, { authenticated: false }, { 'Set-Cookie': clearAdminCookie(req) });
};
