'use strict';

const QRCode = require('qrcode');
const { db } = require('../lib/db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
  try {
    const code = String(req.query?.code || '');
    const sql = db();
    const rows = await sql`SELECT t.ticket_code FROM tickets t JOIN orders o ON o.id=t.order_id
      WHERE t.ticket_code=${code} AND o.status='paid' AND t.status <> 'cancelled' LIMIT 1`;
    if (!rows.length) { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end('Billet introuvable'); return; }
    const base = (process.env.SITE_URL || '').replace(/\/$/, '');
    const png = await QRCode.toBuffer(`${base}/ticket.html?code=${encodeURIComponent(code)}`, { type: 'png', width: 360, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#171722', light: '#FFFFFF' } });
    res.statusCode = 200; res.setHeader('Content-Type', 'image/png'); res.setHeader('Cache-Control', 'private, no-store'); res.end(png);
  } catch (error) {
    console.error('Création du QR code impossible:', error?.message || error);
    res.statusCode = 503; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end('QR code indisponible');
  }
};
