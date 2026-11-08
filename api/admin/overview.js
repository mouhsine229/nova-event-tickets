'use strict';

const { json } = require('../../lib/http');
const { db, getEventAndTickets, isDatabaseReady } = require('../../lib/db');
const { requireAdmin } = require('../../lib/security');
const { isReady } = require('../../lib/cinetpay');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Méthode non prise en charge.' }, { Allow: 'GET' });
  if (!requireAdmin(req, res)) return;
  if (!isDatabaseReady()) return json(res, 503, { error: 'La base de données n’est pas configurée.' });
  try {
    const sql = db();
    const [{ event, tickets }, summaryRows, orderRows] = await Promise.all([
      getEventAndTickets(),
      sql`SELECT COUNT(*) FILTER (WHERE status='paid')::integer AS paid_orders,
        COALESCE(SUM(amount) FILTER (WHERE status='paid'),0)::integer AS revenue,
        COALESCE(SUM(quantity) FILTER (WHERE status='paid'),0)::integer AS tickets_sold FROM orders`,
      sql`SELECT id,buyer_name,email,ticket_name,quantity,amount,status,created_at FROM orders ORDER BY created_at DESC LIMIT 30`
    ]);
    return json(res, 200, {
      event, tickets,
      summary: { paidOrders: summaryRows[0]?.paid_orders || 0, revenue: summaryRows[0]?.revenue || 0, ticketsSold: summaryRows[0]?.tickets_sold || 0 },
      orders: orderRows.map((order) => ({ buyerName: order.buyer_name, email: order.email, ticketName: order.ticket_name, quantity: order.quantity, amount: order.amount, status: order.status, createdAt: order.created_at })),
      cinetpayReady: isReady()
    });
  } catch (error) {
    console.error('Chargement du tableau organisateur impossible:', error?.message || error);
    return json(res, 503, { error: 'Tableau de bord temporairement indisponible.' });
  }
};
