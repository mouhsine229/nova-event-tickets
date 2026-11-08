const $ = (s) => document.querySelector(s);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = (amount) => `${new Intl.NumberFormat('fr-FR').format(Number(amount) || 0)} FCFA`;
const closeIcon = '<svg class="icon icon-small" aria-hidden="true" viewBox="0 0 24 24"><path d="m18 6-12 12M6 6l12 12"/></svg>';
let dashboardData;
let scannerStream;
let scanLoop;

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Une erreur est survenue.');
  return data;
}

async function checkSession() {
  try { const data = await api('/api/admin/session'); if (data.authenticated) showDashboard(); }
  catch (_) { /* the login panel remains visible */ }
}

async function showDashboard() {
  $('#login-panel').hidden = true; $('#dashboard').hidden = false; $('#logout').hidden = false;
  await loadDashboard();
}

async function loadDashboard() {
  try {
    dashboardData = await api('/api/admin/overview');
    renderDashboard();
  } catch (error) {
    if (/connexion|connectez|autorisé|autorise/i.test(error.message)) { $('#login-panel').hidden = false; $('#dashboard').hidden = true; }
    else showMessage($('#event-message'), error.message, true);
  }
}

function renderDashboard() {
  const { event, tickets = [], summary = {}, orders = [], cinetpayReady } = dashboardData;
  $('#setup-alert').hidden = Boolean(!event.isDemo && event.published && cinetpayReady);
  if (!$('#setup-alert').hidden) $('#setup-alert').textContent = event.isDemo ? 'Configuration incomplète : remplacez les données d’exemple avant d’ouvrir les ventes.' : !cinetpayReady ? 'CinetPay n’est pas encore configuré. Ajoutez vos clés de test et de production dans les variables serveur.' : 'La page publique n’est pas encore ouverte.';
  $('#stats').innerHTML = `<article><span>VENTES CONFIRMÉES</span><strong>${Number(summary.paidOrders || 0)}</strong><small>commandes payées</small></article><article><span>PLACES ÉMISES</span><strong>${Number(summary.ticketsSold || 0)}</strong><small>billets confirmés</small></article><article><span>RECETTES</span><strong>${money(summary.revenue || 0)}</strong><small>paiements confirmés</small></article>`;
  const form = $('#event-form');
  ['name','kicker','description','experienceDescription','dateLabel','city','venue','contactEmail','contactPhone'].forEach((key) => { if (form.elements[key]) form.elements[key].value = event[key] || ''; });
  form.elements.isDemo.checked = Boolean(event.isDemo); form.elements.published.checked = Boolean(event.published);
  $('#mtn-state').textContent = cinetpayReady ? 'Prêt' : 'En attente'; $('#moov-state').textContent = cinetpayReady ? 'Prêt' : 'En attente';
  renderTicketEditor(tickets); renderOrders(orders);
}

function renderTicketEditor(tickets) {
  $('#ticket-editor').innerHTML = tickets.map((ticket) => `<article class="ticket-editor-row" data-id="${escapeHtml(ticket.id)}"><div class="ticket-editor-top"><strong>${escapeHtml(ticket.name || 'Nouvelle formule')}</strong><button type="button" class="ticket-remove-toggle" aria-label="Désactiver cette formule">${closeIcon}</button></div><div class="admin-field-grid"><label>Nom<input data-field="name" maxlength="60" value="${escapeHtml(ticket.name)}" required></label><label>Accroche<input data-field="label" maxlength="60" value="${escapeHtml(ticket.label)}"></label></div><label>Description<input data-field="description" maxlength="150" value="${escapeHtml(ticket.description)}"></label><div class="admin-field-grid"><label>Prix (FCFA)<input data-field="price" type="number" min="100" step="100" value="${Number(ticket.price) || 0}" required></label><label>Stock total<input data-field="capacity" type="number" min="1" step="1" value="${Number(ticket.capacity) || 1}" required></label></div><div class="ticket-editor-flags"><label><input data-field="active" type="checkbox" ${ticket.active ? 'checked' : ''}> En vente</label><label><input data-field="featured" type="checkbox" ${ticket.featured ? 'checked' : ''}> Mise en avant</label><span>${Number(ticket.sold || 0)} vendu(s) · ${Number(ticket.reserved || 0)} en cours</span></div></article>`).join('');
  $('#ticket-editor').querySelectorAll('.ticket-remove-toggle').forEach((button) => button.addEventListener('click', () => {
    const row = button.closest('.ticket-editor-row');
    const removed = row.dataset.remove !== 'true';
    row.dataset.remove = String(removed); row.classList.toggle('ticket-editor-disabled', removed);
    button.innerHTML = removed ? 'Réactiver' : closeIcon;
  }));
}

function readTicketEditor() {
  return [...$('#ticket-editor').querySelectorAll('.ticket-editor-row')].map((row) => {
    const value = (key) => row.querySelector(`[data-field="${key}"]`);
    return { id: row.dataset.id, name: value('name').value.trim(), label: value('label').value.trim(), description: value('description').value.trim(), price: Number(value('price').value), capacity: Number(value('capacity').value), active: value('active').checked && row.dataset.remove !== 'true', featured: value('featured').checked };
  });
}

function renderOrders(orders) {
  const body = $('#orders-body');
  if (!orders.length) { body.innerHTML = '<tr><td colspan="5" class="orders-empty">Aucune commande pour le moment.</td></tr>'; return; }
  body.innerHTML = orders.map((order) => `<tr><td><strong>${escapeHtml(order.buyerName)}</strong><small>${escapeHtml(order.email)}</small></td><td>${escapeHtml(order.ticketName)} x ${Number(order.quantity)}</td><td>${money(order.amount)}</td><td><span class="order-status ${escapeHtml(order.status)}">${escapeHtml({ paid: 'Payée', pending: 'En attente', failed: 'Échec', expired: 'Expirée', cancelled: 'Annulée' }[order.status] || order.status)}</span></td><td>${new Date(order.createdAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</td></tr>`).join('');
}

function showMessage(node, message, isError = false) { node.textContent = message; node.hidden = false; node.classList.toggle('is-error', isError); }

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true;
  try { await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: event.currentTarget.elements.password.value }) }); await showDashboard(); }
  catch (error) { showMessage($('#login-error'), error.message, true); }
  finally { button.disabled = false; }
});

$('#logout').addEventListener('click', async () => { try { await api('/api/admin/logout', { method: 'POST', body: '{}' }); } finally { location.reload(); } });

$('#event-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('[type=submit]'); button.disabled = true;
  const body = Object.fromEntries(new FormData(form).entries()); body.isDemo = form.elements.isDemo.checked; body.published = form.elements.published.checked; body.tickets = readTicketEditor();
  try { await api('/api/admin/event', { method: 'POST', body: JSON.stringify(body) }); showMessage($('#event-message'), 'Modifications enregistrées.'); await loadDashboard(); }
  catch (error) { showMessage($('#event-message'), error.message, true); }
  finally { button.disabled = false; }
});

$('#add-ticket').addEventListener('click', () => {
  const id = `ticket-${Math.random().toString(36).slice(2, 9)}`;
  const tickets = [...readTicketEditor(), { id, name: 'Nouvelle formule', label: 'FORMULE', description: '', price: 5000, capacity: 100, sold: 0, reserved: 0, active: true, featured: false }];
  renderTicketEditor(tickets);
  $('#ticket-editor').lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

$('#refresh-orders').addEventListener('click', loadDashboard);

$('#checkin-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('[type=submit]'); button.disabled = true;
  const rawCode = form.elements.code.value.trim(); const urlMatch = rawCode.match(/[?&]code=([^&]+)/); const code = urlMatch ? decodeURIComponent(urlMatch[1]) : rawCode;
  try { const result = await api('/api/admin/checkin', { method: 'POST', body: JSON.stringify({ code }) }); showMessage($('#checkin-message'), `${result.ticketType} · ${result.buyerName} — entrée validée.`); form.elements.code.value = ''; }
  catch (error) { showMessage($('#checkin-message'), error.message, true); }
  finally { button.disabled = false; form.elements.code.focus(); }
});

async function stopScanner() { if (scanLoop) cancelAnimationFrame(scanLoop); if (scannerStream) scannerStream.getTracks().forEach((track) => track.stop()); scannerStream = null; $('#scanner-video').hidden = true; $('#camera-button').textContent = 'Ouvrir le scanner'; }
$('#camera-button').addEventListener('click', async (event) => {
  const video = $('#scanner-video');
  if (scannerStream) { await stopScanner(); return; }
  if (!('BarcodeDetector' in window)) { showMessage($('#checkin-message'), 'Le scan caméra n’est pas pris en charge sur ce navigateur. Un lecteur QR USB ou la saisie du code fonctionne aussi.', true); return; }
  try {
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); video.srcObject = scannerStream; video.hidden = false; await video.play(); event.currentTarget.textContent = 'Fermer le scanner';
    const scan = async () => { if (!scannerStream) return; try { const codes = await detector.detect(video); if (codes[0]) { $('#checkin-form').elements.code.value = codes[0].rawValue; await stopScanner(); $('#checkin-form').requestSubmit(); return; } } catch (_) { /* continue scanning */ } scanLoop = requestAnimationFrame(scan); };
    scan();
  } catch (error) { showMessage($('#checkin-message'), `Accès caméra indisponible : ${error.message}`, true); await stopScanner(); }
});

checkSession();
