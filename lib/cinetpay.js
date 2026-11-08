'use strict';

let cachedClient;
function client() {
  if (!process.env.CINETPAY_API_KEY || !process.env.CINETPAY_API_PASSWORD) throw new Error('Les accès CinetPay ne sont pas encore configurés.');
  if (!cachedClient) {
    const { CinetPayClient } = require('cinetpay-js');
    cachedClient = new CinetPayClient({ credentials: { BJ: { apiKey: process.env.CINETPAY_API_KEY, apiPassword: process.env.CINETPAY_API_PASSWORD } } });
  }
  return cachedClient;
}

function isReady() { return Boolean(process.env.CINETPAY_API_KEY && process.env.CINETPAY_API_PASSWORD && process.env.SITE_URL); }

function statusCode(result) { return String(result?.status || result?.details?.status || result?.data?.status || '').toUpperCase(); }
function transactionId(result) { return result?.transactionId || result?.transaction_id || result?.data?.transaction_id || result?.payment?.transactionId || null; }
function paidAmount(result) {
  const value = result?.amount ?? result?.data?.amount ?? result?.payment?.amount;
  return value === undefined || value === null ? null : Number(value);
}

module.exports = { client, isReady, statusCode, transactionId, paidAmount };
