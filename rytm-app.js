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
        tonLangd: config.tonLangd
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

        document.getElementById('volym-slider').value = Math.round(config.volym * 100);
        document.getElementById('volym-värde').textContent = Math.round(config.volym * 100);

        document.getElementById('volym-track2-slider').value = Math.round(config.volymTrack2 * 100);
        document.getElementById('volym-track2-värde').textContent = Math.round(config.volymTrack2 * 100);

        document.getElementById('tonlangd-slider').value = Math.round(config.tonLangd * 1000);
        document.getElementById('tonlangd-värde').textContent = Math.round(config.tonLangd * 1000);

        document.getElementById('taktart').value = config.taktart;
        document.getElementById('antal-tracks').value = config.antalRader;
        document.getElementById('minsta-enhet').value = config.minstaEnhet;

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

// ============ DRAG-FUNKTIONER (gemensamma för mouse och touch) ============

function startDrag(rad, kol, e) {
    e.preventDefault();
    ärIDrag = true;
    dragRad = rad;
    dragStartKol = kol;
    dragSlutKol = kol;
    visaDragFörhandsvisning();
}

function updateDrag(rad, kol) {
    if (!ärIDrag) return;
    if (rad === dragRad) {
        dragSlutKol = kol;
        visaDragFörhandsvisning();
    }
}

function avslutaDrag() {
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
}

// Globala event listeners för att avsluta drag
document.addEventListener('mouseup', avslutaDrag);
document.addEventListener('touchend', avslutaDrag);
document.addEventListener('touchcancel', avslutaDrag);

// =========================================================================

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

            // ============ MOUSE EVENTS ============
            ruta.addEventListener('mousedown', function(e) {
                if (e.button !== 0) return; // Endast vänsterklick
                startDrag(parseInt(this.dataset.rad), parseInt(this.dataset.kol), e);
            });

            ruta.addEventListener('mouseover', function() {
                updateDrag(parseInt(this.dataset.rad), parseInt(this.dataset.kol));
            });

            // ============ TOUCH EVENTS (för iPad/mobil) ============
            ruta.addEventListener('touchstart', function(e) {
                // Förhindra text-markering och andra default-beteenden
                e.preventDefault();
                startDrag(parseInt(this.dataset.rad), parseInt(this.dataset.kol), e);
            }, { passive: false });

            ruta.addEventListener('touchmove', function(e) {
                e.preventDefault();
                // Hitta vilket element vi är över just nu
                const touch = e.touches[0];
                const element = document.elementFromPoint(touch.clientX, touch.clientY);
                
                if (element && element.classList.contains('ruta')) {
                    updateDrag(
                        parseInt(element.dataset.rad), 
                        parseInt(element.dataset.kol)
                    );
                }
            }, { passive: false });

            grid.appendChild(ruta);
            rutor[rad].push(ruta);
        }
    }

    // Visa/dölj track 2-volym
    const volymTrack2Grupp = document.getElementById('volym-track2-grupp');
    if (config.antalRader === 2) {
        volymTrack2Grupp.style.display = 'block';
    } else {
        volymTrack2Grupp.style.display = 'none';
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

// Ljud-funktion med diskant/bas - nu med dynamisk tonlängd
function spelaLjud(radIndex, blockLängd = 1) {
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
const volymSlider = document.getElementById('volym-slider');
const volymVärde = document.getElementById('volym-värde');

volymSlider.addEventListener('input', function () {
    const procent = parseInt(this.value);
    config.volym = procent / 100;
    volymVärde.textContent = procent;
});

// Volym slider track 2 (bas)
const volymTrack2Slider = document.getElementById('volym-track2-slider');
const volymTrack2Värde = document.getElementById('volym-track2-värde');

volymTrack2Slider.addEventListener('input', function () {
    const procent = parseInt(this.value);
    config.volymTrack2 = procent / 100;
    volymTrack2Värde.textContent = procent;
});

// Tonlängd slider
const tonlangdSlider = document.getElementById('tonlangd-slider');
const tonlangdVärde = document.getElementById('tonlangd-värde');

tonlangdSlider.addEventListener('input', function () {
    const ms = parseInt(this.value);
    config.tonLangd = ms / 1000;
    tonlangdVärde.textContent = ms;
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
laddaState();  // Ladda sparade inställningar först
skapaGrid();   // Sedan skapa gridet (som även laddar rytmmönstret)
