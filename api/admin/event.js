'use strict';

const { json, body } = require('../../lib/http');
const { db, isDatabaseReady } = require('../../lib/db');
const { requireAdmin } = require('../../lib/security');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non prise en charge.' }, { Allow: 'POST' });
  if (!requireAdmin(req, res)) return;
  if (!isDatabaseReady()) return json(res, 503, { error: 'La base de données n’est pas configurée.' });
  try {
    const input = await body(req);
    const text = (value, max) => String(value || '').trim().slice(0, max);
    const name = text(input.name, 90);
    const tickets = Array.isArray(input.tickets) ? input.tickets : [];
    if (name.length < 3) return json(res, 400, { error: 'Le nom de l’évènement doit contenir au moins 3 caractères.' });
    if (!tickets.length || tickets.length > 12) return json(res, 400, { error: 'Ajoutez entre 1 et 12 formules de billet.' });
    const ids = new Set();
    for (const ticket of tickets) {
      const id = text(ticket.id, 70);
      if (!/^[a-z0-9-]{2,70}$/i.test(id) || ids.has(id)) return json(res, 400, { error: 'Une formule de billet a un identifiant invalide ou en double.' });
      ids.add(id);
      if (text(ticket.name, 60).length < 2 || !Number.isInteger(Number(ticket.price)) || Number(ticket.price) < 100 || Number(ticket.price) > 2500000 || !Number.isInteger(Number(ticket.capacity)) || Number(ticket.capacity) < 1) return json(res, 400, { error: 'Chaque formule doit avoir un nom, un prix entre 100 et 2 500 000 FCFA et un stock valide.' });
    }
    const event = {
      name, kicker: text(input.kicker, 80), description: text(input.description, 220),
      experienceDescription: text(input.experienceDescription, 260), dateLabel: text(input.dateLabel, 80),
      city: text(input.city, 80), venue: text(input.venue, 120), contactEmail: text(input.contactEmail, 180),
      contactPhone: text(input.contactPhone, 30), isDemo: Boolean(input.isDemo), published: Boolean(input.published)
    };
    const sql = db();
    await sql`INSERT INTO event_config(id,data,updated_at) VALUES('main',${JSON.stringify(event)}::jsonb,now())
      ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()`;
    for (const ticket of tickets) {
      await sql`INSERT INTO ticket_types(id,name,label,description,price,capacity,active,featured,updated_at)
        VALUES(${text(ticket.id,70)},${text(ticket.name,60)},${text(ticket.label,60)},${text(ticket.description,150)},${Number(ticket.price)},${Number(ticket.capacity)},${Boolean(ticket.active)},${Boolean(ticket.featured)},now())
        ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,label=EXCLUDED.label,description=EXCLUDED.description,
          price=EXCLUDED.price,capacity=GREATEST(EXCLUDED.capacity,ticket_types.sold+ticket_types.reserved),
          active=EXCLUDED.active,featured=EXCLUDED.featured,updated_at=now()`;
    }
    return json(res, 200, { saved: true });
  } catch (error) {
    console.error('Enregistrement de l’évènement impossible:', error?.message || error);
    return json(res, 500, { error: 'Les changements n’ont pas été enregistrés.' });
  }
};
