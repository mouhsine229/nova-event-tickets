'use strict';

const { json, body } = require('../../lib/http');
const { db } = require('../../lib/db');
const { requireAdmin } = require('../../lib/security');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non prise en charge.' }, { Allow: 'POST' });
  if (!requireAdmin(req, res)) return;
  try {
    const { code: input } = await body(req);
    const code = String(input || '').trim().slice(0, 160);
    if (!code) return json(res, 400, { error: 'Saisissez le code du billet.' });
    const sql = db();
    const rows = await sql`UPDATE tickets t SET status='checked_in',checked_in_at=now()
      FROM orders o WHERE t.order_id=o.id AND t.ticket_code=${code} AND t.status='valid' AND o.status='paid'
      RETURNING t.ticket_code,t.ticket_name,t.buyer_name,t.checked_in_at`;
    if (rows[0]) return json(res, 200, { valid: true, ticketType: rows[0].ticket_name, buyerName: rows[0].buyer_name, checkedInAt: rows[0].checked_in_at });
    const existing = await sql`SELECT t.status,t.ticket_name,t.buyer_name,o.status AS order_status FROM tickets t JOIN orders o ON o.id=t.order_id WHERE t.ticket_code=${code} LIMIT 1`;
    if (!existing[0] || existing[0].order_status !== 'paid') return json(res, 404, { error: 'Billet introuvable ou paiement non confirmé.' });
    if (existing[0].status === 'checked_in') return json(res, 409, { error: `Ce billet a déjà été utilisé pour ${existing[0].buyer_name}.` });
    return json(res, 409, { error: 'Ce billet ne peut pas être utilisé.' });
  } catch (error) {
    console.error('Contrôle du billet impossible:', error?.message || error);
    return json(res, 503, { error: 'Le contrôle du billet est temporairement indisponible.' });
  }
};
