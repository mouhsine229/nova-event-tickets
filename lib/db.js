'use strict';

const { neon } = require('@neondatabase/serverless');
let cached;

function db() {
  if (!process.env.DATABASE_URL) throw new Error('La base de données n’est pas encore configurée.');
  if (!cached) cached = neon(process.env.DATABASE_URL);
  return cached;
}

function isDatabaseReady() { return Boolean(process.env.DATABASE_URL); }

async function expireOrders() {
  const sql = db();
  const stale = await sql`SELECT id,amount FROM orders WHERE status='pending' AND expires_at < now() ORDER BY expires_at ASC LIMIT 20`;
  if (!stale.length) return;
  const { client, statusCode, transactionId, paidAmount } = require('./cinetpay');
  let paymentClient;
  try { paymentClient = client(); } catch { return; }
  for (const order of stale) {
    try {
      const result = await paymentClient.payment.getStatus(order.id, 'BJ');
      const code = statusCode(result);
      if (code === 'EXPIRED') await markOrderFailed(order.id, 'expired');
      else if (['FAILED', 'INSUFFICIENT_BALANCE'].includes(code)) await markOrderFailed(order.id, 'failed');
      else if (code === 'SUCCESS') {
        const amount = paidAmount(result);
        if (amount === null || amount === Number(order.amount)) await markOrderPaid(order.id, transactionId(result));
        else console.error('Montant CinetPay différent pour une réservation en attente.', order.id);
      }
    } catch (error) { console.error('Vérification d’une réservation en attente impossible:', error?.message || error); }
  }
}

async function getEventAndTickets() {
  const sql = db();
  const [events, tickets] = await Promise.all([
    sql`SELECT data FROM event_config WHERE id='main' LIMIT 1`,
    sql`SELECT id,name,label,description,price,capacity,sold,reserved,active,featured FROM ticket_types ORDER BY price ASC`
  ]);
  return { event: events[0]?.data || null, tickets };
}

async function findOrder(id) {
  const sql = db();
  const rows = await sql`SELECT * FROM orders WHERE id=${id} LIMIT 1`;
  return rows[0] || null;
}

async function releaseOrder(id, status = 'cancelled') {
  const sql = db();
  await sql`WITH changed AS (
    UPDATE orders SET status=${status}, updated_at=now()
    WHERE id=${id} AND status='pending' RETURNING ticket_type_id,quantity
  ) UPDATE ticket_types t SET reserved=GREATEST(0,t.reserved-changed.quantity),updated_at=now()
    FROM changed WHERE t.id=changed.ticket_type_id`;
}

async function markOrderPaid(id, transactionId) {
  const sql = db();
  const changed = await sql`WITH paid AS (
      UPDATE orders SET status='paid', provider_transaction_id=COALESCE(${transactionId || null}, provider_transaction_id), paid_at=COALESCE(paid_at,now()), updated_at=now()
      WHERE id=${id} AND status='pending' RETURNING id,ticket_type_id,ticket_name,quantity,buyer_name,email,amount,payment_method,paid_at
    ), inventory AS (
      UPDATE ticket_types t SET sold=t.sold+paid.quantity, reserved=GREATEST(0,t.reserved-paid.quantity), updated_at=now()
      FROM paid WHERE t.id=paid.ticket_type_id RETURNING t.id
    ), new_tickets AS (
      INSERT INTO tickets(id,order_id,ticket_type_id,ticket_name,ticket_code,buyer_name)
      SELECT gen_random_uuid()::text, paid.id, paid.ticket_type_id, paid.ticket_name,
        'NOVA-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)), paid.buyer_name
      FROM paid JOIN inventory ON true CROSS JOIN generate_series(1,paid.quantity)
      RETURNING ticket_code
    ) SELECT paid.*, COALESCE((SELECT json_agg(ticket_code) FROM new_tickets),'[]'::json) AS ticket_codes FROM paid`;
  if (changed[0]) {
    await sendTicketEmail(changed[0], changed[0].ticket_codes || []);
    return { ...changed[0], status: 'paid', tickets: changed[0].ticket_codes || [] };
  }
  const order = await findOrder(id);
  if (!order) return null;
  const ticketRows = await sql`SELECT ticket_code FROM tickets WHERE order_id=${id} ORDER BY created_at ASC`;
  if (order.status === 'paid') await sendTicketEmail(order, ticketRows.map((ticket) => ticket.ticket_code));
  return { ...order, tickets: ticketRows.map((ticket) => ticket.ticket_code) };
}

async function markOrderFailed(id, status) {
  const sql = db();
  await sql`WITH changed AS (
      UPDATE orders SET status=${status}, updated_at=now() WHERE id=${id} AND status='pending'
      RETURNING ticket_type_id,quantity
    ) UPDATE ticket_types t SET reserved=GREATEST(0,t.reserved-changed.quantity),updated_at=now()
      FROM changed WHERE t.id=changed.ticket_type_id`;
  return findOrder(id);
}

async function sendTicketEmail(order, ticketCodes) {
  if (!process.env.SMTP_HOST || !process.env.MAIL_FROM || !order?.email || !ticketCodes?.length) return;
  const sql = db();
  const claim = await sql`UPDATE orders SET email_sending_at=now() WHERE id=${order.id} AND email_sent_at IS NULL
    AND (email_sending_at IS NULL OR email_sending_at < now() - interval '10 minutes') RETURNING id`;
  if (!claim.length) return;
  try {
    const nodemailer = require('nodemailer');
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined
    });
    const base = (process.env.SITE_URL || '').replace(/\/$/, '');
    const links = ticketCodes.map((code, index) => `<li><a href="${base}/ticket.html?code=${encodeURIComponent(code)}">Billet ${index + 1} · ${code}</a></li>`).join('');
    await transport.sendMail({
      from: process.env.MAIL_FROM, to: order.email, subject: `Vos billets — ${order.ticket_name || 'NOVA'}`,
      text: `Votre paiement est confirmé. Ouvrez vos billets :\n${ticketCodes.map((code) => `${base}/ticket.html?code=${encodeURIComponent(code)}`).join('\n')}`,
      html: `<div style="font-family:Arial,sans-serif;color:#171722;max-width:600px;margin:auto"><h1 style="font-size:28px">Votre place est réservée.</h1><p>Bonjour ${String(order.buyer_name || '').replace(/[<>]/g, '')}, votre paiement est confirmé. Présentez le QR code de chaque billet à l’entrée.</p><ul>${links}</ul><p>À très bientôt !</p></div>`
    });
    await sql`UPDATE orders SET email_sent_at=now(),email_sending_at=NULL,updated_at=now() WHERE id=${order.id}`;
  } catch (error) {
    await sql`UPDATE orders SET email_sending_at=NULL,updated_at=now() WHERE id=${order.id}`;
    console.error('Envoi du billet par e-mail impossible:', error?.message || error);
  }
}

module.exports = { db, isDatabaseReady, expireOrders, getEventAndTickets, findOrder, releaseOrder, markOrderPaid, markOrderFailed };
