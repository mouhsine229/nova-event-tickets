'use strict';

const crypto = require('node:crypto');
const COOKIE = 'nova_admin';

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function hashKey(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex'); }

function secret() { return process.env.ADMIN_SESSION_SECRET || ''; }

function sign(value) { return crypto.createHmac('sha256', secret()).update(value).digest('base64url'); }

function createAdminCookie(req) {
  if (!process.env.ADMIN_PASSWORD || !secret()) throw new Error('Définissez ADMIN_PASSWORD et ADMIN_SESSION_SECRET avant de vous connecter.');
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
  const token = `${payload}.${sign(payload)}`;
  const secure = req?.headers?.['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production' ? 'Secure; ' : '';
  return `${COOKIE}=${token}; HttpOnly; ${secure}SameSite=Strict; Path=/; Max-Age=28800`;
}

function clearAdminCookie(req) {
  const secure = req?.headers?.['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production' ? 'Secure; ' : '';
  return `${COOKIE}=; HttpOnly; ${secure}SameSite=Strict; Path=/; Max-Age=0`;
}

function isAdmin(req) {
  if (!secret()) return false;
  const cookies = Object.fromEntries(String(req.headers.cookie || '').split(';').map((part) => part.trim().split(/=(.*)/s).slice(0, 2)).filter((part) => part.length === 2));
  const token = cookies[COOKIE] || '';
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !safeEqual(sign(payload), signature)) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}

function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  res.statusCode = 401; res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: 'Connectez-vous à l’espace organisateur.' }));
  return false;
}

module.exports = { safeEqual, hashKey, createAdminCookie, clearAdminCookie, isAdmin, requireAdmin };
