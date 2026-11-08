'use strict';

const { json } = require('../../lib/http');
const { db } = require('../../lib/db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Méthode non prise en charge.' }, { Allow: 'GET' });
  try {
    const code = String(req.query?.code || '');
    const sql = db();
    const [rows, events] = await Promise.all([
      sql`SELECT t.ticket_code,t.ticket_name,t.buyer_name,t.status,o.status AS order_status,t.checked_in_at
        FROM tickets t JOIN orders o ON o.id=t.order_id WHERE t.ticket_code=${code} LIMIT 1`,
      sql`SELECT data FROM event_config WHERE id='main' LIMIT 1`
    ]);
    if (!rows[0] || rows[0].order_status !== 'paid' || rows[0].status === 'cancelled') return json(res, 404, { error: 'Billet introuvable ou paiement non confirmé.' });
    const event = events[0]?.data || {};
    return json(res, 200, { code: rows[0].ticket_code, ticketType: rows[0].ticket_name, buyerName: rows[0].buyer_name, status: rows[0].status, checkedInAt: rows[0].checked_in_at, event });
  } catch (error) {
    console.error('Lecture du billet impossible:', error?.message || error);
    return json(res, 503, { error: 'Billet temporairement indisponible.' });
  }
};
