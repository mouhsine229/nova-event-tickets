-- Base à exécuter une fois dans l’éditeur SQL Neon.
CREATE TABLE IF NOT EXISTS event_config (
  id text PRIMARY KEY DEFAULT 'main',
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_types (
  id text PRIMARY KEY,
  name text NOT NULL,
  label text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  price integer NOT NULL CHECK (price >= 100),
  capacity integer NOT NULL CHECK (capacity >= 0),
  sold integer NOT NULL DEFAULT 0 CHECK (sold >= 0),
  reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  active boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  ticket_type_id text NOT NULL REFERENCES ticket_types(id),
  ticket_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  buyer_name text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('MTN_BJ', 'MOOV_BJ')),
  amount integer NOT NULL CHECK (amount >= 100),
  currency text NOT NULL DEFAULT 'XOF',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'cancelled')),
  provider_transaction_id text,
  payment_url text,
  notify_token text,
  access_token_hash text NOT NULL,
  webhook_secret_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  paid_at timestamptz,
  status_checked_at timestamptz,
  email_sending_at timestamptz,
  email_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_status_expires_idx ON orders(status, expires_at);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders(created_at DESC);

CREATE TABLE IF NOT EXISTS tickets (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id),
  ticket_type_id text NOT NULL REFERENCES ticket_types(id),
  ticket_name text NOT NULL,
  ticket_code text NOT NULL UNIQUE,
  buyer_name text NOT NULL,
  status text NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'checked_in', 'cancelled')),
  checked_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tickets_order_idx ON tickets(order_id);

-- Valeurs de démonstration : remplacez-les dans l’espace organisateur avant la mise en vente.
INSERT INTO event_config (id, data) VALUES ('main', '{
  "name":"Les nuits qui nous rassemblent.",
  "kicker":"LE RENDEZ-VOUS À NE PAS MANQUER",
  "description":"Une soirée, des rencontres, des souvenirs qui restent. Retrouvez-nous pour vivre l’évènement autrement.",
  "experienceDescription":"Venez comme vous êtes, repartez avec une histoire à raconter. Une scène vivante, une ambiance soignée et toute la place pour profiter du moment.",
  "dateLabel":"Date à annoncer",
  "city":"Cotonou, Bénin",
  "venue":"Lieu à annoncer",
  "contactEmail":"",
  "contactPhone":"",
  "isDemo":true,
  "published":false
}') ON CONFLICT (id) DO NOTHING;

INSERT INTO ticket_types (id, name, label, description, price, capacity, active, featured) VALUES
  ('early-bird', 'Prévente', 'PETIT PRIX, GRAND MOMENT', 'Accès général à l’évènement. Quantités limitées.', 5000, 200, true, false),
  ('regular', 'Entrée standard', 'LE CHOIX POPULAIRE', 'Accès général et entrée dédiée pour profiter sans attendre.', 7500, 500, true, true),
  ('vip', 'Pass VIP', 'POUR EN PROFITER PLUS', 'Accès prioritaire et espace privilégié pendant la soirée.', 15000, 100, true, false)
ON CONFLICT (id) DO NOTHING;
