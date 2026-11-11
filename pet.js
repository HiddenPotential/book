// Reading pet for Next Read.
// You choose a pet (dragon, kitty, bunny, owl or fox). Every minute you read is 1 treat.
// Treats make your pet grow: it starts as an egg and grows into a royal reader with a crown.
// Each time you save reading time you get a prize screen.
// The pet's growth is worked out from your saved reading sessions, so restoring a backup restores it too.
// Uses helpers from app.js and reading.js ($, textEl, loadLog, startOfDay, DAY_MS, chime, showToast).

const PET_KEY = "nextread-pet"; // { name, species }

// Treats needed for each stage (1 treat = 1 minute of reading).
// "prefix" goes in front of the species word, e.g. "Little" + "fox".
const PET_STAGES = [
  { at: 0,   key: "egg",     name: "Mystery egg" },
  { at: 10,  key: "cracked", name: "Wobbly egg" },
  { at: 30,  key: "baby",    prefix: "Baby" },
  { at: 90,  key: "kid",     prefix: "Little" },
  { at: 200, key: "big",     prefix: "Big" },
  { at: 400, key: "wise",    prefix: "Wise" },
  { at: 800, key: "royal",   prefix: "Royal" },
];

// ======================================================================
// Species: colors, the special thing each one gets at the "Little" stage, and its parts
// ======================================================================
const OUT = "#3b2c25"; // outline color stays dark in both light and dark mode
const INK = `stroke="${OUT}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"`;
const THIN = `stroke="${OUT}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
const mirror = (svg) => `<g transform="translate(200 0) scale(-1 1)">${svg}</g>`;

const SPECIES = {
  dragon: {
    word: "dragon", label: "Dragon", blurb: "Grows wings and horns",
    c: ["#c4ef9f", "#8fd17e", "#5fae5a"], belly: ["#fffbe0", "#ffe58f"], bellyLine: "#e0bf5c",
    kidMessage: "Your dragon grew wings!",
    back: (at, G) => {
      const size = at("big") ? 1 : 0.72;
      const wing = `<g transform="translate(64 122) scale(${size}) translate(-64 -122)">
          <path d="M64 124c-26 0-48-24-46-58 8 10 18 12 26 10-2 10 4 18 12 20-4 8 0 18 8 28z" fill="url(#accent2-${G.u})" ${INK}/>
          <path d="M62 120L26 74M62 120L44 78M62 120L54 96" stroke="${OUT}" stroke-width="2" stroke-linecap="round" opacity=".55"/></g>`;
      return (at("kid") ? wing + mirror(wing) : "")
        + `<path d="M134 168c20 8 36 2 40-18 6 14 2 30-14 36-10 4-22 2-30-4z" fill="${G.body}" ${INK}/>
           <path d="M172 152l-6-14 14 4z" fill="#ffb347" ${INK} stroke-width="2.6"/>`
        + (at("kid") ? `<path d="M134 110l14-4-6 12zM142 126l14 0-9 11zM146 144l13 4-11 8z" fill="#ffb347" ${INK} stroke-width="2.6"/>` : "");
    },
    ears: (at, G) => at("kid")
      ? `<path d="M74 58c-10-10-12-24-6-34 4 10 12 18 22 22z" fill="url(#horn-${G.u})" ${INK}/>` + mirror(`<path d="M74 58c-10-10-12-24-6-34 4 10 12 18 22 22z" fill="url(#horn-${G.u})" ${INK}/>`)
      : `<circle cx="80" cy="50" r="7" fill="url(#horn-${G.u})" ${INK}/><circle cx="120" cy="50" r="7" fill="url(#horn-${G.u})" ${INK}/>`,
    headTop: (at, royal) => at("kid")
      ? (royal ? "" : `<path d="M88 48l5-12 6 9 5-11 5 11 4-8 3 12" fill="#ffb347" ${INK} stroke-width="2.6"/>`)
      : `<path d="M96 44c-2-10 8-14 12-8-6-1-8 3-6 8z" fill="#8fd17e" ${INK} stroke-width="2.6"/>`,
    face: () => `<ellipse cx="100" cy="104" rx="20" ry="12" fill="#b6e796" stroke="${OUT}" stroke-width="2.2"/>
      <ellipse cx="93" cy="101" rx="2" ry="1.6" fill="${OUT}"/><ellipse cx="107" cy="101" rx="2" ry="1.6" fill="${OUT}"/>`,
  },

  cat: {
    word: "kitty", label: "Kitty", blurb: "Gets tiger stripes",
    c: ["#ffdcb0", "#ffb36b", "#e0823c"], belly: ["#fffaf0", "#ffe6c8"], bellyLine: null,
    kidMessage: "Your kitty got its tiger stripes!",
    back: (at, G) => {
      const tail = "M136 172c28 2 40-20 32-42-4-10 2-18 10-16";
      return `<path d="${tail}" stroke="${OUT}" stroke-width="19" fill="none" stroke-linecap="round"/>
        <path d="${tail}" stroke="${G.mid}" stroke-width="12" fill="none" stroke-linecap="round"/>`
        + (at("kid") ? `<path d="M164 146l9 3M166 132l9-1" stroke="${G.dark}" stroke-width="4" stroke-linecap="round"/>` : "");
    },
    bodyMarks: (at, G) => at("kid")
      ? `<path d="M56 130c6 2 10 6 12 11M54 148c6 2 10 6 11 11" stroke="${G.dark}" stroke-width="4" stroke-linecap="round" fill="none"/>`
        + mirror(`<path d="M56 130c6 2 10 6 12 11M54 148c6 2 10 6 11 11" stroke="${G.dark}" stroke-width="4" stroke-linecap="round" fill="none"/>`)
      : "",
    ears: (at, G) => {
      const ear = `<path d="M62 76L64 30l34 22z" fill="${G.body}" ${INK}/><path d="M69 66l1-24 19 12z" fill="#ffb7c3"/>`;
      return ear + mirror(ear);
    },
    headTop: (at, royal, G) => at("kid") && !royal
      ? `<path d="M100 50v12M89 52l3 9M111 52l-3 9" stroke="${G.dark}" stroke-width="4" stroke-linecap="round"/>` : "",
    face: () => `<ellipse cx="91" cy="105" rx="11" ry="8" fill="#fff6ea"/><ellipse cx="109" cy="105" rx="11" ry="8" fill="#fff6ea"/>
      <path d="M95 99h10l-5 6z" fill="#ff8fa3" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M78 104l-24-5M78 109l-23 4" stroke="${OUT}" stroke-width="1.8" stroke-linecap="round" opacity=".7"/>`
      + mirror(`<path d="M78 104l-24-5M78 109l-23 4" stroke="${OUT}" stroke-width="1.8" stroke-linecap="round" opacity=".7"/>`),
    mouth: { happy: `<path d="M91 109c2 5 9 5 9 0 0 5 7 5 9 0" ${THIN}/>` },
  },

  bunny: {
    word: "bunny", label: "Bunny", blurb: "Finds a flower to wear",
    c: ["#ffffff", "#f1ebf7", "#cbbfdc"], belly: ["#fffafd", "#fde3ec"], bellyLine: null,
    kidMessage: "Your bunny found a flower to wear!",
    back: () => `<circle cx="146" cy="170" r="15" fill="#fffafd" ${INK}/><path d="M140 166c3-3 7-3 9 0" ${THIN} stroke-width="2" opacity=".5"/>`,
    ears: (at, G, mood) => {
      const left = `<g transform="rotate(-12 80 54)"><ellipse cx="80" cy="24" rx="12" ry="34" fill="${G.body}" ${INK}/><ellipse cx="80" cy="26" rx="5.5" ry="25" fill="#ffc4d3"/></g>`;
      // A sleepy bunny's right ear flops over
      const right = mood === "sleepy"
        ? `<g transform="rotate(70 120 54)"><ellipse cx="120" cy="24" rx="12" ry="34" fill="${G.body}" ${INK}/><ellipse cx="120" cy="26" rx="5.5" ry="25" fill="#ffc4d3"/></g>`
        : `<g transform="rotate(12 120 54)"><ellipse cx="120" cy="24" rx="12" ry="34" fill="${G.body}" ${INK}/><ellipse cx="120" cy="26" rx="5.5" ry="25" fill="#ffc4d3"/></g>`;
      return left + right;
    },
    headTop: (at) => at("kid")
      ? `<g transform="translate(66 56)">${[0, 72, 144, 216, 288].map((r) => `<ellipse cx="0" cy="-7" rx="5" ry="7" transform="rotate(${r})" fill="#ff9eb0" stroke="${OUT}" stroke-width="1.8"/>`).join("")}
         <circle r="4" fill="#ffd36e" stroke="${OUT}" stroke-width="1.8"/></g>` : "",
    face: () => `<path d="M96 100h8l-4 4.5z" fill="#ff8fa3" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M100 104.5v4" ${THIN} stroke-width="2"/>`,
    mouth: { happy: `<path d="M92 108c3 4 6 4 8 0 2 4 5 4 8 0" ${THIN}/><path d="M96.5 109.5h7v6h-7z" fill="#fff" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/><path d="M100 109.5v6" stroke="${OUT}" stroke-width="1.4"/>` },
    cheeks: "#ffb7c8",
  },

  owl: {
    word: "owl", label: "Owl", blurb: "Grows fluffy ear tufts",
    c: ["#e3bf9b", "#b9875f", "#8a5a3c"], belly: ["#fff6e6", "#f2d7b0"], bellyLine: null,
    feet: "#ffb347",
    kidMessage: "Your owl grew fluffy ear tufts!",
    back: (at, G) => `<path d="M84 176l16 16 16-16z" fill="${G.dark}" ${INK} stroke-width="2.6"/>`,
    bellyMarks: (at, G) => `<path d="M84 142l5 5 5-5M106 142l5 5 5-5M95 156l5 5 5-5M80 158l4 4 4-4M112 158l4 4 4-4M88 170l4 4 4-4M104 170l4 4 4-4" stroke="${G.dark}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    front: (at, G) => {
      const wing = `<path d="M54 118c-10 22-8 46 8 60 8-16 10-38 2-56z" fill="${G.dark}" ${INK}/><path d="M58 140c2 8 3 16 2 24" stroke="${G.mid}" stroke-width="2.4" stroke-linecap="round" fill="none"/>`;
      return wing + mirror(wing);
    },
    ears: (at, G) => at("kid")
      ? `<path d="M66 64l-10-30 26 20z" fill="${G.dark}" ${INK}/>` + mirror(`<path d="M66 64l-10-30 26 20z" fill="${G.dark}" ${INK}/>`)
      : "",
    headTop: () => `<path d="M100 56c-8-6-26-8-34 2 8-2 14 0 20 4M100 56c8-6 26-8 34 2-8-2-14 0-20 4" fill="none" stroke="${OUT}" stroke-width="2" opacity=".4"/>`,
    eyeRings: true,
    face: (mood) => mood === "hungry"
      ? `<path d="M92 98h16l-8 6z" fill="#ffb347" stroke="${OUT}" stroke-width="2.2" stroke-linejoin="round"/>
         <path d="M94 106h12l-6 9z" fill="#ffb347" stroke="${OUT}" stroke-width="2.2" stroke-linejoin="round"/>`
      : `<path d="M93 98h14l-7 12z" fill="#ffb347" stroke="${OUT}" stroke-width="2.2" stroke-linejoin="round"/>`,
    mouth: { happy: "", hungry: "", sleepy: "" }, // the beak is the mouth
  },

  fox: {
    word: "fox", label: "Fox", blurb: "Gets a big fluffy tail",
    c: ["#ffc796", "#ff9a4d", "#e0682a"], belly: ["#ffffff", "#fff0e2"], bellyLine: null,
    feet: "#5a3a2e",
    kidMessage: "Your fox's tail got extra fluffy!",
    back: (at, G) => {
      const size = at("kid") ? 1 : 0.7;
      return `<g transform="translate(134 176) scale(${size}) translate(-134 -176)">
        <path d="M134 178c36 4 54-22 48-50-2-10 2-18 8-22 8 14 10 34 2 52-10 22-32 30-58 26z" fill="${G.body}" ${INK}/>
        <path d="M182 128c-2-10 2-18 8-22 8 14 10 34 2 52-4-12-6-20-10-30z" fill="#fffaf2" ${INK} stroke-width="2.6"/></g>`;
    },
    ears: (at, G) => {
      const ear = `<path d="M62 68L66 22l32 30z" fill="${G.body}" ${INK}/><path d="M64.5 40L66 22l12 11z" fill="#5a3a2e"/><path d="M70 58l1.5-22 16 15z" fill="#fff3e3"/>`;
      return ear + mirror(ear);
    },
    headTop: () => "",
    face: () => `<path d="M58 92c10 14 26 22 42 22s32-8 42-22c-6 26-22 38-42 38s-36-12-42-38z" fill="#fffaf2"/>
      <ellipse cx="100" cy="103" rx="6" ry="4.2" fill="${OUT}"/><ellipse cx="98" cy="101.6" rx="2" ry="1.2" fill="#fff" opacity=".7"/>`,
  },
};
const SPECIES_ORDER = ["dragon", "cat", "bunny", "owl", "fox"];

// What each stage says when you reach it
function growMessage(stageKey, sp) {
  return {
    cracked: "Your egg is wobbling! Something is inside…",
    baby: `Your egg hatched! It's a baby ${sp.word}!`,
    kid: sp.kidMessage,
    big: `Your ${sp.word} is big now, and it loves holding books!`,
    wise: `Your ${sp.word} put on reading glasses. So wise!`,
    royal: `Your ${sp.word} got a crown. Royal reader!`,
  }[stageKey];
}

// ======================================================================
// Pet state
// ======================================================================
function petData() {
  try { return JSON.parse(localStorage.getItem(PET_KEY)) || {}; } catch { return {}; }
}
function savePetData(changes) {
  localStorage.setItem(PET_KEY, JSON.stringify({ ...petData(), ...changes }));
}
function petName() { return petData().name || "Pip"; }
function setPetName(name) { savePetData({ name }); }
function chosenSpecies() { return SPECIES[petData().species] ? petData().species : null; }
function petSpecies() { return chosenSpecies() || "dragon"; }

function totalReadSeconds() {
  return loadLog().sessions.reduce((sum, s) => sum + s.seconds, 0);
}

function treatsFor(seconds) {
  return Math.floor(seconds / 60);
}

function stageName(stage, speciesKey = petSpecies()) {
  return stage.prefix ? `${stage.prefix} ${SPECIES[speciesKey].word}` : stage.name;
}

function stageFor(treats) {
  let index = 0;
  PET_STAGES.forEach((s, i) => { if (treats >= s.at) index = i; });
  const next = PET_STAGES[index + 1] || null;
  return {
    ...PET_STAGES[index], name: stageName(PET_STAGES[index]), index,
    next: next && { ...next, name: stageName(next) },
  };
}

// happy (read today), hungry (last read yesterday), sleepy (2+ days ago or never)
function petMood() {
  const last = loadLog().sessions.reduce((max, s) => Math.max(max, s.start + s.seconds * 1000), 0);
  if (!last) return "sleepy";
  if (last >= startOfDay()) return "happy";
  if (last >= startOfDay() - DAY_MS) return "hungry";
  return "sleepy";
}

function moodText(stage, mood, name) {
  if (stage.key === "egg") return "Read to keep your egg warm. Something will hatch!";
  if (stage.key === "cracked") return "Your egg is wobbling. Keep reading to hatch it!";
  return {
    happy: `${name} is happy. You read today!`,
    hungry: `${name} is hungry for a story!`,
    sleepy: `${name} is sleepy… reading will wake it up.`,
  }[mood];
}

// ======================================================================
// Drawing the pet (one SVG; parts are added as it grows)
// ======================================================================
let petDrawCount = 0; // gives each drawing its own gradient ids, so two pets on the page don't clash

function petSVG(stageKey, mood = "happy", speciesKey = petSpecies()) {
  const u = ++petDrawCount;
  const sp = SPECIES[speciesKey];
  const shadow = (rx) => `<ellipse cx="100" cy="190" rx="${rx}" ry="7" fill="rgba(40,25,15,.18)"/>`;

  // ---------- Eggs (spotted in the colors of the pet inside) ----------
  if (stageKey === "egg" || stageKey === "cracked") {
    const cracked = stageKey === "cracked";
    const peek = cracked
      ? `<path d="M50 104l12-9 11 11 12-11 12 11 12-11 12 11 12-10 9 8-1 13-11-6-12 9-12-9-12 9-12-9-12 9-12-9-9 6z" fill="${OUT}"/>
         <ellipse cx="88" cy="112" rx="5" ry="5.5" fill="#fff3b8"/><ellipse cx="112" cy="112" rx="5" ry="5.5" fill="#fff3b8"/>
         <circle cx="89" cy="113" r="2.6" fill="${OUT}"/><circle cx="113" cy="113" r="2.6" fill="${OUT}"/>
         <path d="M50 104l12-9 11 11 12-11 12 11 12-11 12 11 12-10 9 8" ${THIN}/>`
      : "";
    const chips = cracked
      ? `<path d="M40 70l8-4 2 8z" fill="#fff6e4" ${THIN}/><path d="M158 76l9 2-5 7z" fill="#fff6e4" ${THIN}/>
         <path d="M34 92h-8M168 96h9M44 56l-5-5M156 58l5-6" ${THIN}/>`
      : "";
    const [light, mid, dark] = sp.c;
    return `
      <svg class="pet-svg" viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <radialGradient id="egg-${u}" cx="38%" cy="30%" r="80%">
            <stop offset="0" stop-color="#fffdf6"/><stop offset=".6" stop-color="#fbeed2"/><stop offset="1" stop-color="#e9d2a6"/>
          </radialGradient>
        </defs>
        ${shadow(46)}
        <g class="pet-body">
          <path d="M100 30c34 0 56 52 56 92 0 38-24 64-56 64s-56-26-56-64c0-40 22-92 56-92z" fill="url(#egg-${u})" ${INK}/>
          <circle cx="76" cy="84" r="9" fill="${mid}" stroke="${dark}" stroke-width="1.5"/>
          <circle cx="126" cy="80" r="12" fill="#ffb7c3"/><circle cx="123" cy="76" r="3.5" fill="#ffd9df"/>
          <circle cx="82" cy="150" r="12" fill="${mid}" stroke="${dark}" stroke-width="1.5"/><circle cx="79" cy="146" r="3.5" fill="${light}"/>
          <circle cx="132" cy="146" r="8" fill="#a8d4f0"/>
          <circle cx="104" cy="56" r="6" fill="#ffd36e"/>
          <path d="M108 168l4 4M58 124l-3 5M140 118l3 3" ${THIN} stroke-width="2"/>
          <path d="M70 60c6-12 14-18 22-20" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none" opacity=".8"/>
          ${peek}
        </g>
        ${chips}
      </svg>`;
  }

  // ---------- The animal ----------
  const order = PET_STAGES.map((s) => s.key);
  const at = (key) => order.indexOf(stageKey) >= order.indexOf(key);
  const baby = stageKey === "baby";
  const royal = stageKey === "royal";
  const scale = { baby: 0.74, kid: 0.84, big: 0.94 }[stageKey] || 1;
  const G = { u, body: `url(#body-${u})`, belly: `url(#belly-${u})`, mid: sp.c[1], dark: sp.c[2] };
  const feet = sp.feet || G.body;

  const headRx = baby ? 46 : 43, headRy = baby ? 42 : 39;

  const eyeRing = (x) => sp.eyeRings
    ? `<circle cx="${x}" cy="80" r="17" fill="#fff6e6" stroke="${OUT}" stroke-width="2.4"/>` : "";
  const eye = (x) => mood === "sleepy"
    ? `<path d="M${x - 9} 82c5 6 13 6 18 0" ${THIN}/>`
    : `<ellipse cx="${x}" cy="80" rx="8" ry="10" fill="${OUT}"/>
       <circle cx="${x + 2.5}" cy="75.5" r="3.6" fill="#fff"/><circle cx="${x - 2.5}" cy="85" r="1.6" fill="#fff"/>`;
  const defaultMouth = {
    happy: `<path d="M91 111c5 6 13 6 18 0" ${THIN}/><path d="M104 112.5l2 4 2-4.6" fill="#fff" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round"/>`,
    hungry: `<path d="M90 109c4 12 16 12 20 0z" fill="#7a2b22" ${THIN}/><path d="M95 116c3-3 7-3 10 0-3 3-7 3-10 0z" fill="#ff8f9c"/>
             <path d="M111 113c2 4 2 7 0 9-2-2-2-5 0-9z" fill="#a8d4f0" stroke="${OUT}" stroke-width="1.4"/>`,
    sleepy: `<ellipse cx="100" cy="112" rx="3.5" ry="3" fill="${OUT}"/>`,
  };
  const mouth = sp.mouth?.[mood] ?? defaultMouth[mood];
  const zzz = mood === "sleepy"
    ? `<g class="pet-zzz" fill="${OUT}" font-weight="700"><text x="146" y="50" font-size="20">z</text><text x="160" y="34" font-size="15">z</text><text x="171" y="22" font-size="11">z</text></g>`
    : "";

  const cape = royal
    ? `<path d="M60 112c-24 26-36 56-30 76h140c6-20-6-50-30-76z" fill="#b8322a" ${INK}/>
       <path d="M56 130c-10 18-14 36-12 54M144 130c10 18 14 36 12 54" stroke="#8e2219" stroke-width="3" fill="none" stroke-linecap="round"/>
       <path d="M30 188h140" stroke="#fffaf0" stroke-width="6" stroke-linecap="round"/>`
    : "";

  const bellyLines = sp.bellyLine
    ? `<path d="M78 142c14 6 30 6 44 0M75 154c16 6 34 6 50 0M79 166c14 5 28 5 42 0" stroke="${sp.bellyLine}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
    : "";

  const book = at("big")
    ? `<g class="pet-book">
         <path d="M66 140c12-6 24-6 34 2 10-8 22-8 34-2v30c-12-6-24-6-34 2-10-8-22-8-34-2z" fill="#c2462e" ${INK}/>
         <path d="M70 142c10-4 20-4 30 3v26c-10-7-20-7-30-3zM130 142c-10-4-20-4-30 3v26c10-7 20-7 30-3z" fill="#fffaf0" stroke="${OUT}" stroke-width="2"/>
         <path d="M76 151c7-2 13-1 19 2M76 158c7-2 13-1 19 2M105 153c6-3 12-4 19-2M105 160c6-3 12-4 19-2" stroke="#c9b8a4" stroke-width="2" stroke-linecap="round"/>
         <path d="M118 140v12l3-3 3 3v-13" fill="#ffd36e" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round"/>
       </g>
       <ellipse cx="66" cy="156" rx="9" ry="7" fill="${G.body}" ${INK}/><ellipse cx="134" cy="156" rx="9" ry="7" fill="${G.body}" ${INK}/>`
    : sp.front ? "" // the owl's wings are its arms
    : `<ellipse cx="62" cy="140" rx="8" ry="11" transform="rotate(25 62 140)" fill="${G.body}" ${INK}/>
       <ellipse cx="138" cy="140" rx="8" ry="11" transform="rotate(-25 138 140)" fill="${G.body}" ${INK}/>`;

  const scarf = at("wise") && !royal
    ? `<path d="M64 116c22 12 50 12 72 0l2 12c-24 13-52 13-76 0z" fill="#5b8fd6" ${INK}/>
       <path d="M80 124l-1 9M96 126v10M112 125l1 9" stroke="#cfe0f7" stroke-width="3" stroke-linecap="round"/>
       <path d="M118 126l8 26 12-5-8-24z" fill="#5b8fd6" ${INK}/>`
    : "";
  const ermine = royal
    ? `<path d="M62 116c24 14 52 14 76 0l3 12c-26 15-56 15-82 0z" fill="#fffaf0" ${INK}/>
       <path d="M78 125v4M92 128v4M106 128v4M120 125v4" stroke="${OUT}" stroke-width="2.6" stroke-linecap="round"/>`
    : "";

  const glasses = at("wise")
    ? `<g stroke="#b07b1e" stroke-width="3" fill="rgba(255,255,255,.22)">
         <circle cx="82" cy="80" r="14"/><circle cx="118" cy="80" r="14"/></g>
       <path d="M96 79c2-2 6-2 8 0" stroke="#b07b1e" stroke-width="3" fill="none"/>`
    : "";
  const gold = `url(#gold-${u})`;
  const crown = royal
    ? `<path d="M72 50l4-30 13 14 11-20 11 20 13-14 4 30c-18 5-38 5-56 0z" fill="${gold}" ${INK}/>
       <circle cx="100" cy="36" r="4.5" fill="#c2462e" stroke="${OUT}" stroke-width="1.6"/>
       <circle cx="83" cy="42" r="3" fill="#5b8fd6"/><circle cx="117" cy="42" r="3" fill="#5b8fd6"/>
       <circle cx="76" cy="20" r="3.5" fill="${gold}" ${INK} stroke-width="2"/><circle cx="100" cy="14" r="3.5" fill="${gold}" ${INK} stroke-width="2"/><circle cx="124" cy="20" r="3.5" fill="${gold}" ${INK} stroke-width="2"/>`
    : "";
  const sparkle = (x, y, s) => `<path class="pet-sparkle" d="M${x} ${y - s}c1 ${s * 0.7} ${s * 0.3} ${s} ${s} ${s}-${s * 0.7} 1-${s} ${s * 0.3}-${s} ${s}c-1-${s * 0.7}-${s * 0.3}-${s}-${s}-${s} ${s * 0.7}-1 ${s}-${s * 0.3} ${s}-${s}z" fill="#ffd36e" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round"/>`;
  const sparkles = royal ? sparkle(30, 40, 9) + sparkle(176, 92, 7) + sparkle(22, 150, 6) : "";
  const cheeks = sp.cheeks || "#ff9eb0";

  return `
    <svg class="pet-svg" viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <radialGradient id="body-${u}" cx="40%" cy="30%" r="80%">
          <stop offset="0" stop-color="${sp.c[0]}"/><stop offset=".55" stop-color="${sp.c[1]}"/><stop offset="1" stop-color="${sp.c[2]}"/>
        </radialGradient>
        <radialGradient id="belly-${u}" cx="45%" cy="35%" r="75%">
          <stop offset="0" stop-color="${sp.belly[0]}"/><stop offset="1" stop-color="${sp.belly[1]}"/>
        </radialGradient>
        <linearGradient id="horn-${u}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff0b8"/><stop offset="1" stop-color="#f0a83a"/>
        </linearGradient>
        <linearGradient id="accent2-${u}" x1="1" y1="1" x2="0" y2="0">
          <stop offset="0" stop-color="#4fa892"/><stop offset="1" stop-color="#a6e3cf"/>
        </linearGradient>
        <linearGradient id="gold-${u}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#ffd36e"/><stop offset="1" stop-color="#d9962a"/>
        </linearGradient>
      </defs>
      ${shadow(50 * scale)}
      ${sparkles}
      <g transform="translate(100 190) scale(${scale}) translate(-100 -190)">
        <g class="pet-body">
          ${cape}${sp.back(at, G)}
          <ellipse cx="100" cy="144" rx="48" ry="44" fill="${G.body}" ${INK}/>
          ${sp.bodyMarks ? sp.bodyMarks(at, G) : ""}
          <ellipse cx="100" cy="152" rx="29" ry="29" fill="${G.belly}" ${INK}/>
          ${bellyLines}
          ${sp.bellyMarks ? sp.bellyMarks(at, G) : ""}
          ${sp.front ? sp.front(at, G) : ""}
          <ellipse cx="78" cy="184" rx="16" ry="8.5" fill="${feet}" ${INK}/>
          <ellipse cx="122" cy="184" rx="16" ry="8.5" fill="${feet}" ${INK}/>
          <path d="M68 186v-4M76 187v-4M84 186v-4M116 186v-4M124 187v-4M132 186v-4" stroke="#fffaf0" stroke-width="2.4" stroke-linecap="round"/>
          ${scarf}${ermine}${sp.ears(at, G, mood)}
          <ellipse cx="100" cy="86" rx="${headRx}" ry="${headRy}" fill="${G.body}" ${INK}/>
          ${sp.headTop(at, royal, G)}
          ${eyeRing(82)}${eyeRing(118)}
          ${sp.face(mood)}
          <ellipse cx="68" cy="98" rx="8" ry="5" fill="${cheeks}" opacity=".75"/><ellipse cx="132" cy="98" rx="8" ry="5" fill="${cheeks}" opacity=".75"/>
          <path d="M72 64c6-8 14-12 22-13" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".55"/>
          ${eye(82)}${eye(118)}${glasses}${mouth}${crown}${book}
        </g>
      </g>
      ${zzz}
    </svg>`;
}

// ======================================================================
// Choosing a pet
// ======================================================================
let choosing = false;

function renderPicker() {
  const current = chosenSpecies();
  const list = $("pet-picker-list");
  list.replaceChildren(...SPECIES_ORDER.map((key) => {
    const sp = SPECIES[key];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `pet-choice${key === current ? " current" : ""}`;
    btn.setAttribute("aria-pressed", String(key === current));
    const art = document.createElement("span");
    art.className = "pet-choice-art";
    art.innerHTML = petSVG("baby", "happy", key); // fixed drawing
    btn.append(art, textEl("span", "pet-choice-name", sp.label), textEl("span", "pet-choice-blurb", sp.blurb));
    btn.addEventListener("click", () => choosePet(key));
    return btn;
  }));
  const first = !current;
  $("pet-picker-title").textContent = first ? "Choose your reading pet!" : "Change your pet";
  $("pet-picker-note").textContent = first
    ? "Pick one to hatch from your egg. You can change it later."
    : "Your treats and growth stay the same. Only the animal changes.";
  $("pet-picker-cancel").hidden = first;
}

function choosePet(key) {
  const first = !chosenSpecies();
  savePetData({ species: key });
  choosing = false;
  renderPet();
  showToast(first ? `You chose a ${SPECIES[key].word}! Read to help it grow.` : `${petName()} is now a ${SPECIES[key].word}!`);
  $("pet-change").focus();
}

function openPicker() {
  choosing = true;
  renderPet();
  $("pet-picker-list").querySelector(".current, .pet-choice")?.focus();
}

function closePicker() {
  choosing = false;
  renderPet();
  $("pet-change").focus();
}

// ======================================================================
// Pet panel on the Reading timer page
// ======================================================================
function renderPet() {
  const panel = $("pet-panel");
  if (!panel) return;

  // Nobody has chosen a pet yet (or they asked to change): show the chooser instead
  const showPicker = choosing || !chosenSpecies();
  panel.classList.toggle("choosing", showPicker);
  $("pet-picker").hidden = !showPicker;
  if (showPicker) renderPicker();

  const treats = treatsFor(totalReadSeconds());
  const stage = stageFor(treats);
  const mood = petMood();
  const name = petName();
  const sp = SPECIES[petSpecies()];

  $("pet-art").className = `pet-art mood-${mood} stage-${stage.key}`;
  $("pet-art").innerHTML = petSVG(stage.key, mood); // fixed drawing; the name is never put in here
  $("pet-name").textContent = name;
  $("pet-stage").textContent = stage.name;
  $("pet-mood").textContent = moodText(stage, mood, name);
  $("pet-treats").textContent = `🍪 ${treats} treat${treats === 1 ? "" : "s"}`;

  const bar = $("pet-progress");
  if (stage.next) {
    const done = (treats - stage.at) / (stage.next.at - stage.at);
    bar.style.setProperty("--done", Math.min(1, done));
    const what = stage.key === "egg" || stage.key === "cracked" ? "hatch" : `become a ${stage.next.name.toLowerCase()}`;
    $("pet-next").textContent = stage.next.key === "cracked"
      ? `${stage.next.at - treats} more minutes of reading until your egg wobbles`
      : `${stage.next.at - treats} more minutes of reading to ${what}`;
  } else {
    bar.style.setProperty("--done", 1);
    $("pet-next").textContent = `Fully grown! Keep reading to keep your ${sp.word} happy.`;
  }
}

function renamePet() {
  const name = prompt("What's your pet's name?", petName());
  if (name === null) return;
  const clean = name.trim().slice(0, 16);
  if (!clean) return;
  setPetName(clean);
  renderPet();
}

// ======================================================================
// Prize screen
// ======================================================================
let prizeReturnFocus = null;

// Called by reading.js right after reading time is saved.
// Returns true if it showed the prize screen (so reading.js can skip its small message).
function petReward(secondsAdded) {
  const after = totalReadSeconds();
  const before = Math.max(0, after - secondsAdded);
  const earned = treatsFor(after) - treatsFor(before);
  renderPet();
  if (earned < 1) {
    showToast("Read for at least a minute to earn a treat for your pet!");
    return true;
  }

  const name = petName();
  const oldStage = stageFor(treatsFor(before));
  const stage = stageFor(treatsFor(after));
  const grew = stage.index > oldStage.index;

  const art = $("prize-art");
  art.className = `prize-art stage-${stage.key}${grew ? " grew" : ""}`;
  art.innerHTML = petSVG(stage.key, "happy"); // fixed drawing

  $("prize-title").textContent = grew ? "Your pet grew!" : "You earned a prize!";
  $("prize-treats").textContent = `+${earned} treat${earned === 1 ? "" : "s"} for ${name} 🍪`;
  $("prize-message").textContent = grew
    ? growMessage(stage.key, SPECIES[petSpecies()])
    : ["Yum! Stories are the best snack.", "Munch munch! Thanks for reading.", `${name} did a happy dance!`, "Delicious! Read again soon."][Math.floor(Math.random() * 4)];

  // Progress bar fills from where it was to where it is now
  const bar = $("prize-progress");
  const fraction = (t, s) => (s.next ? (t - s.at) / (s.next.at - s.at) : 1);
  const startAt = grew ? 0 : fraction(treatsFor(before), stage);
  const fill = bar.firstElementChild;
  fill.style.transition = "none";
  bar.style.setProperty("--done", startAt);
  $("prize-next").textContent = stage.next
    ? `${stage.next.at - treatsFor(after)} more to the next stage: ${stage.next.name}`
    : "Fully grown!";

  const overlay = $("prize");
  prizeReturnFocus = document.activeElement;
  overlay.hidden = false;
  void fill.offsetWidth; // apply the starting width first, so the bar animates from there
  setTimeout(() => {
    fill.style.transition = "";
    bar.style.setProperty("--done", Math.min(1, fraction(treatsFor(after), stage)));
  }, 60);
  $("prize-close").focus();
  chime();
  if (grew) confetti();
  return true;
}

function closePrize() {
  $("prize").hidden = true;
  document.querySelectorAll(".confetti").forEach((c) => c.remove());
  prizeReturnFocus?.focus?.();
}

function confetti() {
  const colors = ["#c2462e", "#ffd36e", "#9ed98f", "#a8d4f0", "#ffb7c3", "#b99cf0"];
  const layer = document.createElement("div");
  layer.className = "confetti";
  layer.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 70; i++) {
    const bit = document.createElement("i");
    bit.style.left = `${Math.random() * 100}%`;
    bit.style.background = colors[i % colors.length];
    bit.style.animationDelay = `${Math.random() * 0.6}s`;
    bit.style.animationDuration = `${2.2 + Math.random() * 1.6}s`;
    bit.style.setProperty("--drift", `${(Math.random() - 0.5) * 160}px`);
    bit.style.setProperty("--spin", `${(Math.random() - 0.5) * 1440}deg`);
    layer.append(bit);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 4500);
}

// ======================================================================
// Wire up
// ======================================================================
$("pet-rename").addEventListener("click", renamePet);
$("pet-change").addEventListener("click", openPicker);
$("pet-picker-cancel").addEventListener("click", closePicker);
$("prize-close").addEventListener("click", closePrize);
$("prize").addEventListener("click", (e) => { if (e.target.id === "prize") closePrize(); });
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("prize").hidden) closePrize();
  else if (choosing && chosenSpecies()) closePicker();
});
// The pet's mood changes over time, so refresh it whenever the timer page is shown.
window.addEventListener("hashchange", () => { if (location.hash === "#timer") renderPet(); });
renderPet();
