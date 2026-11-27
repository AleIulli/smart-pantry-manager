-- Tabella principale dei prodotti in dispensa
CREATE TABLE IF NOT EXISTS pantry_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    expiration_date DATE NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_size TEXT,
    barcode TEXT,
    status TEXT NOT NULL DEFAULT 'in_pantry',
    updated_at DATE NOT NULL DEFAULT (DATE('now')) --per utilità, non si visualizza
);

-- Tabella per l'aggregazione dello storico mensile
CREATE TABLE IF NOT EXISTS monthly_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    total_consumed INTEGER NOT NULL DEFAULT 0,
    total_wasted INTEGER NOT NULL DEFAULT 0,
    UNIQUE(year, month)
);

-- Tabella per il salvataggio delle ricette
CREATE TABLE IF NOT EXISTS saved_recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    ingredients TEXT NOT NULL,
    instructions TEXT NOT NULL
);