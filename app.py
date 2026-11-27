import re
import os
import _json
import requests
from flask import Flask, render_template, request, redirect, url_for, jsonify
from datetime import date, timedelta
from db import get_db_connection
import random
from dotenv import load_dotenv

load_dotenv()  # Carica le variabili dal file .env

SPOONACULAR_API_KEY = os.getenv("SPOON_API_KEY")
app = Flask(__name__)

def process_pantry_lifecycle():
    """
    Gestisce il ciclo di vita automatico dei cibi:
    1. Individua i prodotti scaduti da oltre 7 giorni e li marca automaticamente come 'wasted'.
    2. Aggrega tutti i cibi 'consumed' e 'wasted' nella tabella monthly_stats.
    3. Rimuove i cibi archiviati dalla tabella attiva pantry_items.
    """
    today = date.today()
    # Data limite oltre la quale scade la finestra di tolleranza di 7 giorni
    cutoff_date = today - timedelta(days=7)
    cutoff_str = cutoff_date.isoformat() #formato AAAA-MM-GG

    conn = get_db_connection()

    # 1. AUTO-SPRECO AUTOMATICO:
    # I cibi non consumati con data di scadenza piu vecchia di 7 giorni fa diventano automaticamente 'wasted'
    conn.execute("""
        UPDATE pantry_items 
        SET status = 'wasted', updated_at = DATE('now')
        WHERE status = 'in_pantry' 
          AND expiration_date < ? 
    """, (cutoff_str,))
    conn.commit()

    # 2. SELEZIONE PRODOTTI DA ARCHIVIARE NELLO STORICO CON funzioni di sqlite strftime
    resolved_items = conn.execute("""
        SELECT id, quantity, status, expiration_date,
               strftime('%Y', expiration_date) AS exp_year,
               strftime('%m', expiration_date) AS exp_month
        FROM pantry_items
        WHERE status IN ('consumed', 'wasted')
    """).fetchall()  #lista di tuple

    if resolved_items:
        # Raggruppamento per Anno e Mese di scadenza con dizionario
        monthly_totals = {}
        for item in resolved_items:
            y = int(item['exp_year'])
            m = int(item['exp_month'])
            key = (y, m)
            #se non esiste gia una chiave
            if key not in monthly_totals:
                monthly_totals[key] = {'consumed': 0, 'wasted': 0, 'ids': []}

            if item['status'] == 'consumed':
                monthly_totals[key]['consumed'] += item['quantity']
            elif item['status'] == 'wasted':
                monthly_totals[key]['wasted'] += item['quantity']

            monthly_totals[key]['ids'].append(item['id'])

        # 3.  aggiornamento stats mensili e pulizia dispensa
        for (year, month), data in monthly_totals.items():
            existing = conn.execute("""
                SELECT id, total_consumed, total_wasted 
                FROM monthly_stats 
                WHERE year = ? AND month = ?
            """, (year, month)).fetchone()

            if existing:
                new_consumed = existing['total_consumed'] + data['consumed']
                new_wasted = existing['total_wasted'] + data['wasted']
                conn.execute("""
                    UPDATE monthly_stats 
                    SET total_consumed = ?, total_wasted = ?
                    WHERE id = ?
                """, (new_consumed, new_wasted, existing['id']))
            else:
                conn.execute("""
                    INSERT INTO monthly_stats (year, month, total_consumed, total_wasted)
                    VALUES (?, ?, ?, ?)
                """, (year, month, data['consumed'], data['wasted']))

            # Rimuove i prodotti processati dalla tabella attiva
            ids = data['ids']
            #?,?,? rispetto a quanti ids
            placeholders = ','.join(['?'] * len(ids))
            conn.execute(f"DELETE FROM pantry_items WHERE id IN ({placeholders})", ids)

        conn.commit()

    conn.close()

# ----------------------------------------------------
# ROTTE DELL'APPLICAZIONE FLASK
# ----------------------------------------------------

@app.route('/')
def index():
    """
    Home Page: esegue l'auto-archiviazione e passa la data odierna per evidenziare i cibi scaduti.
    """
    process_pantry_lifecycle()
    today_str = date.today().isoformat()

    conn = get_db_connection()
    items = conn.execute("""
        SELECT * FROM pantry_items 
        WHERE status = 'in_pantry' 
        ORDER BY expiration_date ASC
    """).fetchall()
    conn.close()

    return render_template('index.html', items=items, today_str=today_str)

@app.route('/add', methods=['POST'])
def add_item():
    """
    CREATE: Inserimento di un nuovo alimento.
    """
    name = request.form['name']
    expiration_date = request.form['expiration_date']
    quantity = request.form.get('quantity', 1, type=int)
    unit_size = request.form.get('unit_size', None)
    barcode = request.form.get('barcode', None)

    conn = get_db_connection()
    conn.execute("""
        INSERT INTO pantry_items (name, expiration_date, quantity, unit_size, barcode)
        VALUES (?, ?, ?, ?, ?)
    """, (name, expiration_date, quantity, unit_size, barcode))
    conn.commit()
    conn.close()
    #ricaricare e ritornare a index
    return redirect(url_for('index'))

@app.route('/update_status/<int:item_id>/<string:new_status>', methods=['POST'])
def update_status(item_id, new_status):
    """
    UPDATE: L'utente marca l'alimento come 'consumed'.
    """
    if new_status in ['consumed', 'wasted']:
        conn = get_db_connection()
        conn.execute("""
            UPDATE pantry_items 
            SET status = ?, updated_at = DATE('now') 
            WHERE id = ?
        """, (new_status, item_id))
        conn.commit()
        conn.close()

    return redirect(url_for('index'))

@app.route('/delete/<int:item_id>', methods=['POST'])
def delete_item(item_id):
    """
    DELETE: Rimozione manuale per errori di inserimento.
    """
    conn = get_db_connection()
    conn.execute("DELETE FROM pantry_items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()

    return redirect(url_for('index'))

@app.route('/api/update/<int:item_id>', methods=['PATCH'])
def update_item(item_id):
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "message": "Nessun dato inviato."}), 400

    conn = get_db_connection()

    # 1. Recupera la quantità attuale dal DB prima della modifica
    current_item = conn.execute(
        "SELECT quantity FROM pantry_items WHERE id = ?",
        (item_id,)
    ).fetchone()

    if not current_item:
        conn.close()
        return jsonify({"success": False, "message": "Prodotto non trovato."}), 404

    allowed_fields = {'name', 'quantity', 'unit_size', 'expiration_date'} #per sicurezza
    set_clauses = []
    values = []
    consumed_diff = 0

    for field, new_val in data.items():
        if field in allowed_fields:
            if field == 'name' and not str(new_val).strip():
                conn.close()
                return jsonify({"success": False, "message": "Il nome non può essere vuoto."}), 400

            if field == 'quantity':
                try:
                    new_val = int(new_val)
                    if new_val <= 0:
                        conn.close()
                        return jsonify({
                            "success": False,
                            "message": "La quantità deve essere almeno 1. Usa 'Consuma' per terminare il prodotto."
                        }), 400
                except ValueError:
                    conn.close()
                    return jsonify({"success": False, "message": "Quantità non valida."}), 400

                # Se la nuova quantità è minore di quella attuale, calcola la differenza consumata
                old_qty = current_item['quantity']
                if new_val < old_qty:
                    consumed_diff = old_qty - new_val

            set_clauses.append(f"{field} = ?")
            values.append(new_val.strip() if isinstance(new_val, str) else new_val)

    if not set_clauses:
        conn.close()
        return jsonify({"success": False, "message": "Nessun campo valido da aggiornare."}), 400

    # 2. Aggiorna solo i campi modificati in pantry_items
    set_clauses.append("updated_at = DATE('now')")
    values.append(item_id)
    query = f"UPDATE pantry_items SET {', '.join(set_clauses)} WHERE id = ?"
    conn.execute(query, values)

    # 3. Se la quantità è diminuita, registra la differenza in monthly_stats
    if consumed_diff > 0:
        now = date.today()
        year, month = now.year, now.month

        existing = conn.execute(
            "SELECT id, total_consumed FROM monthly_stats WHERE year = ? AND month = ?",
            (year, month)
        ).fetchone()

        if existing:
            conn.execute(
                "UPDATE monthly_stats SET total_consumed = ? WHERE id = ?",
                (existing['total_consumed'] + consumed_diff, existing['id'])
            )
        else:
            conn.execute(
                "INSERT INTO monthly_stats (year, month, total_consumed, total_wasted) VALUES (?, ?, ?, 0)",
                (year, month, consumed_diff)
            )

    # Salva entrambe le modifiche insieme su disco
    conn.commit()
    conn.close()

    msg = (
        f"Prodotto aggiornato! (+{consumed_diff} registrati nei consumati)"
        if consumed_diff > 0
        else "Prodotto aggiornato!"
    )
    return jsonify({"success": True, "message": msg}), 200
@app.route('/stats')
def show_stats():
    """
    READ: Recupera lo storico mensile di consumi e sprechi ordinato dal piu recente.
    """
    conn = get_db_connection()
    monthly_data = conn.execute("""
                                SELECT year, month, total_consumed, total_wasted, (total_consumed + total_wasted) AS total_items
                                FROM monthly_stats
                                ORDER BY year DESC, month DESC
                                """).fetchall()
    conn.close()

    return render_template('stats.html', stats=monthly_data)


@app.route('/recipes')
def show_recipes():
    """
    READ: Mostra le ricette e recupera gli ingredienti attualmente in dispensa.
    """
    conn = get_db_connection()
    recipes = conn.execute("SELECT * FROM saved_recipes ORDER BY title ASC").fetchall()

    # Recupera i nomi dei prodotti attualmente disponibili in dispensa
    pantry_items = conn.execute("""
                                SELECT DISTINCT name
                                FROM pantry_items
                                WHERE status = 'in_pantry'
                                """).fetchall()
    conn.close()

    # Lista di stringhe con i nomi dei prodotti in dispensa (in minuscolo per i confronti)
    available_ingredients = [item['name'].lower() for item in pantry_items]

    return render_template('recipes.html', recipes=recipes, available_ingredients=available_ingredients)


@app.route('/add_recipe', methods=['POST'])
def add_recipe():
    """
    CREATE: Inserisce una nuova ricetta nel database.
    """
    title = request.form['title']
    ingredients = request.form['ingredients']
    instructions = request.form['instructions']

    conn = get_db_connection()
    conn.execute("""
                 INSERT INTO saved_recipes (title, ingredients, instructions)
                 VALUES (?, ?, ?)
                 """, (title, ingredients, instructions))
    conn.commit()
    conn.close()

    return redirect(url_for('show_recipes'))


@app.route('/api/stats/<int:year>', methods=['GET'])
def get_yearly_stats(year):
    try:
        db = get_db_connection()

        # Inizializziamo i 12 mesi a 0
        consumed_monthly = [0] * 12
        wasted_monthly = [0] * 12

        # Query per raggruppare per mese e status (usando la data di scadenza/registrazione) e trovare la qt totale in mese e status
        query = """
                SELECT CAST(strftime('%m', expiration_date) AS INTEGER) as month,
                status,
                SUM(quantity) as total_qty
                FROM pantry_items
                WHERE strftime('%Y', expiration_date) = ?
                GROUP BY month, status \
                """
        rows = db.execute(query, (str(year),)).fetchall()
        db.close()

        for row in rows:
            month_idx = row['month'] - 1  # Indice da 0 a 11
            if 0 <= month_idx < 12:
                if row['status'] == 'consumed':
                    consumed_monthly[month_idx] = row['total_qty']
                elif row['status'] in ['wasted', 'expired']:
                    wasted_monthly[month_idx] = row['total_qty']

        return jsonify({
            "success": True,
            "year": year,
            "months": ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"],
            "consumed": consumed_monthly,
            "wasted": wasted_monthly
        })

    except Exception as e:
        print(f"Errore recupero statistiche: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

# ----------------------------------------------------
# API ENDPOINT: GENERATORE RICETTE con spoonacular
# ----------------------------------------------------

@app.route('/api/generate_recipes', methods=['POST'])
def generate_recipes():
    try:
        db = get_db_connection()
        # 1. Recuperiamo esattamente i primi 5 ingredienti in scadenza
        items = db.execute(
            "SELECT name FROM pantry_items WHERE status = 'in_pantry' ORDER BY expiration_date ASC LIMIT 5"
        ).fetchall()
        db.close()
        if not items:
            return jsonify({
                "success": False,
                "message": "Nessun ingrediente disponibile in dispensa!"
            }), 400

        ingredient_names = [item['name'] for item in items]
        ingredients_query = ",".join(ingredient_names)

        # 2. Chiediamo 10 ricette a Spoonacular (ranking=1 per massimizzare gli usati)
        search_url = f"https://api.spoonacular.com/recipes/findByIngredients?ingredients={ingredients_query}&number=10&ranking=1&ignorePantry=true&apiKey={SPOONACULAR_API_KEY}"
        search_response = requests.get(search_url, timeout=10)

        if search_response.status_code != 200:
            return jsonify({
                "success": False,
                "message": f"⚠️ Errore Spoonacular ({search_response.status_code}): controlla l'API Key."
            }), 500
        #lista di dizionari
        recipes_basic = search_response.json()
        if not recipes_basic:
            return jsonify({
                "success": False,
                "message": "Nessuna ricetta trovata con questi ingredienti."
            })

        # Ordinamento a cascata in Python (5 -> 4 -> 3 -> 2 -> 1 ingredienti usati)
        recipes_basic.sort(key=lambda r: len(r.get('usedIngredients', [])), reverse=True)

        # Prendiamo le prime 5 trasmettendole al frontend
        selected_recipes = recipes_basic[:5]

        # 3. Chiamata Bulk solo per i 5 risultati finali tutti insieme
        recipe_ids = [str(r['id']) for r in selected_recipes]
        bulk_url = f"https://api.spoonacular.com/recipes/informationBulk?ids={','.join(recipe_ids)}&apiKey={SPOONACULAR_API_KEY}"
        bulk_response = requests.get(bulk_url, timeout=10)
        #crea dizionario ordinato con gli id e i valori da bulkresponse
        recipes_info = {}
        if bulk_response.status_code == 200:
            recipes_info = {str(item['id']): item for item in bulk_response.json()} #.JSOM da lista di dizionari

        # 4. Formattazione dati pulita
        recipes_list = []
        for item in selected_recipes:
            r_id = str(item['id'])
            info = recipes_info.get(r_id, {})

            raw_instructions = info.get('instructions') or info.get('summary') or "Istruzioni non disponibili."
            clean_instructions = re.sub('<[^<]+?>', '', raw_instructions) #cancella tag html
            used_ings = [ing.get('name', '') for ing in item.get('usedIngredients', [])] #nomi ingredienti puliti

            all_ingredients = []
            if 'extendedIngredients' in info and info['extendedIngredients']:
                all_ingredients = [ing.get('original', ing.get('name', '')) for ing in info['extendedIngredients']]
            else:
                all_ingredients = used_ings

            recipes_list.append({
                "id": r_id,
                "title": item.get('title', 'Ricetta Anti-Spreco'),
                "used_ingredients": used_ings,
                "used_count": len(used_ings),
                "all_ingredients": all_ingredients,
                "instructions": clean_instructions.strip()
            })

        return jsonify({
            "success": True,
            "recipes": recipes_list
        }), 200

    except requests.exceptions.Timeout:
        return jsonify({"success": False, "message": "⏱️ Spoonacular ha impiegato troppo tempo."}), 504
    except Exception as e:
        print(f"Errore Spoonacular: {e}")
        return jsonify({"success": False, "message": f"❌ Errore interno: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True)
