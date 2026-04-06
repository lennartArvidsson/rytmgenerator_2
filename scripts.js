// ============ INSTÄLLNINGAR ============
const config = {
  // Grid
  antalRutor: 16,
  antalRader: 1,
  taktart: "4/4",
  minstaEnhet: 16,

  // Timing
  tempo: 120,
  get intervall() {
    return 60000 / this.tempo / (this.minstaEnhet / 4);
  },

  // Ljud
  frekvens: 800,
  volym: 0.3,
  volymTrack2: 0.3,
  ljudläge: "ton", // 'ton' eller 'perkussion'

  // Rytmdynamik
  dynamikSpår1: true,   // Aktivera dynamik för spår 1
  dynamikSpår2: true,   // Aktivera dynamik för spår 2
  dynamikNivå: 50,      // 0–100, styr hur stor skillnaden är mellan accent och svagt slag

  // Utseende
  rutStorlek: 40,
  gap: 3,

  // Färger
  farger: {
    inaktiv: "#bbb",
    inaktivSpelar: "#e0e0e0",
    aktiv: "#4CAF50",
    aktivSpelar: "#8FD694",
  },

  // Visning (NYT)
  visaMönsterTitel: true,
  visaKvarttoner: true,
  visaRutnummer: false,
};
// =======================================

// ============ LJUDSAMPLES ============
// Lista över tillgängliga ljudfiler (utvecklaren uppdaterar denna)
const tillgängligaLjud = [
  "klapp_disk",
  "duns_bas",
  "Metronom-klick",
  "Metronom-klocka",
  "bongo",
  "taiko",
  // Lägg till fler ljudfiler här efter hand
];

const samples = {
  ljudfiler: {}, // Lagrar alla inladdade samples
};

// Aktuella val
let valdDiskantLjud = "klapp_disk";
let valdBasLjud = "duns_bas";

async function laddaSamples() {
  // Ladda alla tillgängliga ljudfiler
  for (const ljudnamn of tillgängligaLjud) {
    try {
      const response = await fetch(`Audio/${ljudnamn}.wav`);
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
  const diskantSelect = document.getElementById("diskant-ljud");
  const basSelect = document.getElementById("bas-ljud");

  // Rensa befintliga options
  diskantSelect.innerHTML = "";
  basSelect.innerHTML = "";

  // Lägg till alla tillgängliga ljud
  tillgängligaLjud.forEach((ljud) => {
    // Formatera namnet: "klapp_disk" → "klapp disk"
    const visningsnamn = ljud.replace(/_/g, " ");

    const optionDiskant = document.createElement("option");
    optionDiskant.value = ljud;
    optionDiskant.textContent = visningsnamn;
    if (ljud === valdDiskantLjud) optionDiskant.selected = true;
    diskantSelect.appendChild(optionDiskant);

    const optionBas = document.createElement("option");
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
  return (
    blockData[rad].find((b) => kol >= b.start && kol < b.start + b.längd) ||
    null
  );
}

function taBortBlock(rad, block) {
  const index = blockData[rad].indexOf(block);
  if (index > -1) {
    blockData[rad].splice(index, 1);
  }
}

function läggTillBlock(rad, start, längd) {
  // Ta bort alla block som överlappar med det nya
  blockData[rad] = blockData[rad].filter((b) => {
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
let rutor = [];
let spelareInterval = null;
let nuvarandeRuta = 0;
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// iOS ljudfix - AudioContext kan suspendas av iOS när som helst, inte bara första gången
// Returnerar Promise så att anroparen kan vänta på att kontexten är igång.
function startaAudioContext() {
  if (audioContext.state === "suspended") {
    return audioContext.resume();
  }
  return Promise.resolve();
}

// iOS ljudfix - återuppta AudioContext vid touch (iOS kräver användargest för resume)
document.addEventListener("touchstart", function () {
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
}, { passive: true });

// iOS ljudfix - starta om intervallet vid återkomst (setInterval kan ha pausats i bakgrunden)
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible") {
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }
    if (spelareInterval !== null) {
      clearInterval(spelareInterval);
      spelareInterval = setInterval(spelaSteg, config.intervall);
    }
  }
});
window.addEventListener("pageshow", function () {
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  if (spelareInterval !== null) {
    clearInterval(spelareInterval);
    spelareInterval = setInterval(spelaSteg, config.intervall);
  }
});

// Drag-variabler
let ärIDrag = false;
let dragRad = null;
let dragStartKol = null;
let dragSlutKol = null;

// Mönster-spårning (NYT)
let nuvarandeMönster = null; // Namnet på laddat mönster, eller null
let harÄndringar = false; // Har användaren ändrat sedan senaste spara/ladda?
let senasteSparadeTillstånd = null; // För att jämföra ändringar

// ============ FLIK-HANTERING (NYT) ============

function växlaFlik(flikNamn) {
  // Ta bort aktiv-klass från alla flikar och innehåll
  document
    .querySelectorAll(".flik")
    .forEach((f) => f.classList.remove("aktiv"));
  document
    .querySelectorAll(".flik-innehåll")
    .forEach((f) => f.classList.remove("aktiv"));

  // Lägg till aktiv-klass på vald flik och innehåll
  document
    .querySelector(`.flik[data-flik="${flikNamn}"]`)
    .classList.add("aktiv");
  document.getElementById(`flik-${flikNamn}`).classList.add("aktiv");
}

// ==============================================

// ============ ÄNDRINGS-SPÅRNING (NYT) ============

function sparaTillstånd() {
  // Spara nuvarande tillstånd för jämförelse
  senasteSparadeTillstånd = JSON.stringify({
    blockData: blockData,
    config: {
      antalRutor: config.antalRutor,
      antalRader: config.antalRader,
      taktart: config.taktart,
      minstaEnhet: config.minstaEnhet,
      tempo: config.tempo,
    },
    ljud: {
      diskant: valdDiskantLjud,
      bas: valdBasLjud,
    },
  });
  harÄndringar = false;
}

function kollaNuvarandeTillstånd() {
  const nuvarandeTillstånd = JSON.stringify({
    blockData: blockData,
    config: {
      antalRutor: config.antalRutor,
      antalRader: config.antalRader,
      taktart: config.taktart,
      minstaEnhet: config.minstaEnhet,
      tempo: config.tempo,
    },
    ljud: {
      diskant: valdDiskantLjud,
      bas: valdBasLjud,
    },
  });

  return nuvarandeTillstånd !== senasteSparadeTillstånd;
}

function markeraÄndring() {
  harÄndringar = true;
}

function frågaOmSparaÄndringar() {
  if (!harÄndringar || !nuvarandeMönster) return true;

  const svar = confirm(
    `Du har osparade ändringar i "${nuvarandeMönster}". Vill du spara innan du fortsätter?`,
  );

  if (svar) {
    // Spara automatiskt till nuvarande mönster
    sparaTillNuvarandeMönster();
  }

  return true;
}

function sparaTillNuvarandeMönster() {
  if (!nuvarandeMönster) return;

  const patterns = hämtaAllaPatterns();

  patterns[nuvarandeMönster] = {
    namn: nuvarandeMönster,
    blockData: JSON.parse(JSON.stringify(blockData)),
    config: {
      antalRutor: config.antalRutor,
      antalRader: config.antalRader,
      taktart: config.taktart,
      minstaEnhet: config.minstaEnhet,
      tempo: config.tempo,
    },
    ljud: {
      diskant: valdDiskantLjud,
      bas: valdBasLjud,
    },
    sparadDatum: new Date().toISOString(),
  };

  localStorage.setItem("sparadePatterns", JSON.stringify(patterns));
  sparaTillstånd();
  console.log("Sparade ändringar till:", nuvarandeMönster);
}

// ==============================================

// ============ MÖNSTER-HANTERING (NYT) ============

function sparaPattern() {
  const namnInput = document.getElementById("pattern-namn");
  let namn = namnInput.value.trim();

  // Om inget namn angivet men vi har ett laddat mönster, spara till det
  if (!namn && nuvarandeMönster) {
    namn = nuvarandeMönster;
  }

  if (!namn) {
    alert("Ange ett namn för mönstret!");
    return;
  }

  // Hämta befintliga mönster
  const patterns = hämtaAllaPatterns();

  // Om mönstret redan finns, fråga om överskrivning
  if (patterns[namn] && namn !== nuvarandeMönster) {
    if (!confirm(`Mönstret "${namn}" finns redan. Vill du skriva över det?`)) {
      return;
    }
  }

  // Skapa mönster-objekt
  const pattern = {
    namn: namn,
    blockData: JSON.parse(JSON.stringify(blockData)), // Deep copy
    config: {
      antalRutor: config.antalRutor,
      antalRader: config.antalRader,
      taktart: config.taktart,
      minstaEnhet: config.minstaEnhet,
      tempo: config.tempo,
    },
    ljud: {
      diskant: valdDiskantLjud,
      bas: valdBasLjud,
    },
    sparadDatum: new Date().toISOString(),
  };

  // Spara mönster
  patterns[namn] = pattern;
  localStorage.setItem("sparadePatterns", JSON.stringify(patterns));

  // Uppdatera tillstånd
  nuvarandeMönster = namn;
  sparaTillstånd();

  // Uppdatera mönstertitel
  uppdateraMönsterTitel();

  // Uppdatera UI
  uppdateraPatternLista();
  namnInput.value = "";

  // Välj det sparade mönstret i listan
  document.getElementById("sparade-patterns").value = namn;

  console.log("Sparade mönster:", namn);
}

function laddaPattern() {
  const select = document.getElementById("sparade-patterns");
  const valdNamn = select.value;

  if (!valdNamn) {
    alert("Välj ett mönster att ladda!");
    return;
  }

  // Kolla om det finns osparade ändringar
  if (!frågaOmSparaÄndringar()) {
    return;
  }

  const patterns = hämtaAllaPatterns();
  const pattern = patterns[valdNamn];

  if (!pattern) {
    alert("Mönster hittades inte!");
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
    document.getElementById("diskant-ljud").value = valdDiskantLjud;
    document.getElementById("bas-ljud").value = valdBasLjud;
  }

  // Uppdatera UI-element
  document.getElementById("tempo-slider").value = config.tempo;
  document.getElementById("tempo-input").value = config.tempo;
  document.getElementById("tempo-värde").textContent = config.tempo;
  document.getElementById("taktart").value = config.taktart;
  document.getElementById("antal-tracks").value = config.antalRader;
  document.getElementById("minsta-enhet").value = config.minstaEnhet;

  // Ladda blockdata
  blockData = JSON.parse(JSON.stringify(pattern.blockData)); // Deep copy

  // Sätt nuvarande mönster
  nuvarandeMönster = valdNamn;
  sparaTillstånd();

  // Uppdatera mönstertitel
  uppdateraMönsterTitel();

  // Återskapa gridet
  skapaGrid();

  console.log("Laddade mönster:", valdNamn);
}

function raderaPattern() {
  const select = document.getElementById("sparade-patterns");
  const valdNamn = select.value;

  if (!valdNamn) {
    alert("Välj ett mönster att radera!");
    return;
  }

  if (!confirm(`Är du säker på att du vill radera "${valdNamn}"?`)) {
    return;
  }

  const patterns = hämtaAllaPatterns();
  delete patterns[valdNamn];
  localStorage.setItem("sparadePatterns", JSON.stringify(patterns));

  uppdateraPatternLista();

  console.log("Raderade mönster:", valdNamn);
}

function hämtaAllaPatterns() {
  const sparade = localStorage.getItem("sparadePatterns");
  return sparade ? JSON.parse(sparade) : {};
}

function uppdateraPatternLista() {
  const select = document.getElementById("sparade-patterns");
  const patterns = hämtaAllaPatterns();
  const namn = Object.keys(patterns).sort();

  // Rensa select
  select.innerHTML = "";

  if (namn.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.disabled = true;
    option.textContent = "-- Inga sparade mönster --";
    select.appendChild(option);
  } else {
    namn.forEach((n) => {
      const option = document.createElement("option");
      option.value = n;
      option.textContent = n;
      select.appendChild(option);
    });
  }
}

// ================================================

// ============ KEYBOARD SHORTCUTS (NYT) ============

document.addEventListener("keydown", function (e) {
  // Ignorera om användaren skriver i ett input-fält
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") {
    return;
  }

  switch (e.key.toLowerCase()) {
    case " ": // Space - Toggle play/stop
      e.preventDefault();
      startaAudioContext().then(function () { // iOS ljudfix
        if (spelareInterval === null) {
          spelareInterval = setInterval(spelaSteg, config.intervall);
        } else {
          stoppaSpelaer();
        }
      });
      break;

    case "c": // C - Rensa
      e.preventDefault();
      blockData = [[], []];
      renderaBlock();
      break;

    case "arrowleft": // Vänsterpil - Sänk tempo
      e.preventDefault();
      const nyttTempoNed = Math.max(40, config.tempo - 5);
      config.tempo = nyttTempoNed;
      document.getElementById("tempo-slider").value = nyttTempoNed;
      document.getElementById("tempo-värde").textContent = nyttTempoNed;

      if (spelareInterval !== null) {
        clearInterval(spelareInterval);
        spelareInterval = setInterval(spelaSteg, config.intervall);
      }
      break;

    case "arrowright": // Högerpil - Höj tempo
      e.preventDefault();
      const nyttTempoUpp = Math.min(200, config.tempo + 5);
      config.tempo = nyttTempoUpp;
      document.getElementById("tempo-slider").value = nyttTempoUpp;
      document.getElementById("tempo-värde").textContent = nyttTempoUpp;

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
    dynamikNivå: config.dynamikNivå,
    ljudläge: config.ljudläge,
    visaMönsterTitel: config.visaMönsterTitel,
    visaKvarttoner: config.visaKvarttoner,
    visaRutnummer: config.visaRutnummer,
    dynamikSpår1: config.dynamikSpår1,
    dynamikSpår2: config.dynamikSpår2,
  };

  localStorage.setItem("rytmConfig", JSON.stringify(sparadConfig));
  localStorage.setItem("rytmBlock", JSON.stringify(blockData));

  console.log("Sparade inställningar och block");
}

function laddaState() {
  // Ladda config
  const sparadConfig = localStorage.getItem("rytmConfig");
  if (sparadConfig) {
    const parsed = JSON.parse(sparadConfig);
    Object.assign(config, parsed);

    // Uppdatera UI-element
    document.getElementById("tempo-slider").value = config.tempo;
    document.getElementById("tempo-input").value = config.tempo;
    document.getElementById("tempo-värde").textContent = config.tempo;

    document.getElementById("volym-diskant").value = Math.round(
      config.volym * 100,
    );
    document.getElementById("volym-diskant-värde").textContent = Math.round(
      config.volym * 100,
    );

    document.getElementById("volym-bas").value = Math.round(
      config.volymTrack2 * 100,
    );
    document.getElementById("volym-bas-värde").textContent = Math.round(
      config.volymTrack2 * 100,
    );

    const dynamikNivå = config.dynamikNivå !== undefined ? config.dynamikNivå : 50;
    document.getElementById("dynamik-nivå").value = dynamikNivå;
    document.getElementById("dynamik-nivå-värde").textContent = dynamikNivåText(dynamikNivå);

    document.getElementById("taktart").value = config.taktart;
    document.getElementById("antal-tracks").value = config.antalRader;
    document.getElementById("minsta-enhet").value = config.minstaEnhet;

    // Ljudläge
    const ljudlägeRadio = document.querySelector(
      `input[name="ljudläge"][value="${config.ljudläge}"]`,
    );
    if (ljudlägeRadio) ljudlägeRadio.checked = true;

    // Checkboxar för visning (NYT)
    document.getElementById("visa-mönster-titel").checked =
      config.visaMönsterTitel !== false;
    document.getElementById("visa-kvarttoner").checked =
      config.visaKvarttoner !== false;
    document.getElementById("visa-rutnummer").checked =
      config.visaRutnummer === true;

    // Dynamik-checkboxar
    document.getElementById("dynamik-spår1").checked =
      config.dynamikSpår1 !== false;
    document.getElementById("dynamik-spår2").checked =
      config.dynamikSpår2 !== false;

    console.log("Laddade sparade inställningar");
  }

  // Ladda blockdata
  const sparadeBlock = localStorage.getItem("rytmBlock");
  if (sparadeBlock) {
    blockData = JSON.parse(sparadeBlock);
    // Se till att vi har rätt antal rader
    while (blockData.length < 2) blockData.push([]);
    console.log("Laddade sparade block");
  }

  // Spara initialt tillstånd
  sparaTillstånd();
}

function renderaBlock() {
  // Rensa alla aktiv-klasser och block-styling
  rutor.forEach((rad) =>
    rad.forEach((ruta) => {
      ruta.classList.remove(
        "aktiv",
        "block-start",
        "block-mitt",
        "block-slut",
        "block-ensam",
      );
    }),
  );

  // Rendera varje block
  for (let rad = 0; rad < config.antalRader; rad++) {
    for (const block of blockData[rad]) {
      for (let i = 0; i < block.längd; i++) {
        const kol = block.start + i;
        if (kol < config.antalRutor && rutor[rad] && rutor[rad][kol]) {
          rutor[rad][kol].classList.add("aktiv");

          // Lägg till positionsklasser för styling
          if (block.längd === 1) {
            rutor[rad][kol].classList.add("block-ensam");
          } else if (i === 0) {
            rutor[rad][kol].classList.add("block-start");
          } else if (i === block.längd - 1) {
            rutor[rad][kol].classList.add("block-slut");
          } else {
            rutor[rad][kol].classList.add("block-mitt");
          }
        }
      }
    }
  }
}

// Spara automatiskt vid sidstängning
window.addEventListener("beforeunload", function () {
  sparaState();
});

// Spara också med jämna mellanrum (var 5:e sekund)
setInterval(sparaState, 5000);

// ========================================

// Beräkna antal rutor baserat på taktart och minsta enhet
function beräknaAntalRutor(taktart, minstaEnhet) {
  const [täljare, nämnare] = taktart.split("/").map(Number);
  return täljare * (minstaEnhet / nämnare);
}

// ============ DRAG-HANTERING (gemensam för mouse och touch) ============

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
  markeraÄndring();
}

// Globala event listeners för att avsluta drag
document.addEventListener("mouseup", avslutaDrag);
document.addEventListener("touchend", avslutaDrag);
document.addEventListener("touchcancel", avslutaDrag);

// =========================================================================

// Funktion för att skapa/återskapa gridet
function skapaGrid() {
  const gridWrapper = document.getElementById("grid-wrapper");
  const grid = document.getElementById("rytm-grid");
  grid.innerHTML = "";

  // Ta bort gamla linjer
  gridWrapper
    .querySelectorAll(".kvartton-linje, .rad-separator-linje")
    .forEach((l) => l.remove());

  rutor = [];

  // Uppdatera grid-layout
  grid.style.gridTemplateColumns = `repeat(${config.antalRutor}, ${config.rutStorlek}px)`;
  grid.style.gridTemplateRows = `repeat(${config.antalRader}, ${config.rutStorlek}px)`;

  // Skapa kvarttoner-rad (ovanför grid)
  skapaKvarttonerRad();

  // Skapa rutor för varje rad
  for (let rad = 0; rad < config.antalRader; rad++) {
    rutor[rad] = [];

    for (let kol = 0; kol < config.antalRutor; kol++) {
      const ruta = document.createElement("div");
      ruta.className = "ruta";
      ruta.dataset.rad = rad;
      ruta.dataset.kol = kol;

      // ============ MOUSE EVENTS ============
      ruta.addEventListener("mousedown", function (e) {
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

      ruta.addEventListener("mouseover", function () {
        if (!ärIDrag) return;

        const r = parseInt(this.dataset.rad);
        const k = parseInt(this.dataset.kol);

        if (r === dragRad) {
          dragSlutKol = k;
          visaDragFörhandsvisning();
        }
      });

      // ============ TOUCH EVENTS (för iPad/iPhone) ============
      ruta.addEventListener(
        "touchstart",
        function (e) {
          e.preventDefault();
          startaAudioContext(); // iOS ljudfix

          const r = parseInt(this.dataset.rad);
          const k = parseInt(this.dataset.kol);

          ärIDrag = true;
          dragRad = r;
          dragStartKol = k;
          dragSlutKol = k;

          visaDragFörhandsvisning();
        },
        { passive: false },
      );

      grid.appendChild(ruta);
      rutor[rad].push(ruta);
    }
  }

  // ============ TOUCH MOVE på grid-nivå (krävs för iOS) ============
  grid.addEventListener(
    "touchmove",
    function (e) {
      if (!ärIDrag) return;
      e.preventDefault();

      const touch = e.touches[0];
      const element = document.elementFromPoint(touch.clientX, touch.clientY);

      if (element && element.classList.contains("ruta")) {
        const r = parseInt(element.dataset.rad);
        const k = parseInt(element.dataset.kol);

        if (r === dragRad) {
          dragSlutKol = k;
          visaDragFörhandsvisning();
        }
      }
    },
    { passive: false },
  );

  // Skapa separator-linjer
  skapaSeparatorLinjer();

  // Skapa rutnummer-rad (under grid)
  skapaRutnummerRad();

  // Visa/dölj bas-volym
  const volymBasGrupp = document.getElementById("volym-bas-grupp");
  if (config.antalRader === 2) {
    volymBasGrupp.style.display = "block";
  } else {
    volymBasGrupp.style.display = "none";
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
      rutor[dragRad][k].classList.add("drag-förhandsvisning");
    }
  }
}

function rensaDragFörhandsvisning() {
  rutor.forEach((rad) =>
    rad.forEach((ruta) => {
      ruta.classList.remove("drag-förhandsvisning");
    }),
  );
}

// Skapa kvarttoner-rad (NYT)
function skapaKvarttonerRad() {
  // Ta bort befintlig rad om den finns
  const befintlig = document.getElementById("kvarttoner-rad");
  if (befintlig) befintlig.remove();

  const kvarttonerRad = document.createElement("div");
  kvarttonerRad.id = "kvarttoner-rad";

  // Visa/dölj baserat på checkbox
  const visaKvarttoner = document.getElementById("visa-kvarttoner").checked;
  if (!visaKvarttoner) {
    kvarttonerRad.classList.add("dold");
  }

  const rutorPerKvartton = config.minstaEnhet / 4;
  const antalKvarttoner = Math.floor(config.antalRutor / rutorPerKvartton);

  const gridWrapper = document.getElementById("grid-wrapper");

  for (let i = 0; i < antalKvarttoner; i++) {
    const kvartton = document.createElement("div");
    kvartton.className = "kvartton";
    kvartton.textContent = i + 1;

    // Position: centrerad över FÖRSTA rutan i varje kvarttonsgrupp
    const gruppStart = i * rutorPerKvartton;
    const position =
      gruppStart * config.rutStorlek +
      gruppStart * config.gap +
      config.rutStorlek / 2;

    kvartton.style.left = position + "px";
    kvartton.style.transform = "translateX(-50%)";

    kvarttonerRad.appendChild(kvartton);
  }

  gridWrapper.insertBefore(kvarttonerRad, gridWrapper.firstChild);
}

// Skapa separator-linjer (NYT)
function skapaSeparatorLinjer() {
  const gridWrapper = document.getElementById("grid-wrapper");
  const grid = document.getElementById("rytm-grid");

  const rutorPerKvartton = config.minstaEnhet / 4;
  const antalKvarttoner = Math.floor(config.antalRutor / rutorPerKvartton);

  const gridHöjd =
    config.antalRader * config.rutStorlek +
    (config.antalRader - 1) * config.gap;

  // Skapa vertikala linjer för kvarttoner (mellan grupperna)
  for (let i = 1; i < antalKvarttoner; i++) {
    const linje = document.createElement("div");
    linje.className = "kvartton-linje";

    // Position: efter sista rutan i gruppen, mitt i gapet
    const position =
      i * rutorPerKvartton * config.rutStorlek +
      (i * rutorPerKvartton - 1) * config.gap +
      config.gap / 2 -
      1.5;

    linje.style.left = position + "px";
    linje.style.height = gridHöjd + "px";

    grid.appendChild(linje);
  }

  // Skapa horisontell linje mellan bas och diskant
  if (config.antalRader === 2) {
    const linje = document.createElement("div");
    linje.className = "rad-separator-linje";

    // Position: efter första raden, mitt i gapet
    const position = config.rutStorlek + config.gap / 2 - 1.5;
    const gridBredd =
      config.antalRutor * config.rutStorlek +
      (config.antalRutor - 1) * config.gap;

    linje.style.top = position + "px";
    linje.style.width = gridBredd + "px";

    grid.appendChild(linje);
  }
}

// Skapa rutnummer-rad (NYT)
function skapaRutnummerRad() {
  // Ta bort befintlig rad om den finns
  const befintlig = document.getElementById("rutnummer-rad");
  if (befintlig) befintlig.remove();

  const rutnummerRad = document.createElement("div");
  rutnummerRad.id = "rutnummer-rad";

  // Visa/dölj baserat på checkbox
  const visaRutnummer = document.getElementById("visa-rutnummer").checked;
  if (!visaRutnummer) {
    rutnummerRad.classList.add("dold");
  }

  const gridWrapper = document.getElementById("grid-wrapper");

  for (let i = 0; i < config.antalRutor; i++) {
    const nummer = document.createElement("div");
    nummer.className = "rutnummer";
    nummer.textContent = i + 1;

    // Position: centrum av varje ruta
    const position =
      i * config.rutStorlek + i * config.gap + config.rutStorlek / 2;
    nummer.style.left = position + "px";
    nummer.style.transform = "translateX(-50%)";

    rutnummerRad.appendChild(nummer);
  }

  gridWrapper.appendChild(rutnummerRad);
}

// Uppdatera mönstertitel (NYT)
function uppdateraMönsterTitel() {
  const titel = document.getElementById("mönster-titel");
  const visaTitel = document.getElementById("visa-mönster-titel").checked;

  if (visaTitel) {
    titel.classList.remove("dold");
    titel.textContent = nuvarandeMönster || "Nytt mönster";
  } else {
    titel.classList.add("dold");
  }
}

// ============ RYTMDYNAMIK ============

// Beräknar volymfaktor baserat på position i takten och taktart.
// dynamikNivå (0–100) styr hur stor skillnaden är:
//   0   = alla slag lika starka (faktor 1.0)
//   50  = mellannivå
//   100 = maximal skillnad (accenterna på full volym, svaga slag mycket tystare)
function beräknaDynamikFaktor(position, taktart, minstaEnhet) {
  const [, nämnare] = taktart.split("/").map(Number);
  const rutorPerSlag = minstaEnhet / nämnare;
  const slagIndex = Math.floor(position / rutorPerSlag);

  // Grundmönster per taktart – värden 0..1 där 1 = accent, 0 = svagast möjligt
  // Dessa relativa värden skalas sedan av dynamikNivå
  const grundMönster = {
    "4/4": [1.0, 0.0, 0.5, 0.0],
    "3/4": [1.0, 0.0, 0.0],
    "6/8": [1.0, 0.0, 0.0, 0.6, 0.0, 0.0],
    "2/2": [1.0, 0.0],
  };

  const mönster = grundMönster[taktart] || [1.0];
  const relativ = mönster[slagIndex % mönster.length]; // 0..1

  // Skala: vid nivå 0 → alla = 1.0; vid nivå 100 → accent = 1.0, svagast = minFaktor
  const minFaktor = 0.40; // svagaste möjliga slag vid max dynamik
  const t = config.dynamikNivå / 100; // 0..1
  return 1.0 - t * (1.0 - minFaktor) * (1.0 - relativ);
}

// =====================================


// Ljud-funktion med spår 1/spår 2 - nu med dynamisk tonlängd, perkussion och rytmdynamik
function spelaLjud(radIndex, blockLängd = 1, position = 0) {
  if (config.ljudläge === "perkussion") {
    spelaPerkussion(radIndex, position);
  } else {
    spelaTon(radIndex, blockLängd, position);
  }
}

function spelaPerkussion(radIndex, position = 0) {
  const ljudnamn = radIndex === 0 ? valdDiskantLjud : valdBasLjud;
  const sample = samples.ljudfiler[ljudnamn];
  const basVolym = radIndex === 0 ? config.volym : config.volymTrack2;
  const dynamikAktiv = radIndex === 0 ? config.dynamikSpår1 : config.dynamikSpår2;

  if (!sample) {
    console.warn("Sample ej laddat för rad", radIndex, ljudnamn);
    return;
  }

  const dynamikFaktor = dynamikAktiv
    ? beräknaDynamikFaktor(position, config.taktart, config.minstaEnhet)
    : 1.0;
  const volym = basVolym * dynamikFaktor;

  const source = audioContext.createBufferSource();
  const gainNode = audioContext.createGain();

  source.buffer = sample;
  source.connect(gainNode);
  gainNode.connect(audioContext.destination);

  gainNode.gain.value = volym;
  source.start();
}

function spelaTon(radIndex, blockLängd = 1, position = 0) {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  const basLängd = config.intervall / 1000;
  const tonLängd = basLängd * blockLängd * 0.9;

  const dynamikAktiv = radIndex === 0 ? config.dynamikSpår1 : config.dynamikSpår2;
  const dynamikFaktor = dynamikAktiv
    ? beräknaDynamikFaktor(position, config.taktart, config.minstaEnhet)
    : 1.0;

  if (radIndex === 0) {
    // Spår 1
    oscillator.frequency.value = 1200;
    const toppVolym = config.volym * 0.8 * dynamikFaktor;
    gainNode.gain.setValueAtTime(toppVolym, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + tonLängd,
    );
    oscillator.start();
    oscillator.stop(audioContext.currentTime + tonLängd);
  } else {
    // Spår 2
    oscillator.frequency.value = 400;
    const toppVolym = config.volymTrack2 * 1.2 * dynamikFaktor;
    gainNode.gain.setValueAtTime(toppVolym, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + tonLängd,
    );
    oscillator.start();
    oscillator.stop(audioContext.currentTime + tonLängd);
  }
}

// Uppspelningsloop
function spelaSteg() {
  // iOS kan suspendera AudioContext i bakgrunden - återuppta om nödvändigt
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  rutor.forEach((rad) => rad.forEach((r) => r.classList.remove("spelar")));

  for (let rad = 0; rad < config.antalRader; rad++) {
    rutor[rad][nuvarandeRuta].classList.add("spelar");

    // Kolla om denna position är START på ett block
    const block = hittaBlock(rad, nuvarandeRuta);
    if (block && block.start === nuvarandeRuta) {
      // Spela ljud med blocklängd och position för rytmdynamik
      spelaLjud(rad, block.längd, nuvarandeRuta);
    }
  }

  nuvarandeRuta = (nuvarandeRuta + 1) % config.antalRutor;
}

// Stoppa uppspelning
function stoppaSpelaer() {
  if (spelareInterval !== null) {
    clearInterval(spelareInterval);
    spelareInterval = null;
    rutor.forEach((rad) => rad.forEach((r) => r.classList.remove("spelar")));
    nuvarandeRuta = 0;
  }
}

// ============ EVENT LISTENERS ============

// Flik-hantering (NYT)
document.querySelectorAll(".flik").forEach((flik) => {
  flik.addEventListener("click", function () {
    växlaFlik(this.dataset.flik);
  });
});

// Ljudval (NYT)
document.getElementById("diskant-ljud").addEventListener("change", function () {
  valdDiskantLjud = this.value;
  markeraÄndring();
  console.log("Valde diskant-ljud:", valdDiskantLjud);
});

document.getElementById("bas-ljud").addEventListener("change", function () {
  valdBasLjud = this.value;
  markeraÄndring();
  console.log("Valde bas-ljud:", valdBasLjud);
});

// Dubbelklick på mönsterlista laddar mönster (NYT)
document
  .getElementById("sparade-patterns")
  .addEventListener("dblclick", function () {
    if (this.value) {
      laddaPattern();
    }
  });

// Spelknappar
document.getElementById("spela").addEventListener("click", function () {
  startaAudioContext().then(function () { // iOS ljudfix
    if (spelareInterval === null) {
      spelareInterval = setInterval(spelaSteg, config.intervall);
    }
  });
});

document.getElementById("stopp").addEventListener("click", stoppaSpelaer);

document.getElementById("rensa").addEventListener("click", function () {
  // Kolla om det finns osparade ändringar
  if (!frågaOmSparaÄndringar()) {
    return;
  }

  blockData = [[], []];
  nuvarandeMönster = null;
  sparaTillstånd();
  uppdateraMönsterTitel();
  renderaBlock();
});

// Pattern-hantering knappar (NYT)
document
  .getElementById("spara-pattern")
  .addEventListener("click", sparaPattern);
document
  .getElementById("ladda-pattern")
  .addEventListener("click", laddaPattern);
document
  .getElementById("radera-pattern")
  .addEventListener("click", raderaPattern);

// Tempo slider och input
const tempoSlider = document.getElementById("tempo-slider");
const tempoInput = document.getElementById("tempo-input");
const tempoVärde = document.getElementById("tempo-värde");

tempoSlider.addEventListener("input", function () {
  config.tempo = parseInt(this.value);
  tempoVärde.textContent = config.tempo;
  tempoInput.value = config.tempo;
  markeraÄndring();

  if (spelareInterval !== null) {
    clearInterval(spelareInterval);
    spelareInterval = setInterval(spelaSteg, config.intervall);
  }
});

tempoInput.addEventListener("input", function () {
  let värde = parseInt(this.value);
  if (värde < 40) värde = 40;
  if (värde > 200) värde = 200;
  if (isNaN(värde)) return;

  config.tempo = värde;
  tempoVärde.textContent = värde;
  tempoSlider.value = värde;
  markeraÄndring();

  if (spelareInterval !== null) {
    clearInterval(spelareInterval);
    spelareInterval = setInterval(spelaSteg, config.intervall);
  }
});

// Markera text när BPM-input får fokus (NYT)
tempoInput.addEventListener("focus", function () {
  this.select();
});

// Visnings-checkboxar (NYT)
document
  .getElementById("visa-mönster-titel")
  .addEventListener("change", function () {
    config.visaMönsterTitel = this.checked;
    uppdateraMönsterTitel();
    sparaState();
  });

document
  .getElementById("visa-kvarttoner")
  .addEventListener("change", function () {
    config.visaKvarttoner = this.checked;
    const kvarttonerRad = document.getElementById("kvarttoner-rad");
    if (this.checked) {
      kvarttonerRad.classList.remove("dold");
    } else {
      kvarttonerRad.classList.add("dold");
    }
    sparaState();
  });

document
  .getElementById("visa-rutnummer")
  .addEventListener("change", function () {
    config.visaRutnummer = this.checked;
    const rutnummerRad = document.getElementById("rutnummer-rad");
    if (this.checked) {
      rutnummerRad.classList.remove("dold");
    } else {
      rutnummerRad.classList.add("dold");
    }
    sparaState();
  });

// Volym slider (diskant/track 1)
const volymDiskantSlider = document.getElementById("volym-diskant");
const volymDiskantVärde = document.getElementById("volym-diskant-värde");

volymDiskantSlider.addEventListener("input", function () {
  const procent = parseInt(this.value);
  config.volym = procent / 100;
  volymDiskantVärde.textContent = procent;
});

// Volym slider track 2 (bas)
const volymBasSlider = document.getElementById("volym-bas");
const volymBasVärde = document.getElementById("volym-bas-värde");

volymBasSlider.addEventListener("input", function () {
  const procent = parseInt(this.value);
  config.volymTrack2 = procent / 100;
  volymBasVärde.textContent = procent;
});

// Dynamiknivå slider
const dynamikNivåSlider = document.getElementById("dynamik-nivå");
const dynamikNivåVärde = document.getElementById("dynamik-nivå-värde");

function dynamikNivåText(värde) {
  if (värde <= 15) return "Minimal";
  if (värde <= 35) return "Liten";
  if (värde <= 65) return "Medel";
  if (värde <= 85) return "Stor";
  return "Maximal";
}

dynamikNivåSlider.addEventListener("input", function () {
  config.dynamikNivå = parseInt(this.value);
  dynamikNivåVärde.textContent = dynamikNivåText(config.dynamikNivå);
  sparaState();
});

// Ljudläge radio-knappar
document.querySelectorAll('input[name="ljudläge"]').forEach((radio) => {
  radio.addEventListener("change", function () {
    config.ljudläge = this.value;
    console.log("Ljudläge:", config.ljudläge);
  });
});

// Aside-inställningar - Tillämpa-knappen
document.getElementById("tillämpa").addEventListener("click", function () {
  // Kolla om det finns osparade ändringar
  if (!frågaOmSparaÄndringar()) {
    return;
  }

  stoppaSpelaer();

  config.taktart = document.getElementById("taktart").value;
  config.antalRader = parseInt(document.getElementById("antal-tracks").value);
  config.minstaEnhet = parseInt(document.getElementById("minsta-enhet").value);

  config.antalRutor = beräknaAntalRutor(config.taktart, config.minstaEnhet);

  // Rensa blockdata vid ändring av grid-storlek
  blockData = [[], []];
  nuvarandeMönster = null;
  sparaTillstånd();

  skapaGrid();
});

// Dynamik-checkboxar
document
  .getElementById("dynamik-spår1")
  .addEventListener("change", function () {
    config.dynamikSpår1 = this.checked;
    sparaState();
  });

document
  .getElementById("dynamik-spår2")
  .addEventListener("change", function () {
    config.dynamikSpår2 = this.checked;
    sparaState();
  });

// ============ VÄLKOMSTMODAL ============

let nuvarandeModalSteg = 0;
const antalModalSteg = 4;

function visaModalSteg(steg) {
  // Dölj alla steg
  document
    .querySelectorAll(".modal-steg")
    .forEach((s) => s.classList.remove("aktiv"));
  document
    .querySelectorAll(".steg-punkt")
    .forEach((p) => p.classList.remove("aktiv"));

  // Visa valt steg
  document.getElementById(`modal-steg-${steg}`).classList.add("aktiv");
  document
    .querySelector(`.steg-punkt[data-steg="${steg}"]`)
    .classList.add("aktiv");

  // Uppdatera knappar
  const föregående = document.getElementById("modal-föregående");
  const nästa = document.getElementById("modal-nästa");

  föregående.style.visibility = steg === 0 ? "hidden" : "visible";

  if (steg === antalModalSteg - 1) {
    nästa.textContent = "Kom igång! ✓";
  } else {
    nästa.textContent = "Nästa →";
  }

  nuvarandeModalSteg = steg;
}

function öppnaModal() {
  nuvarandeModalSteg = 0;
  visaModalSteg(0);
  document.getElementById("välkomst-modal").classList.add("synlig");
}

function stängaModal() {
  document.getElementById("välkomst-modal").classList.remove("synlig");
  localStorage.setItem("rytmIntroVisad", "true");
}

// Knappar i modalen
document.getElementById("modal-nästa").addEventListener("click", function () {
  if (nuvarandeModalSteg < antalModalSteg - 1) {
    visaModalSteg(nuvarandeModalSteg + 1);
  } else {
    stängaModal();
  }
});

document
  .getElementById("modal-föregående")
  .addEventListener("click", function () {
    if (nuvarandeModalSteg > 0) {
      visaModalSteg(nuvarandeModalSteg - 1);
    }
  });

document
  .getElementById("modal-stäng-text")
  .addEventListener("click", stängaModal);

// Stäng om man klickar utanför modalrutan
document
  .getElementById("välkomst-modal")
  .addEventListener("click", function (e) {
    if (e.target === this) stängaModal();
  });

// "Visa introduktionen igen"-knapp i hjälpfliken
document
  .getElementById("visa-intro-igen")
  .addEventListener("click", öppnaModal);

// Visa modal första gången
if (!localStorage.getItem("rytmIntroVisad")) {
  // Kort fördröjning så sidan hinner ladda klart
  setTimeout(öppnaModal, 300);
}

// =======================================

// ============ INITIALISERING ============
laddaState(); // Ladda sparade inställningar först
laddaSamples(); // Ladda ljudsamples
skapaGrid(); // Sedan skapa gridet (som även laddar rytmmönstret)
uppdateraPatternLista(); // Ladda sparade patterns (NYT)
uppdateraMönsterTitel(); // Uppdatera mönstertitel (NYT)
