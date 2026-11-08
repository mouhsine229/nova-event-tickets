# NOVA — billetterie pour un évènement

Site de vente de billets en français, conçu pour un seul évènement et prêt à être relié à GitHub et Vercel. L’identité visuelle est volontairement démonstrative : remplacez le nom, la date, le lieu, les prix et les stocks avant d’ouvrir les ventes.

## Ce qui est inclus

- Page publique responsive avec formules de billets et quantité.
- Paiement MTN MoMo ou Moov Money, avec les deux marques visibles et choix du réseau.
- Initialisation des paiements côté serveur par CinetPay pour le Bénin (`MTN_BJ` / `MOOV_BJ`, canal PUSH). Les clés ne sont jamais envoyées au navigateur.
- Confirmation automatique via la notification CinetPay et consultation sécurisée du statut du paiement.
- Réservation temporaire du stock, billets individuels avec QR code, page de billet imprimable et contrôle des entrées.
- Espace organisateur protégé pour modifier l’évènement et les billets, voir les ventes et valider les entrées.
- Envoi des billets par e-mail facultatif quand un serveur SMTP est configuré.
- Pages de conditions de vente et de confidentialité avec champs de l’organisateur à compléter.
- Police système classique, palette colorée et icônes SVG en ligne basées sur Lucide, sans dépendance CDN.

## Pourquoi la base est nécessaire

Le site utilise PostgreSQL hébergé par Neon. La base conserve les commandes, le stock réservé et vendu, le statut CinetPay, les billets émis et les entrées déjà contrôlées. C’est ce qui permet au webhook de retrouver la bonne commande, d’ignorer une notification répétée et de ne pas émettre deux fois le même billet. Une base locale ou le disque d’une fonction Vercel ne conviennent pas à ces données persistantes. Vercel propose les bases PostgreSQL via ses intégrations Marketplace ; l’ancienne offre Vercel Postgres n’est plus proposée pour les nouveaux projets. Voir la [documentation Vercel sur PostgreSQL](https://vercel.com/docs/postgres) et l’[intégration Neon pour Vercel](https://vercel.com/integrations/neon).

## Mise en place

1. Créez un projet PostgreSQL Neon depuis le Marketplace Vercel et ajoutez `DATABASE_URL` aux variables d’environnement du projet.
2. Ouvrez l’éditeur SQL Neon et exécutez une fois le contenu de `schema.sql`. Trois formules et un évènement d’exemple seront ajoutés; l’évènement reste non publié.
3. Dans CinetPay, configurez les identifiants marchand du Bénin et ajoutez l’URL de notification `https://VOTRE-DOMAINE/api/webhooks/cinetpay`. Les méthodes disponibles dans le code sont MTN Bénin et Moov Bénin.
4. Ajoutez dans Vercel les variables listées dans `.env.example` : `CINETPAY_API_KEY`, `CINETPAY_API_PASSWORD`, `SITE_URL`, `ADMIN_PASSWORD` et `ADMIN_SESSION_SECRET`. Les deux clés CinetPay doivent rester des variables serveur, jamais des variables préfixées `NEXT_PUBLIC_`.
5. Importez le dossier `evenement-tickets` comme projet dans GitHub puis reliez ce dépôt à Vercel. Le projet sert des fichiers statiques et des fonctions `api/`; aucun build frontend n’est nécessaire. Vercel peut lancer le projet localement avec `npm run dev`.
6. Ouvrez `/admin.html`, connectez-vous avec `ADMIN_PASSWORD`, remplacez les données d’exemple et les formules, cochez « J’ai remplacé les informations d’exemple », puis publiez lorsque les clés et le webhook CinetPay sont prêts.
7. Pour envoyer automatiquement les billets par e-mail, renseignez les variables SMTP du fichier `.env.example`. Sans SMTP, le billet QR reste accessible dans la page de confirmation de commande.

## Variables serveur

| Variable | Obligatoire | Utilité |
|---|---:|---|
| `DATABASE_URL` | Oui | Connexion PostgreSQL Neon |
| `CINETPAY_API_KEY` | Oui avant vente | Clé API CinetPay du marchand béninois |
| `CINETPAY_API_PASSWORD` | Oui avant vente | Mot de passe API CinetPay |
| `SITE_URL` | Oui avant vente | URL HTTPS publique du site, sans slash final |
| `ADMIN_PASSWORD` | Oui | Mot de passe de l’organisateur |
| `ADMIN_SESSION_SECRET` | Oui | Secret aléatoire long pour signer la session organisateur |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Facultatif | Livraison des billets par e-mail |

## Paiement et sécurité

Le navigateur envoie le type de billet et la quantité; le serveur relit le tarif en base et réserve le stock avant l’appel CinetPay. Les billets ne sont créés qu’après une confirmation serveur du statut. La notification reçue est vérifiée, puis le statut est redemandé à CinetPay avant de marquer la commande comme payée. Le détail des appels et méthodes est documenté dans le [SDK JavaScript officiel CinetPay](https://github.com/cinetpay/cinetpay-js).

Les commandes sans statut final de CinetPay gardent leur stock réservé; le site ne libère pas une place tant que CinetPay ne confirme pas un échec ou une expiration. Le panier accepte 1 à 10 billets d’une même formule par commande, et le montant est limité au plafond du SDK CinetPay.

## Aperçu local

La page `/` affiche un aperçu de démonstration tant que la base n’est pas renseignée. Trois cartes d’évènements fictifs montrent aussi le rendu d’une vitrine plus large; elles ne lancent pas de commande. Le paiement réel reste rattaché à l’unique évènement configuré dans l’espace organisateur. Les paiements restent bloqués tant que cet évènement n’est pas personnalisé et publié. Après la création de la base et l’exécution de `schema.sql`, utilisez `/admin.html` pour personnaliser l’évènement.
