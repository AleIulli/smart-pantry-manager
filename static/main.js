document.addEventListener("DOMContentLoaded", () => {
    initScanner();
    initRecipeGenerator();
    initFormValidation(); // 👈 Inizializza i controlli sul form
    initItemUpdater();
    initStatsChart(); // 👈 Avvio del grafico statistiche
});

/* ==========================================================================
   1. CONTROLLI VALIDAZIONE FORM INSERIMENTO
   ========================================================================== */
function initFormValidation() {
    const form = document.querySelector("form[action='/add']");
    const expInput = document.getElementById("expiration_date");
    const barcodeInput = document.getElementById("barcode-input");
    const unitSizeInput = document.getElementById("unit_size");
    const submitBtn = document.getElementById("submit-btn");

    const expError = document.getElementById("exp-error");
    const barcodeError = document.getElementById("barcode-error");
    const unitError = document.getElementById("unit-error");

    if (!form) return;

    // Imposta la data minima sul calendario (OGGI)
    const todayStr = new Date().toISOString().split("T")[0]; //divide da lettera T e prende primaa parte
    if (expInput) {
        expInput.setAttribute("min", todayStr);
    }

    // Funzione helper per aggiornare la grafica dell'input in base al messaggio
    const setStatus = (inputEl, errorEl, message) => {
        if (message) {
            errorEl.innerText = message;
            inputEl.classList.add("input-invalid");
            inputEl.classList.remove("input-valid");
        } else {
            errorEl.innerText = "";
            inputEl.classList.remove("input-invalid");
            if (inputEl.value.trim() !== "") {
                inputEl.classList.add("input-valid");
            } else {
                inputEl.classList.remove("input-valid");
            }
        }
        checkFormStatus();
    };

    // Disabilita il pulsante se ci sono errori visibili
    const checkFormStatus = () => {
        const hasErrors = document.querySelectorAll(".input-invalid").length > 0;
        if (submitBtn) {
            submitBtn.disabled = hasErrors;
            submitBtn.style.opacity = hasErrors ? "0.5" : "1";
            submitBtn.style.cursor = hasErrors ? "not-allowed" : "pointer";
        }
    };

    // A. CONTROLLO CODICE A BARRE (Solo cifre, 8-14 caratteri)
    if (barcodeInput) {
        barcodeInput.addEventListener("input", () => {
            const val = barcodeInput.value.trim();

            if (val === "") {
                setStatus(barcodeInput, barcodeError, "");
                return;
            }

            // Blocco immediato se digita lettere
            if (/[^\d]/.test(val)) {
                setStatus(barcodeInput, barcodeError, "⚠️ Solo numeri ammessi (niente lettere o simboli).");
            } else if (val.length < 8 || val.length > 14) {
                setStatus(barcodeInput, barcodeError, `⚠️ Lunghezza non valida (${val.length} cifre). Deve essere tra 8 e 14 cifre.`);
            } else {
                setStatus(barcodeInput, barcodeError, "");
            }
        });
    }

    // B. CONTROLLO GRAMMATURA / UNITÀ DI MISURA
    if (unitSizeInput) {
        unitSizeInput.addEventListener("input", () => {
            const val = unitSizeInput.value.trim();

            if (val === "") {
                setStatus(unitSizeInput, unitError, "");
                return;
            }

            // RegEx: supporta formati standard (500g, 1.5L, 250ml) e multipack (6x33cl, 4x100g)
            // Unità ammesse: g, gr, kg, mg, l, ml, cl, dl
            const unitRegex = /^(\d+\s*(x|\*)\s*)?\d+([\.,]\d+)?\s*(g|gr|kg|mg|l|ml|cl|dl)$/i;

            if (!unitRegex.test(val)) {
                setStatus(unitSizeInput, unitError, "⚠️ Formato errato. Usa numero + unità (es. 500g, 1.5L, 250ml, 6x33cl).");
            } else {
                setStatus(unitSizeInput, unitError, "");
            }
        });
    }

    // C. CONTROLLO DATA DI SCADENZA
    if (expInput) {
        expInput.addEventListener("change", () => {
            if (expInput.value && expInput.value < todayStr) {
                setStatus(expInput, expError, "⚠️ Impossibile inserire un prodotto già scaduto.");
            } else {
                setStatus(expInput, expError, "");
            }
        });
    }

    // D. BLOCCO SICUREZZA ALL'INVIO
    form.addEventListener("submit", (e) => {
        const hasErrors = document.querySelectorAll(".input-invalid").length > 0;
        if (hasErrors) {
            e.preventDefault();
        }
    });
}

/* -------------------------------------------------------------------------
   5. AGGIORNAMENTO PARZIALE PRODOTTO (UPDATE / PATCH)
   ------------------------------------------------------------------------- */
function initItemUpdater() {
    const editModal = document.getElementById("edit-modal");
    const editForm = document.getElementById("edit-item-form");
    const cancelBtn = document.getElementById("cancel-edit-btn");
    const saveBtn = document.getElementById("save-edit-btn");

    if (!editModal || !editForm) return;

    const editId = document.getElementById("edit-id");
    const editName = document.getElementById("edit-name");
    const editQuantity = document.getElementById("edit-quantity");
    const editUnitSize = document.getElementById("edit-unit-size");
    const editExpirationDate = document.getElementById("edit-expiration-date");

    // Oggetto che memorizza lo stato iniziale prima delle modifiche
    let originalData = {};

    // Apertura modale al click su "Modifica"
    const editButtons = document.querySelectorAll(".btn-edit-item");
    editButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            originalData = {
                name: btn.dataset.name,
                quantity: btn.dataset.quantity,
                unit_size: btn.dataset.unitSize,
                expiration_date: btn.dataset.expirationDate
            };

            editId.value = btn.dataset.id;
            editName.value = originalData.name;
            editQuantity.value = originalData.quantity;
            editUnitSize.value = originalData.unit_size;
            editExpirationDate.value = originalData.expiration_date;

            editModal.classList.remove("is-hidden");
        });
    });

    // Chiusura modale
    if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
            editModal.classList.add("is-hidden");
        });
    }

    // Invio delle sole differenze al backend
    editForm.addEventListener("submit", (e) => {
        e.preventDefault();

        const changes = {};

        if (editName.value.trim() !== originalData.name) {
            changes.name = editName.value.trim();
        }
        if (editQuantity.value !== originalData.quantity) {
            changes.quantity = Number(editQuantity.value);
        }
        if (editUnitSize.value.trim() !== originalData.unit_size) {
            changes.unit_size = editUnitSize.value.trim();
        }
        if (editExpirationDate.value !== originalData.expiration_date) {
            changes.expiration_date = editExpirationDate.value;
        }

        // Se nessun campo è cambiato, chiude senza chiamare il server
        if (Object.keys(changes).length === 0) {
            editModal.classList.add("is-hidden");
            return;
        }

        saveBtn.disabled = true;
        saveBtn.innerText = "⏳ Salvataggio...";

        fetch(`/api/update/${editId.value}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(changes)
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error("Errore durante l'aggiornamento: " + response.status);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    window.location.reload();
                } else {
                    alert("⚠️ " + data.message);
                }
            })
            .catch(error => {
                console.error("Errore update prodotto:", error);
                alert("❌ Impossibile aggiornare il prodotto.");
            })
            .finally(() => {
                saveBtn.disabled = false;
                saveBtn.innerText = "💾 Salva Modifiche";
            });
    });
}

/* ==========================================================================
   2. SCANNER BARCODE & AUTO-FETCH DETTAGLI PRODOTTO
   ========================================================================== */
function initScanner() {
    const startBtn = document.getElementById("start-scan-btn");
    const stopBtn = document.getElementById("stop-scan-btn");
    const barcodeInput = document.getElementById("barcode-input");
    const readerDiv = document.getElementById("qr-reader");

    if (!startBtn || !stopBtn || !barcodeInput || !readerDiv) return;

    let html5QrCode = null; // variabile per scanner attivo

    const stopScanning = () => {
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().then(() => {
                html5QrCode.clear(); //rimozione video
                readerDiv.style.display = "none";
                readerDiv.classList.add("is-hidden");
                startBtn.classList.remove("is-hidden");
                stopBtn.classList.add("is-hidden");
            }).catch(err => console.error("Errore arresto scanner:", err));
        } else {
            readerDiv.style.display = "none";
            readerDiv.classList.add("is-hidden");
            startBtn.classList.remove("is-hidden");
            stopBtn.classList.add("is-hidden");
        }
    };

    startBtn.addEventListener("click", () => {
        if (typeof Html5Qrcode === "undefined") {
            alert("⚠️ Libreria scanner non caricata. Verifica la connessione Internet.");
            return;
        }

        readerDiv.classList.remove("is-hidden");
        readerDiv.style.display = "block"; //per renere visibile
        startBtn.classList.add("is-hidden");
        stopBtn.classList.remove("is-hidden");

        html5QrCode = new Html5Qrcode("qr-reader"); //aggancia aa readerdiv

       const config = {
           fps: 15, // Aumentato il frame rate per rilevamenti più rapidi//
           qrbox: { width: 300, height: 120 }, // Riquadro rettangolare (largo e basso) specifico per codici a barre
           aspectRatio: 1.0,
           experimentalFeatures: {
               useBarCodeDetectorIfSupported: true // Sfrutta il rilevatore nativo del browser (velocissimo su Chrome/Edge)
           }
       };

        const onScanSuccess = (decodedText) => {
            barcodeInput.value = decodedText;
            barcodeInput.classList.add("input-highlight");
            setTimeout(() => barcodeInput.classList.remove("input-highlight"), 1500);

            fetchProductInfo(decodedText);
            stopScanning();
        };

        html5QrCode.start(
            { facingMode: "environment" },
            config,
            onScanSuccess,
            () => {}
        ).catch(err => {
            console.warn("Fotocamera posteriore non disponibile, provo webcam predefinita:", err);

            Html5Qrcode.getCameras().then(devices => {
                if (devices && devices.length > 0) {
                    html5QrCode.start(devices[0].id, config, onScanSuccess, () => {});
                } else {
                    alert("Nessuna fotocamera trovata su questo dispositivo.");
                    stopScanning();
                }
            }).catch(camErr => {
                alert("Permesso fotocamera negato o non supportato su questa connessione.");
                stopScanning();
            });
        });
    });

    stopBtn.addEventListener("click", stopScanning);
}

/* ==========================================================================
   3. RICERCA AUTOMATICA DATI PRODOTTO (Senza Categoria)
   ========================================================================== */
function fetchProductInfo(barcode) {
    const nameInput = document.getElementById("name");
    const unitSizeInput = document.getElementById("unit_size");
    const expInput = document.getElementById("expiration_date");

    if (nameInput) nameInput.placeholder = "⏳ Recupero info prodotto...";

    fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`)
        .then(response => {
            // Se la scadenza è vuota, imposta +7 giorni di default
            if (expInput && !expInput.value) {
                const today = new Date();
                today.setDate(today.getDate() + 7);
                expInput.value = today.toISOString().split('T')[0];
            }

            // Controllo se la risposta è OK (status 200-299)
            if (!response.ok) {
                throw new Error('Errore nella richiesta: ' + response.status);
            }
            return response.json(); // Parsing della risposta in formato JSON
        })
        .then(data => {
            // Codice per gestire i dati ricevuti. Eseguito solo in caso di successo.
            if (data.status === 1 && data.product) {
                const prod = data.product;

                // 1. Nome Prodotto
                if (nameInput) {
                    nameInput.value = prod.product_name_it || prod.product_name || "";
                }

                // 2. Grammatura con Fallback Multiplo (Controlla 3 campi diversi dell'API)
                if (unitSizeInput) {
                    const detectedWeight = prod.quantity
                        || prod.serving_size
                        || (prod.net_weight_value ? `${prod.net_weight_value}${prod.net_weight_unit || 'g'}` : "");

                    if (detectedWeight) {
                        unitSizeInput.value = detectedWeight;
                    }
                }
            }
        })
        .catch(error => {
            // Codice per gestire l'errore. Eseguito solo in caso di errore
            console.warn("Impossibile recuperare i dettagli da Open Food Facts:", error);
        })
        .finally(() => {
            // Codice che viene eseguito sempre, indipendentemente dal risultato
            if (nameInput) nameInput.placeholder = "Es. Latte Intero";
        });
}

/* ==========================================================================
   4. GENERATORE RICETTE (5 Opzioni + Ingredienti Completi)
   ========================================================================== */
function initRecipeGenerator() {
    const generateBtn = document.getElementById("generate-recipe-btn");
    const resultBox = document.getElementById("recipe-result");

    if (!generateBtn || !resultBox) return;

    generateBtn.addEventListener("click", (e) => {
        e.preventDefault();

        generateBtn.disabled = true;
        generateBtn.innerText = "⏳ Ricerca delle ricette su Spoonacular...";

        resultBox.style.display = "block";
        resultBox.classList.remove("is-hidden");
        resultBox.innerHTML = "<p><em>Ricerca delle migliori opzioni anti-spreco in corso...</em></p>";

        fetch("/api/generate_recipes", {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        })
            .then(response => {
                // Controllo se la risposta è OK (status 200-299)
                if (!response.ok) {
                    throw new Error("Errore nella richiesta: " + response.status);
                }
                return response.json(); // Parsing della risposta in formato JSON
            })
            .then(data => {
                if (data.success && data.recipes.length > 0) {
                    let htmlContent = '<h3 class="results-title">✨ Ricette suggerite:</h3>';
                    htmlContent += '<div class="recipe-list">';

                    data.recipes.forEach((recipe, index) => {
                        const usedIngStr = recipe.used_ingredients.join(", ");
                        const allIngStr = recipe.all_ingredients.join(", ");

                        htmlContent += `
                            <div class="recipe-card-item">
                                <div class="recipe-header">
                                    <span class="recipe-name"><strong>${index + 1}.</strong> ${recipe.title}</span>
                                    <span class="recipe-badge">${recipe.used_ingredients.length} del tuo frigo 🔽</span>
                                </div>
                                <div id="recipe-details-${index}" class="recipe-details" style="display: none;">
                                    <p><strong>✅ Salvati dalla tua dispensa:</strong> ${usedIngStr}</p>
                                    <p><strong>🛒 TUTTI gli ingredienti necessari:</strong> ${allIngStr}</p>
                                    <hr style="margin: 10px 0; border: 0; border-top: 1px solid #eee;">
                                    <p><strong>Preparazione:</strong></p>
                                    <p class="recipe-instructions-text">${recipe.instructions}</p>
                                    <button type="button" class="btn-import-recipe">
                                        📥 Importa nel Form Manuale
                                    </button>
                                </div>
                            </div>
                        `;
                    });

                    htmlContent += '</div>';
                    resultBox.innerHTML = htmlContent;

                    // Collegamento moderno con addEventListener per aprire/chiudere i dettagli
                    const headers = resultBox.querySelectorAll(".recipe-header");
                    headers.forEach((header, index) => {
                        header.addEventListener("click", () => {
                            toggleRecipeDetails(index);
                        });
                    });

                    // Collegamento moderno con addEventListener per importare la ricetta nel form
                    const importButtons = resultBox.querySelectorAll(".btn-import-recipe");
                    importButtons.forEach((btn, index) => {
                        btn.addEventListener("click", () => {
                            const recipe = data.recipes[index];
                            const allIngStr = recipe.all_ingredients.join(", ");
                            importToManualForm(recipe.title, allIngStr, recipe.instructions);
                        });
                    });
                } else {
                    resultBox.innerHTML = `<p style="color: #e74c3c; font-weight: bold;">⚠️ ${data.message}</p>`;
                }
            })
            .catch(error => {
                console.error("Errore fetch ricette:", error);
                resultBox.innerHTML = '<p style="color: #e74c3c; font-weight: bold;">❌ Errore di connessione al server.</p>';
            })
            .finally(() => {
                generateBtn.disabled = false;
                generateBtn.innerText = "✨ Trova 5 Ricette Anti-Spreco";
            });
    });
}

// 🔽 Mostra / Nasconde i dettagli della ricetta selezionata
function toggleRecipeDetails(index) {
    const detailsDiv = document.getElementById(`recipe-details-${index}`);
    if (detailsDiv) {
        const isHidden = detailsDiv.style.display === "none";
        detailsDiv.style.display = isHidden ? "block" : "none";
    }
}

// 📥 Autocompila i campi del Form Manuale e scrolla fino alla scheda
function importToManualForm(title, ingredients, instructions) {
    const titleInput = document.getElementById("title");
    const ingredientsInput = document.getElementById("ingredients");
    const instructionsInput = document.getElementById("instructions");
    const targetCard = document.getElementById("manual-recipe-card");

    if (titleInput) titleInput.value = title;
    if (ingredientsInput) ingredientsInput.value = ingredients;
    if (instructionsInput) instructionsInput.value = instructions;

    // Scroll fluido fino al form manuale ed evidenziamento temporaneo
    if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth' });
        targetCard.classList.add("highlight-form");
        setTimeout(() => targetCard.classList.remove("highlight-form"), 2000);
    }
}

// Utility per evitare rotture di stringhe con apici nei parametri JS
function escapeHtml(str) {
    return (str || '')
        .replace(/'/g, "\\'")
        .replace(/"/g, '&quot;')
        .replace(/\n/g, ' ');
}
/* ==========================================================================
   5. GRAFICO STATISTICHE ANNUALE (Lettura diretta da Tabella HTML)
   ========================================================================== */
let statsChartInstance = null;

function initStatsChart() {
    const table = document.getElementById("stats-table");
    const yearSelect = document.getElementById("year-select");
    const canvas = document.getElementById("yearlyStatsChart");

    if (!canvas || !yearSelect) return;

    // Se non ci sono dati nella tabella, mostriamo un grafico vuoto o usciamo
    const rows = table ? table.querySelectorAll("tbody tr") : [];

    // 1. Raccogliamo tutti gli anni unici presenti nella tabella
    const yearsSet = new Set();
    rows.forEach(row => {
        if (row.dataset.year) yearsSet.add(row.dataset.year);
    });

    // Se la tabella è vuota, usiamo l'anno corrente come fallback
    if (yearsSet.size === 0) {
        yearsSet.add(new Date().getFullYear().toString());
    }

    // 2. Popoliamo il menu a tendina con gli anni trovati nella tabella
    yearSelect.innerHTML = "";
    Array.from(yearsSet).sort().reverse().forEach((year, index) => {
        const option = document.createElement("option");
        option.value = year;
        option.textContent = year;
        if (index === 0) option.selected = true;
        yearSelect.appendChild(option);
    });

    // 3. Funzione che scorre la tabella per l'anno selezionato
    const updateChartFromTable = () => {
        const selectedYear = yearSelect.value;
        const consumedMonthly = Array(12).fill(0);
        const wastedMonthly = Array(12).fill(0);

        rows.forEach(row => {
            const rowYear = row.dataset.year;
            const month = parseInt(row.dataset.month, 10);
            const consumed = parseInt(row.dataset.consumed, 10) || 0;
            const wasted = parseInt(row.dataset.wasted, 10) || 0;

            // Se la riga appartiene all'anno selezionato, inseriamo i dati nel mese corretto (0-11)
            if (rowYear === selectedYear && month >= 1 && month <= 12) {
                consumedMonthly[month - 1] = consumed;
                wastedMonthly[month - 1] = wasted;
            }
        });

        renderChart(canvas, {
            months: ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"],
            consumed: consumedMonthly,
            wasted: wastedMonthly
        });
    };

    // Ascolta il cambio dell'anno dal menu
    yearSelect.addEventListener("change", updateChartFromTable);

    // Disegna subito il grafico al caricamento
    updateChartFromTable();
}

function renderChart(canvas, data) {
    const ctx = canvas.getContext("2d");

    // Recupera i colori dalle variabili CSS se definiti, altrimenti usa i colori standard
    const style = getComputedStyle(document.documentElement);
    const colorConsumed = style.getPropertyValue('--color-consumed').trim() || '#2ecc71';
    const colorWasted = style.getPropertyValue('--color-wasted').trim() || '#e74c3c';

    if (statsChartInstance) {
        statsChartInstance.destroy();
    }

    statsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.months,
            datasets: [
                {
                    label: 'Prodotti Consumati',
                    data: data.consumed,
                    backgroundColor: colorConsumed,
                    borderRadius: 4
                },
                {
                    label: 'Prodotti Sprecati / Scaduti',
                    data: data.wasted,
                    backgroundColor: colorWasted,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { font: { weight: 'bold', size: 12 } }
                }
            },
            scales: {
                x: { grid: { display: false } },
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0 },
                    title: {
                        display: true,
                        text: 'Quantità (Pezzi)',
                        font: { weight: 'bold' }
                    }
                }
            }
        }
    });
}

