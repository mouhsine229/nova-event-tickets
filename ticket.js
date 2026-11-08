const code = new URLSearchParams(location.search).get('code');
const view = document.querySelector('#ticket-view');
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const arrowIcon = '<svg class="icon icon-small" aria-hidden="true" viewBox="0 0 24 24"><path d="M7 17 17 7M7 7h10v10"/></svg>';
const checkIcon = '<svg class="icon icon-small" aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>';
async function load() {
  if (!code) throw new Error('Le code de ce billet est manquant.');
  const response = await fetch(`/api/tickets/${encodeURIComponent(code)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Ce billet est introuvable.');
  document.title = `${data.ticketType} — Billet NOVA`;
  view.innerHTML = `<div class="digital-ticket-top"><span class="ticket-mini-brand"><span class="brand-mark">N</span> NOVA</span><span class="ticket-status-pill">${checkIcon} CONFIRMÉ</span></div><div class="digital-ticket-main"><div><p class="eyebrow dark-eyebrow">${escapeHtml(data.event.kicker || 'BILLET ÉVÈNEMENT')}</p><h1>${escapeHtml(data.event.name || 'Votre évènement')}</h1><p class="digital-ticket-type">${escapeHtml(data.ticketType)}</p></div><div class="ticket-qr"><img src="/api/ticket-qr?code=${encodeURIComponent(code)}" alt="QR code de vérification du billet"><small>À PRÉSENTER À L’ENTRÉE</small></div></div><div class="digital-ticket-details"><div><span>PARTICIPANT·E</span><strong>${escapeHtml(data.buyerName)}</strong></div><div><span>DATE</span><strong>${escapeHtml(data.event.dateLabel || 'À annoncer')}</strong></div><div><span>LIEU</span><strong>${escapeHtml(data.event.venue || data.event.city || 'À annoncer')}</strong></div></div><div class="digital-ticket-code"><span>CODE BILLET</span><strong>${escapeHtml(data.code)}</strong><button id="copy-code" type="button">Copier</button></div><div class="digital-ticket-actions"><button class="button button-dark" onclick="window.print()">Imprimer le billet ${arrowIcon}</button><a class="button button-outline" href="index.html">Retour à l’évènement ${arrowIcon}</a></div>`;
  document.querySelector('#copy-code').addEventListener('click', async (event) => { await navigator.clipboard?.writeText(data.code); event.currentTarget.textContent = 'Code copié'; });
}
load().catch((error) => { view.innerHTML = `<div class="ticket-error"><div class="success-icon"><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5m0 3h.01"/></svg></div><h1>Billet indisponible</h1><p>${escapeHtml(error.message)}</p><a class="button button-dark" href="index.html">Retour à l’évènement ${arrowIcon}</a></div>`; });
