'use strict';

const { json } = require('../lib/http');
const { isDatabaseReady, getEventAndTickets } = require('../lib/db');
const { isReady } = require('../lib/cinetpay');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Méthode non prise en charge.' }, { Allow: 'GET' });
  try {
    if (!isDatabaseReady()) return json(res, 503, { error: 'Base de données non configurée.' });
    const { event, tickets } = await getEventAndTickets();
    if (!event) return json(res, 404, { error: 'Configuration de l’évènement introuvable.' });
    return json(res, 200, { event, tickets, salesEnabled: Boolean(event.published && !event.isDemo && isReady()) });
  } catch (error) {
    console.error('Chargement de l’évènement impossible:', error?.message || error);
    return json(res, 503, { error: 'Informations temporairement indisponibles.' });
  }
};
