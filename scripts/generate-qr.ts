// Génère qr/qr-print.pdf : tous les QR codes de la partie (§8), en A4 avec traits de coupe.
// Correction d'erreur H, noir sur blanc. URL : ${NEXT_PUBLIC_BASE_URL}/q/${CODE}.
//
//   NEXT_PUBLIC_BASE_URL=https://mon-domaine.fr npm run qr
import { mkdirSync, createWriteStream } from "node:fs";
import { config } from "dotenv";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { MISSIONS } from "../content/missions";
import { PHYSICAL_CLUES } from "../content/clues";
import { ZONES } from "../content/zones";

config({ path: ".env.local" });
config();

const BASE = (process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
if (!BASE) {
  console.error("NEXT_PUBLIC_BASE_URL manquant : les QR doivent pointer vers l'URL définitive du jeu.");
  process.exit(1);
}
if (/localhost|127\.0\.0\.1/.test(BASE)) console.warn(`⚠ URL de base locale (${BASE}) : à régénérer avec l'URL de prod avant impression.`);

const mm = (v: number) => (v * 72) / 25.4;
const A4 = { w: 210, h: 297 };
const CROP = 4; // longueur des traits de coupe (mm)
const CROP_GAP = 1; // écart entre le bord de la carte et le trait

const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false, info: { Title: "Les 66 Légions — QR codes" } });
mkdirSync("qr", { recursive: true });
doc.pipe(createWriteStream("qr/qr-print.pdf"));

/**
 * Dessine un QR vectoriel de `size` mm de côté. `quiet` = zone de silence (en modules) comprise dans
 * ce carré ; 0 quand la carte autour fournit déjà une marge blanche suffisante.
 */
function drawQr(code: string, x: number, y: number, size: number, quiet = 0) {
  const qr = QRCode.create(`${BASE}/q/${code}`, { errorCorrectionLevel: "H" });
  const n = qr.modules.size;
  const cell = size / (n + quiet * 2);
  doc.save().fillColor("black");
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) doc.rect(mm(x + (c + quiet) * cell), mm(y + (r + quiet) * cell), mm(cell) + 0.1, mm(cell) + 0.1);
    }
  }
  doc.fill().restore();
}

/** Traits de coupe aux 4 coins d'une carte, à l'extérieur de la carte. */
function cropMarks(x: number, y: number, w: number, h: number) {
  doc.save().lineWidth(0.3).strokeColor("black");
  const line = (x1: number, y1: number, x2: number, y2: number) => doc.moveTo(mm(x1), mm(y1)).lineTo(mm(x2), mm(y2)).stroke();
  for (const [cx, sx] of [[x, -1], [x + w, 1]] as const) {
    for (const [cy, sy] of [[y, -1], [y + h, 1]] as const) {
      line(cx + sx * CROP_GAP, cy, cx + sx * (CROP_GAP + CROP), cy);
      line(cx, cy + sy * CROP_GAP, cx, cy + sy * (CROP_GAP + CROP));
    }
  }
  doc.restore();
}

function text(s: string, x: number, y: number, w: number, size: number, opts: { bold?: boolean } = {}) {
  doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor("black").text(s, mm(x), mm(y), { width: mm(w), align: "center", lineBreak: true });
}

/** Grille de cartes w×h mm sur des pages A4, centrée, avec un espace `gap` pour les traits de coupe. */
function grid<T>(items: T[], w: number, h: number, gap: number, draw: (item: T, x: number, y: number) => void) {
  const cols = Math.max(1, Math.floor((A4.w - 10 + gap) / (w + gap)));
  const rows = Math.max(1, Math.floor((A4.h - 10 + gap) / (h + gap)));
  const ox = (A4.w - (cols * w + (cols - 1) * gap)) / 2;
  const oy = (A4.h - (rows * h + (rows - 1) * gap)) / 2;
  items.forEach((item, i) => {
    const k = i % (cols * rows);
    if (k === 0) doc.addPage();
    const x = ox + (k % cols) * (w + gap);
    const y = oy + Math.floor(k / cols) * (h + gap);
    cropMarks(x, y, w, h);
    draw(item, x, y);
  });
}

/** Formats « plein papier » (A6, A5) : on découpe la page A4 en parts égales avec des repères au bord. */
function tiled<T>(items: T[], cols: number, rows: number, draw: (item: T, x: number, y: number, w: number, h: number) => void) {
  const w = A4.w / cols;
  const h = A4.h / rows;
  items.forEach((item, i) => {
    const k = i % (cols * rows);
    if (k === 0) {
      doc.addPage();
      doc.save().lineWidth(0.3).strokeColor("black");
      for (let c = 1; c < cols; c++) {
        doc.moveTo(mm(c * w), 0).lineTo(mm(c * w), mm(CROP + 2)).stroke();
        doc.moveTo(mm(c * w), mm(A4.h - CROP - 2)).lineTo(mm(c * w), mm(A4.h)).stroke();
      }
      for (let r = 1; r < rows; r++) {
        doc.moveTo(0, mm(r * h)).lineTo(mm(CROP + 2), mm(r * h)).stroke();
        doc.moveTo(mm(A4.w - CROP - 2), mm(r * h)).lineTo(mm(A4.w), mm(r * h)).stroke();
      }
      doc.restore();
    }
    draw(item, (k % cols) * w, Math.floor(k / cols) * h, w, h);
  });
}

// --- Badges B01–B34 : 85×55 mm, QR 40 mm + code en petit ------------------------------------
const badges = Array.from({ length: 34 }, (_, i) => `B${String(i + 1).padStart(2, "0")}`);
grid(badges, 85, 55, 8, (code, x, y) => {
  drawQr(code, x + 5, y + 7.5, 40);
  text("Les 66 Légions", x + 47, y + 18, 34, 9, { bold: true });
  text(code, x + 47, y + 30, 34, 7);
});

// --- Missions (24) + Missions d'Esprits (4) : A6 (4 par page) -------------------------------
tiled(MISSIONS, 2, 2, (m, x, y, w) => {
  text(m.kind === "spirit" ? "Mission de l'au-delà" : "Mission", x, y + 12, w, 14, { bold: true });
  drawQr(m.code, x + (w - 75) / 2, y + 28, 75);
  text(m.code, x, y + 108, w, 12);
  if (!m.title.startsWith("TODO")) text(m.title, x + 8, y + 118, w - 16, 10);
});

// --- Indices physiques (6) : A5 (2 par page) ------------------------------------------------
tiled([...PHYSICAL_CLUES], 1, 2, (code, x, y, w) => {
  drawQr(code, x + (w - 100) / 2, y + 18, 100);
  text(code, x, y + 124, w, 10);
});

// --- Zones (6) : A4 --------------------------------------------------------------------------
for (const z of ZONES) {
  doc.addPage();
  text(z.name.startsWith("TODO") ? `Zone ${z.code}` : z.name, 0, 30, A4.w, 32, { bold: true });
  drawQr(`Z-${z.code}`, (A4.w - 150) / 2, 70, 150);
  text(`Z-${z.code}`, 0, 230, A4.w, 12);
}

// --- Fragments du Carnet (3) : 40×40 mm, sans texte -----------------------------------------
// Le fragment est entièrement occupé par le QR : on garde 2 modules de marge blanche à l'intérieur.
grid(["F-MENE", "F-TEKEL", "F-UPHARSIN"], 40, 40, 10, (code, x, y) => drawQr(code, x, y, 40, 2));

doc.end();
console.log(`qr/qr-print.pdf généré pour ${BASE} : ${badges.length} badges, ${MISSIONS.length} missions, ${PHYSICAL_CLUES.length} indices, ${ZONES.length} zones, 3 fragments.`);
