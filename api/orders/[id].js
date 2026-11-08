'use strict';

const { json } = require('../../lib/http');
const { db, findOrder, markOrderPaid, markOrderFailed, isDatabaseReady } = require('../../lib/db');
const { client, statusCode, transactionId, paidAmount } = require('../../lib/cinetpay');
const { hashKey, safeEqual } = require('../../lib/security');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Méthode non prise en charge.' }, { Allow: 'GET' });
  if (!isDatabaseReady()) return json(res, 503, { error: 'Service indisponible.' });
  try {
    const id = String(req.query?.id || '');
    const key = String(req.query?.key || '');
    if (!id || !key) return json(res, 400, { error: 'Lien de commande incomplet.' });
    let order = await findOrder(id);
    if (!order || !safeEqual(hashKey(key), order.access_token_hash)) return json(res, 404, { error: 'Commande introuvable.' });

    if (order.status === 'pending' && process.env.CINETPAY_API_KEY && process.env.CINETPAY_API_PASSWORD) {
      const sql = db();
      const claim = await sql`UPDATE orders SET status_checked_at=now() WHERE id=${id} AND status='pending'
        AND (status_checked_at IS NULL OR status_checked_at < now()-interval '8 seconds') RETURNING id`;
      if (claim.length) {
        try {
          const result = await client().payment.getStatus(id, 'BJ');
          const code = statusCode(result);
          const amount = paidAmount(result);
          if (code === 'SUCCESS' && (amount === null || amount === Number(order.amount))) {
            await markOrderPaid(id, transactionId(result));
          } else if (code === 'SUCCESS' && amount !== Number(order.amount)) {
            console.error('Montant de confirmation CinetPay différent du montant de commande.', id);
          } else if (['FAILED', 'EXPIRED', 'INSUFFICIENT_BALANCE'].includes(code)) {
            await markOrderFailed(id, code === 'EXPIRED' ? 'expired' : 'failed');
          }
        } catch (error) { console.error('Consultation du statut CinetPay impossible:', error?.message || error); }
      }
      order = await findOrder(id);
    }

    const sql = db();
    const tickets = order.status === 'paid' ? await sql`SELECT ticket_code FROM tickets WHERE order_id=${id} ORDER BY created_at ASC` : [];
    return json(res, 200, { status: order.status, amount: Number(order.amount), quantity: Number(order.quantity), tickets: tickets.map((ticket) => ({ code: ticket.ticket_code })) });
  } catch (error) {
    console.error('Lecture de commande impossible:', error?.message || error);
    return json(res, 503, { error: 'Le statut de votre paiement est temporairement indisponible.' });
  }
};
