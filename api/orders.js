'use strict';

const crypto = require('node:crypto');
const { json, body } = require('../lib/http');
const { db, expireOrders, releaseOrder, markOrderPaid, isDatabaseReady } = require('../lib/db');
const { client, statusCode, transactionId, paidAmount } = require('../lib/cinetpay');
const { hashKey } = require('../lib/security');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non prise en charge.' }, { Allow: 'POST' });
  if (!isDatabaseReady()) return json(res, 503, { error: 'La billetterie est en cours de configuration. Les paiements ne sont pas encore ouverts.' });
  if (!process.env.CINETPAY_API_KEY || !process.env.CINETPAY_API_PASSWORD || !process.env.SITE_URL) return json(res, 503, { error: 'Les paiements CinetPay ne sont pas encore activés. Réessayez plus tard.' });

  let orderId;
  try {
    const data = await body(req);
    const firstName = String(data.firstName || '').trim();
    const lastName = String(data.lastName || '').trim();
    const email = String(data.email || '').trim().toLowerCase();
    const phone = String(data.phone || '').replace(/[\s()-]/g, '');
    const method = String(data.paymentMethod || '');
    const ticketTypeId = String(data.ticketTypeId || '');
    const quantity = Number(data.quantity);
    if (firstName.length < 2 || lastName.length < 2) return json(res, 400, { error: 'Indiquez votre prénom et votre nom.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'Indiquez une adresse e-mail valide.' });
    if (!/^\+229\d{8,10}$/.test(phone)) return json(res, 400, { error: 'Indiquez un numéro mobile du Bénin au format +229.' });
    if (!['MTN_BJ', 'MOOV_BJ'].includes(method)) return json(res, 400, { error: 'Choisissez MTN MoMo ou Moov Money.' });
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) return json(res, 400, { error: 'La quantité doit être comprise entre 1 et 10 billets.' });
    if (!/^[a-z0-9-]{2,70}$/i.test(ticketTypeId)) return json(res, 400, { error: 'Cette formule de billet n’est pas reconnue.' });

    await expireOrders();
    const sql = db();
    const events = await sql`SELECT data FROM event_config WHERE id='main' LIMIT 1`;
    if (!events[0]?.data?.published || events[0]?.data?.isDemo) return json(res, 403, { error: 'Les ventes ne sont pas encore ouvertes.' });
    const products = await sql`SELECT id,name,price,active FROM ticket_types WHERE id=${ticketTypeId} LIMIT 1`;
    if (!products[0] || !products[0].active) return json(res, 409, { error: 'Cette formule n’est plus disponible.' });
    if (Number(products[0].price) < 100) return json(res, 400, { error: 'Le montant de cette formule n’est pas valide.' });
    if (Number(products[0].price) * quantity > 2500000) return json(res, 400, { error: 'Le montant de cette commande dépasse le plafond CinetPay. Réduisez la quantité.' });

    orderId = `N${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const accessKey = crypto.randomBytes(16).toString('base64url');
    const webhookSecret = crypto.randomBytes(16).toString('base64url');
    const buyerName = `${firstName} ${lastName}`;
    const reserved = await sql`WITH hold AS (
      UPDATE ticket_types SET reserved=reserved+${quantity},updated_at=now()
      WHERE id=${ticketTypeId} AND active=true AND capacity-sold-reserved >= ${quantity}
      RETURNING id,name,price
    ) INSERT INTO orders(id,ticket_type_id,ticket_name,quantity,buyer_name,first_name,last_name,email,phone,payment_method,amount,access_token_hash,webhook_secret_hash,expires_at)
      SELECT ${orderId},hold.id,hold.name,${quantity},${buyerName},${firstName},${lastName},${email},${phone},${method},hold.price*${quantity},${hashKey(accessKey)},${hashKey(webhookSecret)},now()+interval '15 minutes'
      FROM hold RETURNING id,amount,ticket_name,quantity`;
    if (!reserved[0]) return json(res, 409, { error: 'Il ne reste pas assez de places pour cette quantité. Actualisez la page et réessayez.' });

    const base = process.env.SITE_URL.replace(/\/$/, '');
    const callback = `${base}/commande.html?o=${encodeURIComponent(orderId)}&k=${encodeURIComponent(accessKey)}`;
    const paymentClient = client();
    let payment;
    try {
      payment = await paymentClient.payment.initialize({
        currency: 'XOF', merchantTransactionId: orderId, amount: Number(reserved[0].amount), lang: 'fr',
        designation: `${reserved[0].ticket_name} × ${quantity}`,
        clientEmail: email, clientFirstName: firstName, clientLastName: lastName, clientPhoneNumber: phone,
        successUrl: callback, failedUrl: callback, notifyUrl: `${base}/api/webhooks/cinetpay?hook=${encodeURIComponent(webhookSecret)}`,
        channel: 'PUSH', directPay: true, paymentMethod: method
      }, 'BJ');
    } catch (error) {
      await releaseOrder(orderId, 'cancelled');
      orderId = null;
      console.error('Initialisation CinetPay impossible:', error?.message || error);
      return json(res, 502, { error: 'CinetPay n’a pas pu lancer la demande. Vérifiez votre numéro ou réessayez plus tard.' });
    }
    const token = payment?.notifyToken || payment?.notify_token || payment?.data?.notify_token || payment?.details?.notifyToken || null;
    await sql`UPDATE orders SET payment_url=${payment?.paymentUrl || payment?.payment_url || null}, notify_token=${token}, provider_transaction_id=${transactionId(payment)}, updated_at=now() WHERE id=${orderId}`;

    const initialStatus = statusCode(payment);
    let paid = null;
    if (initialStatus === 'SUCCESS') {
      try {
        const confirmed = await paymentClient.payment.getStatus(orderId, 'BJ');
        const confirmedAmount = paidAmount(confirmed);
        if (statusCode(confirmed) === 'SUCCESS' && (confirmedAmount === null || confirmedAmount === Number(reserved[0].amount))) paid = await markOrderPaid(orderId, transactionId(confirmed) || transactionId(payment));
      } catch (error) { console.error('Vérification initiale CinetPay impossible:', error?.message || error); }
    }
    const shouldRedirect = Boolean(payment?.details?.mustBeRedirected && (payment?.paymentUrl || payment?.payment_url));
    return json(res, 201, { orderId, accessKey, status: paid ? 'paid' : 'pending', paymentUrl: shouldRedirect ? (payment.paymentUrl || payment.payment_url) : null });
  } catch (error) {
    if (orderId) await releaseOrder(orderId, 'cancelled').catch(() => {});
    console.error('Création de commande impossible:', error?.message || error);
    return json(res, 500, { error: 'La commande n’a pas pu être créée. Vérifiez vos informations puis réessayez.' });
  }
};
