const qs = new URLSearchParams(location.search);
const orderId = qs.get('o') || qs.get('order');
const accessKey = qs.get('k') || qs.get('key');
const $ = (s) => document.querySelector(s);
const arrowIcon = '<svg class="icon icon-small" aria-hidden="true" viewBox="0 0 24 24"><path d="M7 17 17 7M7 7h10v10"/></svg>';
let attempts = 0;
let timer;
async function check() {
  if (!orderId || !accessKey) return showError('Ce lien de réservation est incomplet. Retournez à la page de l’évènement et vérifiez votre commande.');
  attempts += 1;
  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}?key=${encodeURIComponent(accessKey)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Impossible de retrouver cette réservation.');
    if (data.status === 'paid') {
      clearInterval(timer);
      $('#status-loader').hidden = true; $('#status-icon').hidden = false;
      $('#status-eyebrow').textContent = 'PAIEMENT CONFIRMÉ';
      $('#status-title').innerHTML = 'Votre place est<br><em>réservée.</em>';
      $('#status-message').textContent = 'Votre billet numérique est prêt. Ouvrez chaque billet et présentez son QR code à l’entrée.';
      $('#status-tickets').innerHTML = (data.tickets || []).map((ticket, index) => `<a class="ticket-link" href="ticket.html?code=${encodeURIComponent(ticket.code || ticket)}"><strong>Billet ${String(index + 1).padStart(2, '0')}</strong><b>Ouvrir ${arrowIcon}</b></a>`).join('');
      return;
    }
    if (['failed', 'expired', 'cancelled'].includes(data.status)) {
      clearInterval(timer); $('#status-loader').hidden = true;
      $('#status-eyebrow').textContent = 'PAIEMENT NON CONFIRMÉ';
      $('#status-title').innerHTML = 'La réservation<br><em>n’est pas finalisée.</em>';
      $('#status-message').textContent = data.status === 'expired' ? 'Le délai de paiement est dépassé. Retournez à l’évènement pour recommencer.' : 'La transaction n’a pas été confirmée par CinetPay. Vérifiez votre compte mobile money avant de réessayer.';
      return;
    }
    $('#status-message').textContent = 'Nous attendons la confirmation de CinetPay. Si une demande apparaît sur votre téléphone, vérifiez le montant et confirmez-la.';
  } catch (error) {
    if (attempts > 6) $('#status-message').textContent = `${error.message} Vous pouvez recharger cette page dans quelques instants.`;
  }
}
function showError(message) { $('#status-loader').hidden = true; $('#status-title').innerHTML = 'Lien de commande<br><em>introuvable.</em>'; $('#status-message').textContent = message; }
check(); timer = setInterval(check, 5000);
