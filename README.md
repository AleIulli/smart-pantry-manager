# 🥫 Smart Pantry Manager

**Progetto individuale per l'esame di Tecnologie Web (AA 2026-2027)**

---

## 1. Obiettivo e Problema Risolto
Nella gestione quotidiana della dispensa domestica, la mancanza di visibilità sulle scadenze degli alimenti porta frequentemente a dimenticare prodotti acquistati e a generare sprechi evitabili.

**Smart Pantry Manager** è una web application progettata per digitalizzare l'inventario della dispensa, monitorare le date di scadenza in tempo reale e trasformare gli ingredienti in prossimità di scadenza in suggerimenti di ricette anti-spreco, tracciando nel tempo il rapporto tra prodotti consumati e sprecati.

### Funzionalità principali
* **Gestione CRUD completa della Dispensa:** Inserimento, visualizzazione con indicatori visivi di scadenza, modifica rapida tramite modale ed eliminazione (distinguendo tra prodotto *Consumato* e *Sprecato*).
* **Scansione Codice a Barre (EAN):** Acquisizione tramite fotocamera integrata nel browser (`Html5-QRCode`) con autocompilazione dei dati del prodotto tramite le API pubbliche di **OpenFoodFacts**.
* **Suggerimento Ricette Anti-Spreco:** Generazione su richiesta delle 5 migliori ricette basate sugli ingredienti più vicini alla scadenza tramite le API di **Spoonacular**, con possibilità di importazione nel ricettario personale.
* **Dashboard Statistica:** Monitoraggio storico mensile dei consumi rispetto agli sprechi tramite grafici interattivi.

---

## 2. Architettura e Scelte Tecnologiche
L'applicazione adotta un'architettura **Client–Server ibrida**, combinando il *Server-Side Rendering* per il caricamento iniziale delle viste con chiamate asincrone REST (`fetch`) per gli aggiornamenti parziali del DOM senza ricaricamento pagina.

* **Backend — Python & Flask:** Scelto per la leggibilità, la rapidità nello sviluppo di endpoint REST/JSON e la libertà di gestione delle rotte senza vincoli strutturali rigidi.
* **Database — SQLite (`dispensa.db`) con SQL esplicito (No ORM):** Scelto per la portabilità su singolo file senza configurazione server. Si è scelto di scrivere query SQL parametriche (con segnaposto `?` anti-SQL Injection) invece di utilizzare un ORM come SQLAlchemy per mantenere chiarezza e semplicità, e consolidare l'uso diretto del linguaggio SQL.
* **Frontend — HTML5, CSS3, Vanilla JavaScript & Jinja2 (No React):** L'uso di Jinja2 consente di servire pagine già popolate dal server, mentre Vanilla JS + `fetch` gestiscono in modo leggero e mirato le interazioni asincrone, evitando l'overhead di un ecosistema SPA (Node.js/bundler) e mantenendo validazione e controllo dati centralizzati sul backend.
* **Librerie e API Esterne integrate:**
  * `Html5-QRCode` (lettura codici a barre lato client) + **OpenFoodFacts API**
  * **Spoonacular API** (ricerca `findByIngredients` + dettagli `informationBulk` lato server)
  * `Chart.js` (rendering grafico su `<canvas>` HTML5)

---

## 3. Istruzioni di Installazione e Avvio

### Prerequisiti
* Python 3.9 o superiore installato
* Una API Key gratuita registrata su [Spoonacular API](https://spoonacular.com/food-api)

### Procedura di avvio in locale
1. **Clonare il repository:**
   ```bash
   git clone [https://github.com/](https://github.com/)<TUO-USERNAME>/smart-pantry-manager.git
   cd smart-pantry-manager
   
---
   
## 4. Dichiarazione sull'uso di strumenti di AI
Per la realizzazione di questo progetto mi sono avvalso del supporto di **Google Gemini** (Intelligenza Artificiale Generativa) come strumento di affiancamento mirato, utilizzandolo principalmente per integrare funzionalità e tecnologie che non erano state approfondite durante le lezioni del corso. In particolare, l'AI mi ha aiutato nella realizzazione del grafico statistico tramite `Chart.js`, nell'integrazione delle API esterne (come il funzionamento delle chiamate e le modalità per ottenere e configurare in sicurezza la propria API key personale tramite file `.env`) e nella ricerca o approfondimento di funzioni e metodi specifici non affrontati a lezione.

Ho inoltre scelto di affidare all'AI lo sviluppo della parte grafica in CSS, così da poter concentrare il mio lavoro sulla parte più sostanziosa del progetto — ovvero la progettazione del database, la logica applicativa e la gestione dei dati — e ho utilizzato l'AI come supporto per l'impostazione grafica delle slide di presentazione, partendo tuttavia dai contenuti e dalle scelte tecniche interamente definiti da me. Per ogni porzione di codice generata o suggerita, ho provveduto ad analizzarne e comprenderne il funzionamento prima di integrarla nell'applicazione.