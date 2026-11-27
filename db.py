import sqlite3

DATABASE_NAME = 'dispensa.db'

def get_db_connection():
    """
    Crea e restituisce la connessione al database SQLite,
    impostando sqlite3.Row per accedere ai campi tramite il nome delle colonne.
    """
    conn = sqlite3.connect(DATABASE_NAME)
    conn.row_factory = sqlite3.Row
    """risultati  restituiti come dizionari row['year']"""
    return conn

def init_db():
    """
    Inizializza la struttura del database eseguendo lo script schema.sql.
    """
    conn = get_db_connection()
    with open('schema.sql', 'r', encoding='utf-8') as f:
        conn.executescript(f.read())
    conn.commit()
    conn.close()

if __name__ == '__main__':
    # Eseguendo 'python db.py' direttamente, crea il file dispensa.db sul disco
    init_db()
    print("Database creato e tabelle inizializzate con successo.")