'use strict';

const { json } = require('../../lib/http');
const { isAdmin } = require('../../lib/security');
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Méthode non prise en charge.' }, { Allow: 'GET' });
  return json(res, 200, { authenticated: isAdmin(req) });
};
