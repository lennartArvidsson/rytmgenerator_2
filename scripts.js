// ============ INSTÄLLNINGAR ============
const config = {
    // Grid
    antalRutor: 16,
    antalRader: 1,
    taktart: '4/4',
    minstaEnhet: 16,

    // Timing
    tempo: 120,
    get intervall() { return 60000 / this.tempo / (this.minstaEnhet / 4); },

    // Ljud
    frekvens: 800,
    volym: 0.3,
    volymTrack2: 0.3,
    tonLangd: 0.1,
    ljudläge: 'ton', // 'ton' eller 'perkussion'

    // Utseende
    rutStorlek: 40,
    gap: 5,

    // Färger
    farger: {
        inaktiv: '#bbb',
        inaktivSpelar: '#e0e0e0',
        aktiv: '#4CAF50',
        aktivSpelar: '#8FD694'
    }
};
// =======================================

// ============ LJUDSAMPLES ============
// Lista över tillgängliga ljudfiler (utvecklaren uppdaterar denna)
const tillgängligaLjud = [
    'klapp_disk',
    'duns_bas',
    // Lägg till fler ljudfiler här efter hand
];

const samples = {
    ljudfiler: {} // Lagrar alla inladdade samples
};

// Aktuella val
let valdDiskantLjud = 'klapp_disk';
let valdBasLjud = 'duns_bas';

async function laddaSamples() {
    // Ladda alla tillgängliga ljudfiler
    for (const ljudnamn of tillgängligaLjud) {
        try {
            const response = await fetch(`audio/${ljudnamn}.wav`);
            const buffer = await response.arrayBuffer();
            samples.ljudfiler[ljudnamn] = await audioContext.decodeAudioData(buffer);
            console.log(`Laddade ${ljudnamn}`);
        } catch (e) {
            console.warn(`Kunde inte ladda ${ljudnamn}:`, e);
        }
    }
    
    // Fyll i dropdown-menyer
    fyllLjudDropdowns();
}

function fyllLjudDropdowns() {
    const diskantSelect = document.getElementById('diskant-ljud');
    const basSelect = document.getElementById('bas-ljud');
    
    // Rensa befintliga options
    diskantSelect.innerHTML = '';
    basSelect.innerHTML = '';
    
    // Lägg till alla tillgängliga ljud
    tillgängligaLjud.forEach(ljud => {
        // Formatera namnet: "klapp_disk" → "klapp disk"
        const visningsnamn = ljud.replace(/_/g, ' ');
        
        const optionDiskant = document.createElement('option');
        optionDiskant.value = ljud;
        optionDiskant.textContent = visningsnamn;
        if (ljud === valdDiskantLjud) optionDiskant.selected = true;
        diskantSelect.appendChild(optionDiskant);
        
        const optionBas = document.createElement('option');
        optionBas.value = ljud;
        optionBas.textContent = visningsnamn;
        if (ljud === valdBasLjud) optionBas.selected = true;
        basSelect.appendChild(optionBas);
    });
}
// =====================================

// ============ DATAMODELL FÖR BLOCK ============
// Varje rad har en array av block
// Ett block: { start: kolumnIndex, längd: antalRutor }
let blockData = [[], []]; // En array per rad (max 2 rader)

function hittaBlock(rad, kol) {
    // Returnerar blocket som innehåller denna position, eller null
    return blockData[rad].find(b => kol >= b.start && kol < b.start + b.längd) || null;
}

function taBortBlock(rad, block) {
    const index = blockData[rad].indexOf(block);
    if (index > -1) {
        blockData[rad].splice(index, 1);
    }
}

function läggTillBlock(rad, start, längd) {
    // Ta bort alla block som överlappar med det nya
    blockData[rad] = blockData[rad].filter(b => {
        const bSlut = b.start + b.längd;
        const nyttSlut = start + längd;
        // Behåll endast block som INTE överlappar
        return bSlut <= start || b.start >= nyttSlut;
    });
    // Lägg till det nya blocket
    blockData[rad].push({ start, längd });
    // Sortera efter startposition
    blockData[rad].sort((a, b) => a.start - b.start);
}
// ==============================================

// Globala variabler
const grid = document.getElementById('rytm-grid');
let rutor = [];
let spelareInterval = null;
let nuvarandeRuta = 0;
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// Drag-variabler
let ärIDrag = false;
let dragRad = null;
let dragStartKol = null;
let dragSlutKol = null;

// ============ FLIK-HANTERING (NYT) ============

function växlaFlik(flikNamn) {
    // Ta bort aktiv-klass från alla flikar och innehåll
    document.querySelectorAll('.flik').forEach(f => f.classList.remove('aktiv'));
    document.querySelectorAll('.flik-innehåll').forEach(f => f.classList.remove('aktiv'));
    
    // Lägg till aktiv-klass på vald flik och innehåll
    document.querySelector(`.flik[data-flik="${flikNamn}"]`).classList.add('aktiv');
    document.getElementById(`flik-${flikNamn}`).classList.add('aktiv');
}

// ==============================================

// ============ PATTERN-HANTERING (NYT) ============

function sparaPattern() {
    const namnInput = document.getElementById('pattern-namn');
    const namn = namnInput.value.trim();
    
    if (!namn) {
        alert('Ange ett namn för pattern!');
        return;
    }
    
    // Hämta befintliga patterns
    const patterns = hämtaAllaPatterns();
    
    // Skapa pattern-objekt
    const pattern = {
        namn: namn,
        blockData: JSON.parse(JSON.stringify(blockData)), // Deep copy
        config: {
            antalRutor: config.antalRutor,
            antalRader: config.antalRader,
            taktart: config.taktart,
            minstaEnhet: config.minstaEnhet,
            tempo: config.tempo
        },
        ljud: {
            diskant: valdDiskantLjud,
            bas: valdBasLjud
        },
        sparadDatum: new Date().toISOString()
    };
    
    // Spara pattern
    patterns[namn] = pattern;
    localStorage.setItem('sparadePatterns', JSON.stringify(patterns));
    
    // Uppdatera UI
    uppdateraPatternLista();
    namnInput.value = '';
    
    console.log('Sparade pattern:', namn);
}

function laddaPattern() {
    const select = document.getElementById('sparade-patterns');
    const valdNamn = select.value;
    
    if (!valdNamn) {
        alert('Välj ett pattern att ladda!');
        return;
    }
    
    const patterns = hämtaAllaPatterns();
    const pattern = patterns[valdNamn];
    
    if (!pattern) {
        alert('Pattern hittades inte!');
        return;
    }
    
    // Stoppa uppspelning
    stoppaSpelaer();
    
    // Ladda config
    config.antalRutor = pattern.config.antalRutor;
    config.antalRader = pattern.config.antalRader;
    config.taktart = pattern.config.taktart;
    config.minstaEnhet = pattern.config.minstaEnhet;
    config.tempo = pattern.config.tempo;
    
    // Ladda ljudval (om de finns)
    if (pattern.ljud) {
        valdDiskantLjud = pattern.ljud.diskant;
        valdBasLjud = pattern.ljud.bas;
        document.getElementById('diskant-ljud').value = valdDiskantLjud;
        document.getElementById('bas-ljud').value = valdBasLjud;
    }
    
    // Uppdatera UI-element
    document.getElementById('tempo-slider').value = config.tempo;
    document.getElementById('tempo-värde').textContent = config.tempo;
    document.getElementById('taktart').value = config.taktart;
    document.getElementById('antal-tracks').value = config.antalRader;
    document.getElementById('minsta-enhet').value = config.minstaEnhet;
    
    // Ladda blockdata
    blockData = JSON.parse(JSON.stringify(pattern.blockData)); // Deep copy
    
    // Återskapa gridet
    skapaGrid();
    
    console.log('Laddade pattern:', valdNamn);
}

function raderaPattern() {
    const select = document.getElementById('sparade-patterns');
    const valdNamn = select.value;
    
    if (!valdNamn) {
        alert('Välj ett pattern att radera!');
        return;
    }
    
    if (!confirm(`Är du säker på att du vill radera "${valdNamn}"?`)) {
        return;
    }
    
    const patterns = hämtaAllaPatterns();
    delete patterns[valdNamn];
    localStorage.setItem('sparadePatterns', JSON.stringify(patterns));
    
    uppdateraPatternLista();
    
    console.log('Raderade pattern:', valdNamn);
}

function hämtaAllaPatterns() {
    const sparade = localStorage.getItem('sparadePatterns');
    return sparade ? JSON.parse(sparade) : {};
}

function uppdateraPatternLista() {
    const select = document.getElementById('sparade-patterns');
    const patterns = hämtaAllaPatterns();
    const namn = Object.keys(patterns).sort();
    
    // Rensa select
    select.innerHTML = '';
    
    if (namn.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.disabled = true;
        option.textContent = '-- Inga sparade patterns --';
        select.appendChild(option);
    } else {
        namn.forEach(n => {
            const option = document.createElement('option');
            option.value = n;
            option.textContent = n;
            select.appendChild(option);
        });
    }
}

// ================================================

// ============ KEYBOARD SHORTCUTS (NYT) ============

document.addEventListener('keydown', function(e) {
    // Ignorera om användaren skriver i ett input-fält
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
        return;
    }
    
    switch(e.key.toLowerCase()) {
        case ' ': // Space - Toggle play/stop
            e.preventDefault();
            if (spelareInterval === null) {
                spelareInterval = setInterval(spelaSteg, config.intervall);
            } else {
                stoppaSpelaer();
            }
            break;
            
        case 'c': // C - Rensa
            e.preventDefault();
            blockData = [[], []];
            renderaBlock();
            break;
            
        case 'arrowleft': // Vänsterpil - Sänk tempo
            e.preventDefault();
            const nyttTempoNed = Math.max(40, config.tempo - 5);
            config.tempo = nyttTempoNed;
            document.getElementById('tempo-slider').value = nyttTempoNed;
            document.getElementById('tempo-värde').textContent = nyttTempoNed;
            
            if (spelareInterval !== null) {
                clearInterval(spelareInterval);
                spelareInterval = setInterval(spelaSteg, config.intervall);
            }
            break;
            
        case 'arrowright': // Högerpil - Höj tempo
            e.preventDefault();
            const nyttTempoUpp = Math.min(200, config.tempo + 5);
            config.tempo = nyttTempoUpp;
            document.getElementById('tempo-slider').value = nyttTempoUpp;
            document.getElementById('tempo-värde').textContent = nyttTempoUpp;
            
            if (spelareInterval !== null) {
                clearInterval(spelareInterval);
                spelareInterval = setInterval(spelaSteg, config.intervall);
            }
            break;
    }
});

// =================================================

// ============ SPARFUNKTIONER ============

function sparaState() {
    // Spara config
    const sparadConfig = {
        antalRutor: config.antalRutor,
        antalRader: config.antalRader,
        taktart: config.taktart,
        minstaEnhet: config.minstaEnhet,
        tempo: config.tempo,
        volym: config.volym,
        volymTrack2: config.volymTrack2,
        tonLangd: config.tonLangd,
        ljudläge: config.ljudläge
    };

    localStorage.setItem('rytmConfig', JSON.stringify(sparadConfig));
    localStorage.setItem('rytmBlock', JSON.stringify(blockData));

    console.log('Sparade inställningar och block');
}

function laddaState() {
    // Ladda config
    const sparadConfig = localStorage.getItem('rytmConfig');
    if (sparadConfig) {
        const parsed = JSON.parse(sparadConfig);
        Object.assign(config, parsed);

        // Uppdatera UI-element
        document.getElementById('tempo-slider').value = config.tempo;
        document.getElementById('tempo-värde').textContent = config.tempo;

        document.getElementById('volym-diskant').value = Math.round(config.volym * 100);
        document.getElementById('volym-diskant-värde').textContent = Math.round(config.volym * 100);

        document.getElementById('volym-bas').value = Math.round(config.volymTrack2 * 100);
        document.getElementById('volym-bas-värde').textContent = Math.round(config.volymTrack2 * 100);

        document.getElementById('pulstid').value = Math.round(config.tonLangd * 1000);
        document.getElementById('pulstid-värde').textContent = Math.round(config.tonLangd * 1000);

        document.getElementById('taktart').value = config.taktart;
        document.getElementById('antal-tracks').value = config.antalRader;
        document.getElementById('minsta-enhet').value = config.minstaEnhet;
        
        // Ljudläge
        const ljudlägeRadio = document.querySelector(`input[name="ljudläge"][value="${config.ljudläge}"]`);
        if (ljudlägeRadio) ljudlägeRadio.checked = true;

        console.log('Laddade sparade inställningar');
    }
    
    // Ladda blockdata
    const sparadeBlock = localStorage.getItem('rytmBlock');
    if (sparadeBlock) {
        blockData = JSON.parse(sparadeBlock);
        // Se till att vi har rätt antal rader
        while (blockData.length < 2) blockData.push([]);
        console.log('Laddade sparade block');
    }
}

function renderaBlock() {
    // Rensa alla aktiv-klasser och block-styling
    rutor.forEach(rad => rad.forEach(ruta => {
        ruta.classList.remove('aktiv', 'block-start', 'block-mitt', 'block-slut', 'block-ensam');
    }));
    
    // Rendera varje block
    for (let rad = 0; rad < config.antalRader; rad++) {
        for (const block of blockData[rad]) {
            for (let i = 0; i < block.längd; i++) {
                const kol = block.start + i;
                if (kol < config.antalRutor && rutor[rad] && rutor[rad][kol]) {
                    rutor[rad][kol].classList.add('aktiv');
                    
                    // Lägg till positionsklasser för styling
                    if (block.längd === 1) {
                        rutor[rad][kol].classList.add('block-ensam');
                    } else if (i === 0) {
                        rutor[rad][kol].classList.add('block-start');
                    } else if (i === block.längd - 1) {
                        rutor[rad][kol].classList.add('block-slut');
                    } else {
                        rutor[rad][kol].classList.add('block-mitt');
                    }
                }
            }
        }
    }
}

// Spara automatiskt vid sidstängning
window.addEventListener('beforeunload', function () {
    sparaState();
});

// Spara också med jämna mellanrum (var 5:e sekund)
setInterval(sparaState, 5000);

// ========================================

// Beräkna antal rutor baserat på taktart och minsta enhet
function beräknaAntalRutor(taktart, minstaEnhet) {
    const [täljare, nämnare] = taktart.split('/').map(Number);
    return täljare * (minstaEnhet / nämnare);
}

// Funktion för att skapa/återskapa gridet
function skapaGrid() {
    grid.innerHTML = '';
    rutor = [];

    // Uppdatera grid-layout
    grid.style.gridTemplateColumns = `repeat(${config.antalRutor}, ${config.rutStorlek}px)`;
    grid.style.gridTemplateRows = `repeat(${config.antalRader}, ${config.rutStorlek}px)`;

    // Skapa rutor för varje rad
    for (let rad = 0; rad < config.antalRader; rad++) {
        rutor[rad] = [];

        for (let kol = 0; kol < config.antalRutor; kol++) {
            const ruta = document.createElement('div');
            ruta.className = 'ruta';
            ruta.dataset.rad = rad;
            ruta.dataset.kol = kol;

            // Mousedown - starta drag eller klick
            ruta.addEventListener('mousedown', function (e) {
                if (e.button !== 0) return; // Endast vänsterklick
                e.preventDefault();
                
                const r = parseInt(this.dataset.rad);
                const k = parseInt(this.dataset.kol);
                
                ärIDrag = true;
                dragRad = r;
                dragStartKol = k;
                dragSlutKol = k;
                
                visaDragFörhandsvisning();
            });

            // Mouseover - uppdatera drag
            ruta.addEventListener('mouseover', function () {
                if (!ärIDrag) return;
                
                const r = parseInt(this.dataset.rad);
                const k = parseInt(this.dataset.kol);
                
                // Endast samma rad
                if (r === dragRad) {
                    dragSlutKol = k;
                    visaDragFörhandsvisning();
                }
            });

            grid.appendChild(ruta);
            rutor[rad].push(ruta);
        }
    }

    // Mouseup - avsluta drag
    document.addEventListener('mouseup', function (e) {
        if (!ärIDrag) return;
        
        const startKol = Math.min(dragStartKol, dragSlutKol);
        const slutKol = Math.max(dragStartKol, dragSlutKol);
        const längd = slutKol - startKol + 1;
        
        // Kolla om vi klickar på ett existerande block (för att ta bort det)
        if (längd === 1) {
            const existerandeBlock = hittaBlock(dragRad, startKol);
            if (existerandeBlock) {
                taBortBlock(dragRad, existerandeBlock);
            } else {
                läggTillBlock(dragRad, startKol, 1);
            }
        } else {
            // Dra = skapa nytt block
            läggTillBlock(dragRad, startKol, längd);
        }
        
        ärIDrag = false;
        dragRad = null;
        dragStartKol = null;
        dragSlutKol = null;
        
        rensaDragFörhandsvisning();
        renderaBlock();
    });

    // Visa/dölj bas-volym
    const volymBasGrupp = document.getElementById('volym-bas-grupp');
    if (config.antalRader === 2) {
        volymBasGrupp.style.display = 'block';
    } else {
        volymBasGrupp.style.display = 'none';
    }

    // Rendera sparade block
    renderaBlock();
}

function visaDragFörhandsvisning() {
    rensaDragFörhandsvisning();
    
    const startKol = Math.min(dragStartKol, dragSlutKol);
    const slutKol = Math.max(dragStartKol, dragSlutKol);
    
    for (let k = startKol; k <= slutKol; k++) {
        if (rutor[dragRad] && rutor[dragRad][k]) {
            rutor[dragRad][k].classList.add('drag-förhandsvisning');
        }
    }
}

function rensaDragFörhandsvisning() {
    rutor.forEach(rad => rad.forEach(ruta => {
        ruta.classList.remove('drag-förhandsvisning');
    }));
}

// Ljud-funktion med diskant/bas - nu med dynamisk tonlängd och perkussion
function spelaLjud(radIndex, blockLängd = 1) {
    if (config.ljudläge === 'perkussion') {
        spelaPerkussion(radIndex);
    } else {
        spelaTon(radIndex, blockLängd);
    }
}

function spelaPerkussion(radIndex) {
    const ljudnamn = radIndex === 0 ? valdDiskantLjud : valdBasLjud;
    const sample = samples.ljudfiler[ljudnamn];
    const volym = radIndex === 0 ? config.volym : config.volymTrack2;
    
    if (!sample) {
        console.warn('Sample ej laddat för rad', radIndex, ljudnamn);
        return;
    }
    
    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();
    
    source.buffer = sample;
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    gainNode.gain.value = volym;
    source.start();
}

function spelaTon(radIndex, blockLängd = 1) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Beräkna tonlängd baserat på blocklängd och tempo
    const basLängd = config.intervall / 1000; // Konvertera till sekunder
    const tonLängd = basLängd * blockLängd * 0.9; // 90% av full längd för att undvika överlapp

    if (radIndex === 0) {
        // Track 1 - Diskant/Höger hand
        oscillator.frequency.value = 1200;
        gainNode.gain.value = config.volym * 0.8;
        
        // Fade out i slutet
        gainNode.gain.setValueAtTime(config.volym * 0.8, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + tonLängd);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + tonLängd);
    } else {
        // Track 2 - Bas/Vänster hand
        oscillator.frequency.value = 400;
        gainNode.gain.value = config.volymTrack2 * 1.2;
        
        // Fade out i slutet
        gainNode.gain.setValueAtTime(config.volymTrack2 * 1.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + tonLängd);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + tonLängd);
    }
}

// Uppspelningsloop
function spelaSteg() {
    rutor.forEach(rad => rad.forEach(r => r.classList.remove('spelar')));

    for (let rad = 0; rad < config.antalRader; rad++) {
        rutor[rad][nuvarandeRuta].classList.add('spelar');

        // Kolla om denna position är START på ett block
        const block = hittaBlock(rad, nuvarandeRuta);
        if (block && block.start === nuvarandeRuta) {
            // Spela ljud med blocklängd för rätt tonlängd
            spelaLjud(rad, block.längd);
        }
    }

    nuvarandeRuta = (nuvarandeRuta + 1) % config.antalRutor;
}

// Stoppa uppspelning
function stoppaSpelaer() {
    if (spelareInterval !== null) {
        clearInterval(spelareInterval);
        spelareInterval = null;
        rutor.forEach(rad => rad.forEach(r => r.classList.remove('spelar')));
        nuvarandeRuta = 0;
    }
}

// ============ EVENT LISTENERS ============

// Flik-hantering (NYT)
document.querySelectorAll('.flik').forEach(flik => {
    flik.addEventListener('click', function() {
        växlaFlik(this.dataset.flik);
    });
});

// Ljudval (NYT)
document.getElementById('diskant-ljud').addEventListener('change', function() {
    valdDiskantLjud = this.value;
    console.log('Valde diskant-ljud:', valdDiskantLjud);
});

document.getElementById('bas-ljud').addEventListener('change', function() {
    valdBasLjud = this.value;
    console.log('Valde bas-ljud:', valdBasLjud);
});

// Spelknappar
document.getElementById('spela').addEventListener('click', function () {
    if (spelareInterval === null) {
        spelareInterval = setInterval(spelaSteg, config.intervall);
    }
});

document.getElementById('stopp').addEventListener('click', stoppaSpelaer);

document.getElementById('rensa').addEventListener('click', function () {
    blockData = [[], []];
    renderaBlock();
});

// Pattern-hantering knappar (NYT)
document.getElementById('spara-pattern').addEventListener('click', sparaPattern);
document.getElementById('ladda-pattern').addEventListener('click', laddaPattern);
document.getElementById('radera-pattern').addEventListener('click', raderaPattern);

// Tempo slider
const tempoSlider = document.getElementById('tempo-slider');
const tempoVärde = document.getElementById('tempo-värde');

tempoSlider.addEventListener('input', function () {
    config.tempo = parseInt(this.value);
    tempoVärde.textContent = config.tempo;

    if (spelareInterval !== null) {
        clearInterval(spelareInterval);
        spelareInterval = setInterval(spelaSteg, config.intervall);
    }
});

// Volym slider (diskant/track 1)
const volymDiskantSlider = document.getElementById('volym-diskant');
const volymDiskantVärde = document.getElementById('volym-diskant-värde');

volymDiskantSlider.addEventListener('input', function () {
    const procent = parseInt(this.value);
    config.volym = procent / 100;
    volymDiskantVärde.textContent = procent;
});

// Volym slider track 2 (bas)
const volymBasSlider = document.getElementById('volym-bas');
const volymBasVärde = document.getElementById('volym-bas-värde');

volymBasSlider.addEventListener('input', function () {
    const procent = parseInt(this.value);
    config.volymTrack2 = procent / 100;
    volymBasVärde.textContent = procent;
});

// Pulstid slider
const pulstidSlider = document.getElementById('pulstid');
const pulstidVärde = document.getElementById('pulstid-värde');

pulstidSlider.addEventListener('input', function () {
    const ms = parseInt(this.value);
    config.tonLangd = ms / 1000;
    pulstidVärde.textContent = ms;
});

// Ljudläge radio-knappar
document.querySelectorAll('input[name="ljudläge"]').forEach(radio => {
    radio.addEventListener('change', function () {
        config.ljudläge = this.value;
        console.log('Ljudläge:', config.ljudläge);
    });
});

// Aside-inställningar - Tillämpa-knappen
document.getElementById('tillämpa').addEventListener('click', function () {
    stoppaSpelaer();

    config.taktart = document.getElementById('taktart').value;
    config.antalRader = parseInt(document.getElementById('antal-tracks').value);
    config.minstaEnhet = parseInt(document.getElementById('minsta-enhet').value);

    config.antalRutor = beräknaAntalRutor(config.taktart, config.minstaEnhet);
    
    // Rensa blockdata vid ändring av grid-storlek
    blockData = [[], []];

    skapaGrid();
});

// ============ INITIALISERING ============
laddaState();        // Ladda sparade inställningar först
laddaSamples();      // Ladda ljudsamples
skapaGrid();         // Sedan skapa gridet (som även laddar rytmmönstret)
uppdateraPatternLista(); // Ladda sparade patterns (NYT)
