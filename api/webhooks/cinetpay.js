'use strict';

const { json, body } = require('../../lib/http');
const { db, markOrderPaid, markOrderFailed } = require('../../lib/db');
const { client, statusCode, transactionId, paidAmount } = require('../../lib/cinetpay');
const { hashKey, safeEqual } = require('../../lib/security');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non prise en charge.' }, { Allow: 'POST' });
  try {
    const { parseNotification, verifyNotification } = require('cinetpay-js');
    const notification = parseNotification(await body(req));
    const orderId = notification?.merchantTransactionId || notification?.merchant_transaction_id;
    const txId = notification?.transactionId || notification?.transaction_id;
    const token = notification?.notifyToken || notification?.notify_token;
    if (!orderId || !txId || !token) return json(res, 400, { error: 'Notification incomplète.' });
    const sql = db();
    const rows = await sql`SELECT id,notify_token,webhook_secret_hash,amount,status FROM orders WHERE id=${String(orderId)} LIMIT 1`;
    const expected = rows[0]?.notify_token;
    const providerTokenValid = Boolean(expected && token && verifyNotification(expected, token));
    const routeTokenValid = Boolean(req.query?.hook && rows[0]?.webhook_secret_hash && safeEqual(hashKey(req.query.hook), rows[0].webhook_secret_hash));
    if (!rows[0] || (!providerTokenValid && !routeTokenValid)) return json(res, 401, { error: 'Notification non vérifiée.' });
    if (rows[0].status === 'paid') return json(res, 200, { received: true, duplicate: true });

    const result = await client().payment.getStatus(String(orderId), 'BJ');
    const code = statusCode(result);
    const amount = paidAmount(result);
    if (code === 'SUCCESS') {
      if (amount !== null && amount !== Number(rows[0].amount)) return json(res, 409, { error: 'Le montant confirmé ne correspond pas à la commande.' });
      const verifiedTransaction = transactionId(result);
      if (verifiedTransaction && String(txId) !== String(verifiedTransaction)) return json(res, 409, { error: 'La transaction ne correspond pas à la notification.' });
      await markOrderPaid(String(orderId), verifiedTransaction || String(txId));
    } else if (['FAILED', 'EXPIRED', 'INSUFFICIENT_BALANCE'].includes(code)) {
      await markOrderFailed(String(orderId), code === 'EXPIRED' ? 'expired' : 'failed');
    }
    return json(res, 200, { received: true });
  } catch (error) {
    console.error('Notification CinetPay non traitée:', error?.message || error);
    return json(res, 500, { error: 'La notification n’a pas pu être traitée.' });
  }
};
