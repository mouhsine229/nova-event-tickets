const demoEvent = {
  name: 'Les nuits qui nous rassemblent.',
  kicker: 'LE RENDEZ-VOUS À NE PAS MANQUER',
  description: 'Une soirée, des rencontres, des souvenirs qui restent. Retrouvez-nous pour vivre l’évènement autrement.',
  experienceDescription: 'Venez comme vous êtes, repartez avec une histoire à raconter. Une scène vivante, une ambiance soignée et toute la place pour profiter du moment.',
  dateLabel: 'Date à annoncer', city: 'Cotonou, Bénin', venue: 'Lieu à annoncer',
  contactEmail: '', contactPhone: '', isDemo: true, published: false,
  tickets: [
    { id: 'early-bird', name: 'Prévente', label: 'PETIT PRIX, GRAND MOMENT', description: 'Accès général à l’évènement. Quantités limitées.', price: 5000, capacity: 200, sold: 0, reserved: 0, active: true, featured: false },
    { id: 'regular', name: 'Entrée standard', label: 'LE CHOIX POPULAIRE', description: 'Accès général et entrée dédiée pour profiter sans attendre.', price: 7500, capacity: 500, sold: 0, reserved: 0, active: true, featured: true },
    { id: 'vip', name: 'Pass VIP', label: 'POUR EN PROFITER PLUS', description: 'Accès prioritaire et espace privilégié pendant la soirée.', price: 15000, capacity: 100, sold: 0, reserved: 0, active: true, featured: false }
  ]
};
let eventData = demoEvent;
let selectedTicket = null;
let selectedQuantity = 1;
let currentOrder = null;
let pollTimer = null;

const $ = (selector) => document.querySelector(selector);
const formatMoney = (value) => `${new Intl.NumberFormat('fr-FR').format(Number(value) || 0)} FCFA`;
const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const arrowIcon = '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M7 17 17 7M7 7h10v10"/></svg>';
const checkIcon = '<svg class="icon icon-small" aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>';
const sparkIcon = '<svg class="icon icon-small" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 2 14.2 9.8 22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2L12 2Z"/></svg>';

async function loadEvent() {
  try {
    const response = await fetch('/api/public-event', { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('API unavailable');
    const payload = await response.json();
    if (payload.event && Array.isArray(payload.tickets)) eventData = { ...payload.event, tickets: payload.tickets, salesEnabled: payload.salesEnabled };
  } catch (_) {
    eventData = { ...demoEvent, salesEnabled: false };
  }
  renderEvent();
}

function renderEvent() {
  const event = eventData;
  document.title = `${event.name || 'Évènement'} — NOVA`;
  $('#event-kicker').textContent = event.kicker || 'LE RENDEZ-VOUS À NE PAS MANQUER';
  $('#event-title').innerHTML = safe(event.name || 'Votre prochain évènement').replace(/\n/g, '<br>');
  $('#event-description').textContent = event.description || demoEvent.description;
  $('#experience-description').textContent = event.experienceDescription || demoEvent.experienceDescription;
  $('#event-date').textContent = (event.dateLabel || 'DATE À ANNONCER').toLocaleUpperCase('fr-FR');
  $('#event-city').textContent = (event.city || 'COTONOU, BÉNIN').toLocaleUpperCase('fr-FR');
  $('#info-date').textContent = event.dateLabel || 'Date à annoncer';
  $('#info-venue').textContent = event.venue || 'Lieu à annoncer';
  $('#info-city').textContent = event.city || 'Cotonou, Bénin';
  if (event.contactEmail) $('#contact-link').href = `mailto:${encodeURIComponent(event.contactEmail)}`;
  if (event.isDemo || !event.published) {
    const banner = $('#announcement');
    banner.textContent = 'APERÇU DE DÉMONSTRATION — personnalisez les informations et ouvrez les ventes dans l’espace organisateur.';
    banner.hidden = false;
  }
  renderTickets();
}

function renderTickets() {
  const container = $('#ticket-grid');
  const tickets = (eventData.tickets || []).filter((ticket) => ticket.active !== false);
  if (!tickets.length) {
    container.innerHTML = '<p class="empty-tickets">Les billets seront bientôt disponibles.</p>';
    return;
  }
  container.innerHTML = tickets.map((ticket, index) => {
    const available = Math.max(0, Number(ticket.capacity || 0) - Number(ticket.sold || 0) - Number(ticket.reserved || 0));
    const quantity = selectedTicket?.id === ticket.id ? selectedQuantity : 0;
    const unavailable = available === 0;
    return `<article class="ticket-card ${ticket.featured ? 'featured' : ''}" data-id="${safe(ticket.id)}">
      <div class="ticket-topline"><span class="ticket-label">${safe(ticket.label || `FORMULE 0${index + 1}`)}</span>${ticket.featured ? '<span class="ticket-badge">POPULAIRE</span>' : ''}</div>
      <h3 class="ticket-name">${safe(ticket.name)}</h3><p class="ticket-description">${safe(ticket.description || '')}</p>
      <div class="ticket-price">${formatMoney(ticket.price)} <small>/ personne</small></div>
      <div class="ticket-bottom"><span class="ticket-stock">${unavailable ? 'Complet' : `${available} places disponibles`}</span>
        <div class="quantity-control" aria-label="Quantité de ${safe(ticket.name)}"><button type="button" data-action="minus" aria-label="Retirer une place" ${quantity === 0 || unavailable ? 'disabled' : ''}><svg class="icon icon-small" aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button><strong>${quantity || '0'}</strong><button type="button" data-action="plus" aria-label="Ajouter une place" ${unavailable ? 'disabled' : ''}><svg class="icon icon-small" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button></div>
      </div></article>`;
  }).join('');
  container.querySelectorAll('.ticket-card').forEach((card) => {
    card.addEventListener('click', (event) => {
      const action = event.target.closest('button')?.dataset.action;
      if (!action) return;
      const ticket = tickets.find((item) => item.id === card.dataset.id);
      const available = Math.max(0, Number(ticket.capacity || 0) - Number(ticket.sold || 0) - Number(ticket.reserved || 0));
      if (action === 'plus') {
        if (selectedTicket?.id !== ticket.id) selectedQuantity = 0;
        selectedTicket = ticket;
        selectedQuantity = Math.min(selectedQuantity + 1, Math.min(available, 10));
      } else if (selectedTicket?.id === ticket.id) {
        selectedQuantity -= 1;
        if (selectedQuantity <= 0) selectedTicket = null;
      }
      renderTickets();
    });
  });
  const footer = document.querySelector('.ticket-footnote');
  footer.innerHTML = eventData.salesEnabled
    ? `${checkIcon} Billet numérique envoyé dès confirmation du paiement <span class="footnote-divider">·</span> Paiement sécurisé par CinetPay`
    : `${sparkIcon} Les ventes seront activées après la configuration de l’évènement et de CinetPay.`;
  const checkout = $('#ticket-checkout');
  checkout.disabled = !selectedTicket || selectedQuantity < 1;
  $('#ticket-checkout-label').textContent = selectedTicket ? `${selectedQuantity} place${selectedQuantity > 1 ? 's' : ''} · ${formatMoney(selectedTicket.price * selectedQuantity)}` : '— choisissez vos billets';
}

function openCheckout() {
  if (!selectedTicket || selectedQuantity < 1) {
    $('#billets').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  const modal = $('#checkout-modal');
  $('#order-summary').innerHTML = `<strong>${safe(selectedQuantity)} × ${safe(selectedTicket.name)}</strong><span>${formatMoney(selectedTicket.price * selectedQuantity)}</span>`;
  $('#checkout-form').hidden = false;
  $('#payment-wait').hidden = true;
  $('#checkout-success').hidden = true;
  $('#checkout-error').hidden = true;
  document.body.classList.add('modal-open');
  modal.hidden = false;
  setTimeout(() => $('#checkout-form input[name="firstName"]').focus(), 60);
}

function closeCheckout() {
  $('#checkout-modal').hidden = true;
  document.body.classList.remove('modal-open');
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function showError(message) {
  const error = $('#checkout-error');
  error.textContent = message;
  error.hidden = false;
}

async function createOrder(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  const phoneDigits = String(values.phone || '').replace(/\D/g, '');
  const phone = phoneDigits.startsWith('229') ? `+${phoneDigits}` : `+229${phoneDigits}`;
  const button = $('#pay-button');
  button.disabled = true;
  button.innerHTML = '<span>Connexion sécurisée…</span><i class="button-loader" aria-hidden="true"></i>';
  $('#checkout-error').hidden = true;
  try {
    const response = await fetch('/api/orders', {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        firstName: values.firstName, lastName: values.lastName, email: values.email,
        phone, paymentMethod: values.paymentMethod, ticketTypeId: selectedTicket.id, quantity: selectedQuantity
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Le paiement est momentanément indisponible. Réessayez dans quelques instants.');
    currentOrder = { id: result.orderId, accessKey: result.accessKey, paymentMethod: values.paymentMethod, amount: selectedTicket.price * selectedQuantity };
    if (result.paymentUrl) {
      window.location.href = result.paymentUrl;
      return;
    }
    $('#checkout-form').hidden = true;
    $('#payment-wait').hidden = false;
    $('#wait-total').textContent = formatMoney(currentOrder.amount);
    $('#checkout-title').textContent = 'Dernière étape';
    pollOrder();
    pollTimer = setInterval(pollOrder, 5000);
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = `<span>Continuer vers le paiement</span><b>${arrowIcon}</b>`;
  }
}

async function pollOrder() {
  if (!currentOrder) return;
  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(currentOrder.id)}?key=${encodeURIComponent(currentOrder.accessKey)}`, { headers: { accept: 'application/json' } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Statut indisponible');
    if (data.status === 'paid') {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      renderSuccess(data);
    } else if (['failed', 'expired', 'cancelled'].includes(data.status)) {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      $('#wait-hint').textContent = data.status === 'expired' ? 'Le délai de paiement est dépassé. Fermez cette fenêtre et recommencez votre réservation.' : 'Le paiement n’a pas abouti. Vérifiez votre compte mobile money puis recommencez.';
      $('#wait-hint').classList.add('form-error');
    }
  } catch (_) {
    $('#wait-hint').textContent = 'Nous vérifions toujours la confirmation auprès de CinetPay…';
  }
}

function renderSuccess(data) {
  $('#payment-wait').hidden = true;
  const codes = Array.isArray(data.tickets) ? data.tickets : [];
  $('#checkout-success').innerHTML = `<div class="success-icon">${checkIcon}</div><p class="eyebrow dark-eyebrow">PAIEMENT CONFIRMÉ</p><h3>Votre place est<br><em>réservée.</em></h3><p>Présentez votre billet numérique à l’entrée de l’évènement. Vous pouvez l’ouvrir ou l’imprimer à tout moment.</p><div class="ticket-links">${codes.map((ticket, index) => `<a class="ticket-link" href="ticket.html?code=${encodeURIComponent(ticket.code || ticket)}" target="_blank" rel="noopener"><strong>Billet ${String(index + 1).padStart(2, '0')}</strong><b>Ouvrir ${arrowIcon}</b></a>`).join('')}</div><div class="success-actions"><button class="button button-dark" id="print-ticket" type="button">Imprimer la commande</button><button class="button button-outline" id="success-close" type="button">Terminer</button></div>`;
  $('#checkout-success').hidden = false;
  $('#print-ticket').addEventListener('click', () => window.print());
  $('#success-close').addEventListener('click', closeCheckout);
}

$('#checkout-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!eventData.salesEnabled) {
    showError('Les ventes ne sont pas encore ouvertes. L’organisateur doit terminer la configuration de l’évènement et activer les paiements.');
    return;
  }
  createOrder(event.currentTarget);
});
$('#close-checkout').addEventListener('click', closeCheckout);
$('#checkout-modal').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeCheckout(); });
$('#check-status').addEventListener('click', pollOrder);
$('#ticket-checkout').addEventListener('click', openCheckout);
document.querySelectorAll('a[href="#billets"]').forEach((link) => link.addEventListener('click', (event) => {
  if (link.classList.contains('button') && selectedTicket) { event.preventDefault(); openCheckout(); }
}));
document.querySelector('.header-cta').addEventListener('click', (event) => {
  if (selectedTicket) { event.preventDefault(); openCheckout(); }
});
$('#menu-toggle').addEventListener('click', (event) => {
  const nav = $('.main-nav');
  const open = nav.classList.toggle('open');
  event.currentTarget.setAttribute('aria-expanded', String(open));
});
$('.main-nav').querySelectorAll('a').forEach((link) => link.addEventListener('click', () => $('.main-nav').classList.remove('open')));
$('#year').textContent = new Date().getFullYear();
loadEvent();
