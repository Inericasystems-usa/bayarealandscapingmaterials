/**
 * Hand-kept rules the catalog generator (build-catalog.mjs) applies to the Flint
 * POS export: which store category each sheet category becomes, how names are
 * cleaned up, and the descriptive copy for each kind of product.
 *
 * The copy here is general, true information about a KIND of material or tool
 * (what it is, what it is usually used for). It never states a specification,
 * colour, origin, rating or stock figure the sheet does not give; product
 * specifics come only from the sheet's own name and description columns.
 */

// ── Categories ──────────────────────────────────────────────────────────
// `sheet` lists the Flint category names that land here. `group` is the parent
// in the WooCommerce hierarchy ("Bulk Materials > Bark & Mulch").

export const CATEGORIES = [
  {
    slug: "bark-mulch",
    name: "Bark & Mulch",
    group: "Bulk Materials",
    sku: "BRK",
    sheet: ["Bark Bulk"],
    keyword: "bark mulch",
    intro:
      "Bulk bark and mulch sold by the cubic yard, with half- and quarter-yard loads, for pickup at our Richmond, CA yard or delivery across the Bay Area.",
    about: [
      "Bark and mulch are spread over the soil in planting beds and around trees and shrubs. A layer of mulch helps the soil hold moisture, evens out soil temperature, keeps weeds down and gives beds a finished look.",
      "Most beds are mulched two to three inches deep. The coverage figures on each product page show how far one cubic yard goes at those depths.",
    ],
  },
  {
    slug: "decorative-rock",
    name: "Decorative Rock",
    group: "Bulk Materials",
    sku: "DRK",
    sheet: ["Decorative Rock Bulk"],
    keyword: "decorative rock",
    intro:
      "Bulk decorative rock and decomposed granite by the cubic yard, in the sizes our yard stocks, for pickup in Richmond, CA or delivery across the Bay Area.",
    about: [
      "Decorative rock is screened or crushed stone used as a ground cover in planting beds, borders, dry gardens and around succulents, and as a long-lasting alternative to bark.",
      "Size changes the look and the job: small and “minus” sizes pack down for paths, three-quarter-inch stone is a common size for beds, and larger stone suits bolder ground cover, dry creek beds and drainage areas.",
    ],
  },
  {
    slug: "premium-decorative-rock",
    name: "Premium Decorative Rock",
    group: "Stone",
    sku: "PRK",
    sheet: ["PREMIUM Decorative Rocks"],
    keyword: "decorative pebbles",
    intro:
      "Beach pebbles, cobbles and decorative pebbles sold by the pound at our Richmond, CA yard, for accent beds, planters and water features.",
    about: [
      "Smooth, rounded decorative pebbles are used where the stone is the feature: dressing the top of planters, lining dry creek beds, edging paths and finishing water features.",
      "These stones are sold by weight. Call the yard or request a quote and we will help you work out how many pounds your area needs.",
    ],
  },
  {
    slug: "construction-aggregates",
    name: "Construction Aggregates",
    group: "Bulk Materials",
    sku: "AGG",
    sheet: ["Construction Aggregate Bulk"],
    keyword: "construction aggregate",
    intro:
      "Road base, drain rock and decomposed granite by the cubic yard for bases, drainage and paths, for pickup in Richmond, CA or delivery across the Bay Area.",
    about: [
      "Construction aggregates are the working layers under and around a project: compacted base under pavers, slabs and driveways, clean drain rock for drainage, and decomposed granite for firm paths.",
    ],
  },
  {
    slug: "sand",
    name: "Sand",
    group: "Bulk Materials",
    sku: "SND",
    sheet: ["Sand Bulk"],
    keyword: "bulk sand",
    intro:
      "Bulk sand by the cubic yard for concrete, paver bedding, plaster and utility work, for pickup in Richmond, CA or delivery across the Bay Area.",
    about: [
      "Different jobs call for different sands: coarser sand for concrete and the bedding layer under pavers, finer screened sand for plaster and mortar, and utility sand for bedding and backfill around pipe and conduit.",
    ],
  },
  {
    slug: "soil",
    name: "Soil",
    group: "Bulk Materials",
    sku: "SOL",
    sheet: [],
    keyword: "topsoil",
    intro:
      "Bulk topsoil by the cubic yard for filling, levelling and new planting beds, for pickup in Richmond, CA or delivery across the Bay Area.",
    about: [
      "Topsoil is used to fill low spots, raise and level ground, build up planting beds and prepare an area for lawn or planting.",
    ],
  },
  {
    slug: "flagstone-slate",
    name: "Flagstone & Slate",
    group: "Stone",
    sku: "FLG",
    sheet: ["Flagstone/Slate"],
    keyword: "flagstone",
    intro:
      "Natural flagstone and slate sold by the pound at our Richmond, CA yard, for patios, walkways and stepping stones across the Bay Area.",
    about: [
      "Flagstone is natural stone split into flat slabs. It is laid as patios, walkways and stepping stones, either dry-set on a compacted base with sand or set in mortar on a concrete slab.",
      "Flagstone is sold by weight, and the thickness in each name is how the stone is listed in our yard. Call or request a quote and we will help you estimate the weight for your area.",
    ],
  },
  {
    slug: "boulders",
    name: "Boulders & Moss Rock",
    group: "Stone",
    sku: "BLD",
    sheet: ["Baskets / Boulders"],
    keyword: "landscape boulders",
    intro:
      "Moss rock and landscape boulders sold by the pound at our Richmond, CA yard, for accents, rock gardens and natural borders.",
    about: [
      "Landscape boulders anchor a garden: a single accent stone, a group set into a slope, a rock garden or a dry-stacked border. Boulders are sold by weight.",
    ],
  },
  {
    slug: "pavers",
    name: "Pavers",
    group: "Hardscape",
    sku: "PAV",
    sheet: ["Pavers"],
    keyword: "concrete pavers",
    intro:
      "Concrete pavers for patios, walkways and driveways, available at our Richmond, CA yard with delivery across the Bay Area.",
    about: [
      "Concrete pavers are laid over a compacted base and a sand bedding layer, with joint sand swept in to lock them together. They are used for patios, walkways, pool decks and driveways.",
      "Each listing shows the coverage per pallet, thickness and piece sizes recorded in our yard listing.",
    ],
  },
  {
    slug: "wall-blocks",
    name: "Retaining Wall Blocks",
    group: "Hardscape",
    sku: "WAL",
    sheet: ["Wall Blocks"],
    keyword: "retaining wall block",
    intro:
      "Retaining wall and garden wall blocks at our Richmond, CA yard, with delivery across the Bay Area.",
    about: [
      "Segmental wall blocks are concrete units that stack without mortar to build retaining walls, garden walls, raised beds and seat walls. Taller retaining walls may need engineering or a permit, so check your local requirements before you build.",
      "Each listing shows the block size, pieces and face feet per pallet recorded in our yard listing. Some blocks are sold by the full pallet only.",
    ],
  },
  {
    slug: "wall-caps",
    name: "Wall Caps",
    group: "Hardscape",
    sku: "CAP",
    sheet: ["Wall Caps"],
    keyword: "wall caps",
    intro: "Wall caps to finish block walls, available at our Richmond, CA yard with delivery across the Bay Area.",
    about: [
      "Wall caps are the finishing course on top of a block wall. They give the wall a clean edge and a surface to sit on, and are usually bonded down with a masonry or landscape adhesive.",
    ],
  },
  {
    slug: "concrete-block",
    name: "Concrete Block (CMU)",
    group: "Hardscape",
    sku: "CMU",
    sheet: ["CMU"],
    keyword: "concrete block",
    intro:
      "Concrete masonry units, pier blocks and stepping stones at our Richmond, CA yard, with delivery across the Bay Area.",
    about: [
      "Concrete masonry units (CMU, often called cinder blocks) are standard hollow concrete blocks for walls, planters and foundations. They are laid in mortar, and structural walls are usually reinforced and grouted.",
    ],
  },
  {
    slug: "artificial-turf",
    name: "Artificial Turf",
    group: "",
    sku: "TRF",
    sheet: ["Artificial Turf"],
    keyword: "artificial turf",
    intro:
      "Artificial turf sold by the square foot from our Richmond, CA yard, with seaming tape, adhesive and nails for the install.",
    about: [
      "Artificial turf is synthetic grass for lawns, play areas, pet runs and spaces where real grass struggles. It is laid over a compacted base, seamed with turf tape and adhesive, and fastened at the edges.",
      "Turf is cut from the roll: a cut charge applies to anything less than a full roll, and a freight charge applies to turf orders. Ask for a quote and we will include both.",
    ],
  },
  {
    slug: "bagged-products",
    name: "Bagged Products",
    group: "Supplies",
    sku: "BAG",
    sheet: ["Bagged Products"],
    keyword: "bagged concrete and polymeric sand",
    intro:
      "Bagged polymeric sand, concrete, mortar, cement and sand at our Richmond, CA yard, for pickup or delivery across the Bay Area.",
    about: [
      "Bagged products cover the jobs that need a measured amount: polymeric sand for paver joints, concrete for posts and small pours, mortar for block and stone, and cement and sand for mixing your own.",
    ],
  },
  {
    slug: "sealers",
    name: "Sealers, Binders & Stabilizers",
    group: "Supplies",
    sku: "SEA",
    sheet: ["Sealers"],
    keyword: "paver sealer",
    intro:
      "Paver and hardscape sealers, bark and pebble binders and pathway stabilizers at our Richmond, CA yard.",
    about: [
      "Sealers protect pavers, concrete and stone from stains and weathering, and enhancing sealers deepen their colour. Binders lock loose bark or pebbles in place, and stabilizers make decomposed granite paths firmer.",
      "Follow the manufacturer's label for surface preparation, coverage and drying time.",
    ],
  },
  {
    slug: "cleaners",
    name: "Hardscape Cleaners",
    group: "Supplies",
    sku: "CLN",
    sheet: ["Cleaners"],
    keyword: "paver cleaner",
    intro: "Paver and hardscape cleaners, efflorescence removers and sealer strippers at our Richmond, CA yard.",
    about: [
      "Hardscape cleaners prepare pavers, concrete and stone before sealing and keep them looking clean between sealings. Follow the manufacturer's label for dilution, dwell time and rinsing.",
    ],
  },
  {
    slug: "adhesives",
    name: "Adhesives",
    group: "Supplies",
    sku: "ADH",
    sheet: ["Adhesive"],
    keyword: "landscape adhesive",
    intro: "Landscape, masonry and turf adhesives in caulk-gun tubes at our Richmond, CA yard.",
    about: [
      "Tube adhesives bond wall caps, block and stone, and seam artificial turf. They are applied with a caulk gun, which the yard also stocks. Follow the label for cure time and temperature limits.",
    ],
  },
  {
    slug: "landscape-fabric",
    name: "Landscape Fabric",
    group: "Supplies",
    sku: "FAB",
    sheet: ["Landscape Fabric/Rolls"],
    keyword: "landscape fabric",
    intro: "Landscape fabric and weed barrier rolls at our Richmond, CA yard, for use under rock, gravel and mulch.",
    about: [
      "Landscape fabric is a permeable sheet laid under rock, gravel or mulch. It separates the cover from the soil underneath and reduces weeds while letting water through. Pin it down with landscape staples, which the yard also stocks.",
    ],
  },
  {
    slug: "tools-accessories",
    name: "Tools & Accessories",
    group: "Supplies",
    sku: "TLS",
    sheet: ["Tools/Accessories"],
    keyword: "landscaping tools",
    intro:
      "Landscaping and masonry tools, turf install supplies, edging, gloves and accessories at our Richmond, CA yard.",
    about: [
      "Hand tools and job-site accessories to go with the materials: trowels, tampers, shovels and rakes, turf tape and nails, bender board edging and stakes, caulk guns, gloves and more.",
    ],
  },
  {
    slug: "services",
    name: "Delivery & Disposal",
    group: "",
    sku: "SVC",
    sheet: [],
    keyword: "delivery and disposal",
    intro: "Flatbed and forklift delivery, and disposal of mixed concrete, asphalt and dirt, from our Richmond, CA yard.",
    about: [
      "Alongside materials, the yard offers flatbed delivery with forklift unloading and accepts mixed concrete, asphalt and dirt for disposal, charged by the ton.",
    ],
  },
];

/** Category for a sheet row whose category is blank, decided by name. */
export function categoryForBlank(name) {
  if (/disposal/i.test(name) || /delivery/i.test(name)) return "services";
  if (/topsoil|soil/i.test(name)) return "soil";
  if (/river wash/i.test(name)) return "decorative-rock";
  return null;
}

// ── Names ──────────────────────────────────────────────────────────────
// Exact display names for sheet names the automatic clean-up cannot read well
// (abbreviations, all-caps codes, words from the description that a buyer
// needs). Keyed by the sheet name, whitespace-collapsed.

export const NAME_OVERRIDES = {
  "10 OZ #101 STANDARD GUN": "10 oz #101 Standard Caulk Gun",
  "28 OZ #105 STANDARD GUN": "28 oz #105 Standard Caulk Gun",
  "28 OZ #255 PREMIUM GUN": "28 oz #255 Premium Caulk Gun",
  "10 OZ TUBES VOC ADHESIVE": "10 oz Tube VOC Adhesive",
  "28 OZ TUBES RAPID SET ADHESIVE": "28 oz Tube Rapid Set Adhesive",
  "28 OZ TUBES SEAMS RIGHT TURF ADHESIVE": "28 oz Tube Seams Right Turf Adhesive",
  "28 OZ TUBES VOC ADHESIVE": "28 oz Tube VOC Adhesive",
  "9.5 OZ TUBES VERTICAL INSTANT LOCK ADHESIVE": "9.5 oz Tube Vertical Instant Lock Adhesive",
  "50# BAG BEIGE PAVERMATE Z3 49/PLT": "PaverMate Z3 Polymeric Sand, Beige, 50 lb Bag",
  "50# BAG BLACK PAVERMATE Z3 49/PLT": "PaverMate Z3 Polymeric Sand, Black, 50 lb Bag",
  "50# BAG GREY PAVERMATE Z3 49/PLT": "PaverMate Z3 Polymeric Sand, Grey, 50 lb Bag",
  "50# BAG GRANTE X-TREME PAVERMATE 49/PLT": "PaverMate X-Treme Polymeric Sand, Granite, 50 lb Bag",
  "50# BAG TAN X-TREME PAVERMATE 49/PLT": "PaverMate X-Treme Polymeric Sand, Tan, 50 lb Bag",
  "Sacked 30MESH Sand": "Sacked 30 Mesh Sand, 50 lb",
  "Sacked Concrete 80lbs": "Sakrete High Strength Concrete Mix, 80 lb",
  "Sacked Mortar Mix 60lbs": "Sakrete Type S Mortar Mix, 60 lb",
  "Sacked Portland Cement 94Lb": "Portland Cement, 94 lb",
  "1 GAL DW DUAL WASH": "DW Dual Wash, 1 Gallon",
  "5 GALLON DW DUAL WASH": "DW Dual Wash, 5 Gallon",
  "1 GAL EF EFFLORESCENCE": "EF Efflorescence Cleaner, 1 Gallon",
  "5 GALLON EF EFFLORESCENCE": "EF Efflorescence Cleaner, 5 Gallon",
  "1 GAL M3C MOLD, MOSS, MILDEW CLNR": "M3C Mold, Moss & Mildew Cleaner, 1 Gallon",
  "1 GAL SS SEALER STRIPPER": "SS Sealer Stripper, 1 Gallon",
  "1 GAL DG DUAL GUARD SPECIALTY SEAL": "DG Dual Guard Specialty Seal, 1 Gallon",
  "5 GALLON DG DUAL GUARD SPECIALTY SEAL": "DG Dual Guard Specialty Seal, 5 Gallon",
  "1 GAL HG XTREME PAVER SEAL": "HG Xtreme Paver Seal, 1 Gallon",
  "5 GALLON HG XTREME PAVER SEAL": "HG Xtreme Paver Seal, 5 Gallon",
  "1 GAL LG XTREME PAVER SEAL": "LG Xtreme Paver Seal, 1 Gallon",
  "5 GALLON LG XTREME PAVER SEAL": "LG Xtreme Paver Seal, 5 Gallon",
  "1 GAL PS XTREME PAVER SEAL": "PS Xtreme Paver Seal, 1 Gallon",
  "5 GALLON PS XTREME PAVER SEAL": "PS Xtreme Paver Seal, 5 Gallon",
  "3OZ GROUND CONTROL 4' X 100'": "Ground Control 3 oz Weed Fabric, 4' x 100'",
  "3OZ GROUND CONTROL 6' X 100'": "Ground Control 3 oz Weed Fabric, 6' x 100'",
  "4 OZ PRO PLUS 4 X 100": "Pro Plus 4 oz Landscape Fabric, 4 x 100",
  "4OZ PRO PLUS 6 X 100": "Pro Plus 4 oz Landscape Fabric, 6 x 100",
  "PROFESSIONAL 4' X 100'": "Professional Landscape Fabric, 4' x 100'",
  "PROFESSIONAL 4X300": "Professional Landscape Fabric, 4 x 300",
  "PROFESSIONAL 6 X 100": "Professional Landscape Fabric, 6 x 100",
  "PROFESSIONAL 6 X 300": "Professional Landscape Fabric, 6 x 300",
  "SB2 4 X 100": "SB2 Spunbond II Commercial Fabric, 4 x 100",
  "SB2 4 X 300": "SB2 Spunbond II Commercial Fabric, 4 x 300",
  "SB2 6 X 100": "SB2 Spunbond II Commercial Fabric, 6 x 100",
  "SB2 6 X 300": "SB2 Spunbond II Commercial Fabric, 6 x 300",
  '12" X 100\' SEAMS RIGHT TURF TAPE': "Seams Right Turf Seam Tape, 12\" x 100'",
  '12" x 50\' SEAMS RIGHT TURF TAPE': "Seams Right Turf Seam Tape, 12\" x 50'",
  '6" X 100\' SEAMS RIGHT TURF TAPE': "Seams Right Turf Seam Tape, 6\" x 100'",
  '1/2 " X-TREME SLIT FOAM ROLLER BLACK': '1/2" X-Treme Slit Foam Roller, Black',
  '13/16 " SLIT FOAM ROLLER YELLOW': '13/16" Slit Foam Roller, Yellow',
  "1 GALLON POLY SPRAYER": "1 Gallon Poly Sprayer",
  "1 x 4 BLACK BENDER BOARD": "Black Bender Board, 1 x 4",
  "1 x 4 BROWN BENDER BOARD": "Brown Bender Board, 1 x 4",
  "1 x 6 BROWN BENDER BOARD": "Brown Bender Board, 1 x 6",
  '20 CT 6" STAPLES': '6" Landscape Staples (U-Pins), 20 Count',
  '50 CT 6" STAPLES': '6" Landscape Staples (U-Pins), 50 Count',
  '40D 50# BOX 5" SMOOTH NAILS': '40D 5" Smooth Turf Nails, 50 lb Box',
  '60D 50# BOX 6" SPIRAL GALVANIZED NAILS': '60D 6" Spiral Galvanized Turf Nails, 50 lb Box',
  "Large Nitrile Coated Work Gloves 0.99/pair": "Large Nitrile Coated Work Gloves",
  "RO 47 in. Wood Handle Carbon Steel Digging Shovel": "Round-Point 47 in. Wood Handle Carbon Steel Digging Shovel",
  "SQ 47 in. Wood Handle Carbon Steel Transfer Shovel": "Square-Point 47 in. Wood Handle Carbon Steel Transfer Shovel",
  "STANLEY 25 ft. x 1 in. Tape Measure": "Stanley 25 ft. x 1 in. Tape Measure",
  "Cleanup Bags 42 Gal. - WILDCAT": "Wildcat 42 Gal. Cleanup Bags",
  "Concrete / Asphalt / Dirt (MIXED) Disposal Per Ton": "Mixed Concrete, Asphalt & Dirt Disposal (Per Ton)",
  "Flatbed/Forklift Delivery": "Flatbed & Forklift Delivery",
  "MOSS ROCK (Round)": "Moss Rock (Round)",
  "CMU STD 8\" x 8\" x 16 Precision 110": 'CMU Standard 8" x 8" x 16" Precision 110',
  "CMU STD GREY 6x8x16": "CMU Standard Grey 6x8x16",
  "CMU STD GREY 8x8x16": "CMU Standard Grey 8x8x16",
  'Pier Blocks w/ wood cap 8.75"x10.75"x10.75"': 'Pier Block with Wood Cap, 8.75" x 10.75" x 10.75"',
  "Compac III Tripane - Tan": "Compac III Triplane - Tan",
  "Lagacy Stone Triplane - Buff": "Legacy Stone Triplane - Buff",
  "HARINGTON 3 PC FSW - Sierra": "Harington 3 PC FSW - Sierra",
  "HARINGTON 3 PC FSW - Truckee": "Harington 3 PC FSW - Truckee",
  "HARINGTON 3 PC RTW - Sierra": "Harington 3 PC RTW - Sierra",
  "HARINGTON 3 PC RTW - Truckee": "Harington 3 PC RTW - Truckee",
  '4" Rec cap #831 - Grey': '4" Rec Cap #831 - Grey',
  "Black Slate Flagstone2\"": 'Black Slate Flagstone 2"',
  "Decomposed Granite (Gold Fines)": "Decomposed Granite (Gold Fines)",
  "Nolyio 1.5\"": 'Nolyio (Noyo) 1.5"',
  'Nolyio 2" x 4"': 'Nolyio (Noyo) 2" x 4"',
  'Nolyio 4" x 8"': 'Nolyio (Noyo) 4" x 8"',
};

/**
 * Automatic clean-up for names without an override: collapse spaces, and turn
 * all-caps words into title case unless they are a known code or acronym.
 */
const KEEP_UPPER = new Set([
  "CMU", "VOC", "DG", "HG", "LG", "PS", "SS", "DW", "EF", "M3C", "SB2", "FSW", "RTW", "PC",
  "G3", "SRS", "JSS", "PG&E", "II", "III", "XL", "Z3", "X-TREME",
]);

export function cleanName(raw) {
  const name = raw.replace(/\s+/g, " ").trim();
  if (NAME_OVERRIDES[name]) return NAME_OVERRIDES[name];
  return name
    .split(" ")
    .map((word) => {
      const letters = word.replace(/[^A-Za-z]/g, "");
      if (letters.length < 2 || letters !== letters.toUpperCase()) return word;
      if (KEEP_UPPER.has(word.replace(/[(),]/g, ""))) return word;
      return word.toLowerCase().replace(/(^|[\s(\-/])([a-z])/g, (_m, p, c) => p + c.toUpperCase());
    })
    .join(" ");
}

// ── Sheet descriptions ──────────────────────────────────────────────────
// The Description column is mostly a short label. It is shown as the listing
// note only when it adds something the name does not say, after fixing typos.
// Text with a dollar figure is replaced: the site does not publish prices.

const NOTE_FIXES = [
  [/Adhessive/g, "Adhesive"],
  [/Palles\b/g, "Pallet"],
  [/Strengh\b/g, "Strength"],
  [/\bCon Mix\b/g, "Concrete Mix"],
  [/\bPGE\b/g, "PG&E"],
  [/\s+,/g, ","],
  [/\s{2,}/g, " "],
];

export const NOTE_OVERRIDES = {
  "$25 Cut charge, $99 Freight charge on all orders":
    "A cut charge applies to anything less than a full roll, and a freight charge applies to every turf order.",
  "Cut is charged for anything , less than a full roll":
    "Charged when turf is cut to anything less than a full roll.",
  "Dump Materials/Ton": "Dump materials, charged per ton.",
};

export function cleanNote(raw) {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (NOTE_OVERRIDES[text] !== undefined) return NOTE_OVERRIDES[text];
  // Supplier codes ("SU BLK SLATE 2\"") say nothing a buyer can use.
  if (/^SU\s/.test(text)) return "";
  if (/\$\s?\d/.test(text)) return "";
  // A per-unit price typed into a description ("0.99/pair") is dropped.
  let out = text.replace(/\s*\d+\.\d{2}\s*\/\s*(pair|ea|each|pc|piece|bag|lb)\b/gi, "");
  for (const [re, to] of NOTE_FIXES) out = out.replace(re, to);
  return out.trim();
}

const NOTE_STOPWORDS = new Set([
  "the", "and", "with", "for", "aka", "accessories", "tube", "tubes", "each", "bag", "bags",
  "bottle", "bucket", "gal", "gallon", "roll", "size", "color", "colour",
]);

function tokens(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9/."'&-]+/g, " ")
    .split(" ")
    .map((t) => t.replace(/^[."'-]+|[."'-]+$/g, ""))
    .filter(Boolean);
}

/** True when the note says something the product name does not. */
export function noteAddsInfo(note, name) {
  if (!note) return false;
  const have = new Set(tokens(name));
  return tokens(note).some((t) => !have.has(t) && !NOTE_STOPWORDS.has(t) && (t.length >= 3 || /\d/.test(t)));
}

// ── Prices ──────────────────────────────────────────────────────────────
// Obvious keying errors in the sheet, corrected here and reported to the owner.
// Keyed by sheet name, then unit label.

export const PRICE_FIXES = {
  // Every other Salt & Pepper size sells a quarter yard at 35.75; 357.75 is a
  // slipped decimal point.
  'Salt & Pepper 1/2"': { "Quarter Cubic Yard": { from: 357.75, to: 35.75 } },
};

// ── Copy by kind of product ─────────────────────────────────────────────
// First match wins. `what` completes "<name> is ...". `about` paragraphs and
// `uses` are general facts about this kind of product. `keyword` is the plain
// search phrase a buyer would use.

const SIZE = /(\d+(?:\.\d+)?|\d+\/\d+)"\s*(minus)?/i;

function sizeNote(name) {
  if (/minus|fines/i.test(name)) {
    return "“Minus” means the stone is screened to that size and smaller with the fines left in, so it packs down into a firm surface.";
  }
  const m = name.match(SIZE);
  if (!m) return "";
  const v = m[1].includes("/") ? m[1].split("/").reduce((a, b) => Number(a) / Number(b)) : Number(m[1]);
  if (v <= 0.375) return "Small stone like this has a fine texture that suits paths, play-free borders and the gaps between stepping stones.";
  if (v <= 0.75) return "Stone in the half- to three-quarter-inch range is a common choice for planting beds, borders and side yards.";
  return "Larger stone gives a bolder ground cover and suits dry creek beds, drainage swales and wide open beds.";
}

export const KINDS = [
  // Bark & mulch
  {
    test: /playground/i,
    keyword: "playground bark",
    what: "a cedar playground bark",
    about: [
      "Playground bark is a coarse wood-chip material spread as a loose-fill cover under and around play areas, and on garden paths and planting beds.",
      "If your play area has to meet a particular surfacing standard, call the yard before you order and we will tell you what we know about this material.",
    ],
    uses: ["Loose-fill cover under play areas", "Garden paths", "Planting beds"],
  },
  {
    test: /gorilla hair|shredded redwood/i,
    keyword: "gorilla hair mulch",
    what: "a shredded redwood bark mulch, often called gorilla hair",
    about: [
      "Shredded redwood, often called gorilla hair, is a fibrous bark mulch. Its long strands knit together as it settles, which helps it stay put on slopes and in windy spots.",
    ],
    uses: ["Slopes and banks", "Planting beds", "Around trees and shrubs"],
  },
  {
    test: /fir bark/i,
    keyword: "fir bark mulch",
    what: "a fir bark mulch",
    about: [
      "Fir bark is a bark mulch made from fir trees. Spread over planting beds, it helps the soil hold moisture, keeps weeds down and gives beds a natural, finished look.",
    ],
    uses: ["Planting beds", "Around trees and shrubs", "Borders and foundation beds"],
  },
  {
    test: /chips|nuggets/i,
    keyword: "bark nuggets",
    what: "a bark chip and nugget mulch",
    about: [
      "Bark chips and nuggets are larger pieces of bark spread as a decorative mulch. The chunkier pieces are slower to blow or wash away than fine mulch.",
    ],
    uses: ["Planting beds", "Around trees and shrubs", "Decorative ground cover"],
  },
  {
    category: "bark-mulch",
    keyword: "bark mulch",
    what: "a bark mulch",
    about: [
      "Spread over planting beds, bark mulch helps the soil hold moisture, keeps weeds down and gives beds a clean, finished look.",
    ],
    uses: ["Planting beds", "Around trees and shrubs", "Borders and foundation beds"],
  },
  // Decorative rock & aggregates
  {
    test: /decomposed granite/i,
    keyword: "decomposed granite",
    what: "a decomposed granite (DG)",
    about: [
      "Decomposed granite (DG) is granite that has weathered into small particles and fines. Spread and compacted, it forms a firm, natural-looking surface for paths, patios and the spaces between stepping stones; mixing in a pathway stabilizer gives a harder-wearing finish.",
    ],
    uses: ["Garden paths and walkways", "Patios and seating areas", "Between stepping stones and pavers"],
    size: true,
  },
  {
    test: /lava/i,
    keyword: "lava rock",
    what: "a lava rock",
    about: [
      "Lava rock is a lightweight, porous volcanic rock used as a decorative ground cover. Being light, it is easy to move and spread.",
    ],
    uses: ["Planting beds and borders", "Dry and succulent gardens", "Around fire features and planters"],
    size: true,
  },
  {
    test: /slate chip/i,
    keyword: "slate chips",
    what: "a slate chip ground cover",
    about: ["Slate chips are flat, angular pieces of slate used as a decorative ground cover and on paths."],
    uses: ["Planting beds", "Paths", "Dry gardens"],
  },
  {
    test: /river wash/i,
    keyword: "river rock",
    what: "a river wash rock",
    about: ["River wash is rounded, water-worn rock used for decorative ground cover, dry creek beds and drainage areas."],
    uses: ["Dry creek beds", "Drainage areas", "Decorative ground cover"],
  },
  {
    category: "decorative-rock",
    keyword: "decorative rock",
    what: "a decorative rock",
    about: [
      "Decorative rock is a long-lasting ground cover for planting beds, borders and dry gardens. It does not break down or blow away like bark.",
    ],
    uses: ["Planting beds and borders", "Dry and succulent gardens", "Side yards and parkways"],
    size: true,
  },
  {
    test: /drain rock/i,
    keyword: "drain rock",
    what: "a drain rock",
    about: [
      "Drain rock is clean crushed stone with the fines screened out, so water passes through it freely. It is the usual fill for French drains, the backfill behind retaining walls and the bed around perforated pipe.",
    ],
    uses: ["French drains", "Backfill behind retaining walls", "Around perforated drain pipe", "Drainage layers under planters"],
  },
  {
    test: /road base|base rock/i,
    keyword: "class 2 road base",
    what: "a Class II aggregate base (road base)",
    about: [
      "Class II aggregate base, usually called road base, is a crushed rock blend with fines that compacts into a firm, stable layer. It is the standard base under pavers, driveways, walkways and concrete slabs.",
    ],
    uses: ["Base under pavers and flagstone", "Driveways and parking pads", "Base under concrete slabs", "Walkways"],
  },
  // Sand & soil
  {
    test: /plaster sand/i,
    keyword: "plaster sand",
    what: "a plaster sand",
    about: ["Plaster sand is a fine, screened sand used in plaster, stucco and mortar mixes, and for jobs that call for a finer sand."],
    uses: ["Plaster and stucco mixes", "Mortar mixes", "Jobs that need a fine sand"],
  },
  {
    test: /utility sand/i,
    keyword: "utility sand",
    what: "a utility sand",
    about: [
      "Utility sand is used for bedding and backfill around underground pipe and conduit. Check your utility's or engineer's specification before you order.",
    ],
    uses: ["Trench bedding for pipe and conduit", "Utility backfill"],
  },
  {
    test: /paver sand|concrete sand/i,
    keyword: "paver sand",
    what: "a concrete and paver sand",
    about: ["Concrete sand is a coarse sand used in concrete mixes and as the bedding layer under pavers and flagstone."],
    uses: ["Bedding layer under pavers", "Concrete mixes", "Setting flagstone"],
  },
  {
    test: /topsoil/i,
    keyword: "topsoil",
    what: "a topsoil",
    about: ["Topsoil is used to fill low spots, raise and level ground, build up planting beds and prepare an area for lawn or planting."],
    uses: ["Filling and levelling", "New planting beds", "Preparing for lawn or sod"],
  },
  // Premium rock, flagstone, boulders
  {
    test: /mexican beach pebble/i,
    keyword: "mexican beach pebbles",
    what: "a Mexican beach pebble",
    about: [
      "Mexican beach pebbles are smooth, rounded, water-worn stones. They are used where the stone is the feature: topping planters, lining dry creek beds, edging paths and finishing water features.",
    ],
    uses: ["Planter top dressing", "Dry creek beds", "Water features", "Accent beds and borders"],
  },
  {
    test: /cobble/i,
    keyword: "decorative cobbles",
    what: "a decorative cobble stone",
    about: ["Cobbles are larger rounded stones used for accent beds, dry creek beds and edging."],
    uses: ["Dry creek beds", "Accent beds", "Edging"],
  },
  {
    category: "premium-decorative-rock",
    keyword: "decorative pebbles",
    what: "a decorative pebble",
    about: ["Decorative pebbles are used for accent beds, planter top dressing, paths and water features."],
    uses: ["Accent beds", "Planter top dressing", "Water features"],
  },
  {
    test: /slate/i,
    category: "flagstone-slate",
    keyword: "slate flagstone",
    what: "a slate flagstone",
    about: ["Slate is a fine-grained stone that splits into flat pieces, which makes it well suited to patios, walkways and stepping stones."],
    uses: ["Patios", "Walkways", "Stepping stones"],
  },
  {
    category: "flagstone-slate",
    keyword: "flagstone",
    what: "a natural flagstone",
    about: [],
    uses: ["Patios", "Walkways and garden paths", "Stepping stones", "Wall veneer and steps"],
  },
  {
    test: /moss rock/i,
    keyword: "moss rock",
    what: "a moss rock",
    about: [
      "Moss rock is weathered surface stone, often carrying lichen or moss on its faces, which gives it a natural, aged look in the garden.",
    ],
    uses: ["Accent boulders", "Rock gardens", "Dry-stacked borders"],
  },
  {
    category: "boulders",
    keyword: "landscape boulders",
    what: "a landscape boulder stone",
    about: [],
    uses: ["Accent boulders", "Rock gardens", "Borders and slopes"],
  },
  // Hardscape
  {
    category: "pavers",
    keyword: "concrete pavers",
    what: "a concrete paver",
    about: [],
    uses: ["Patios", "Walkways", "Driveways", "Pool decks"],
  },
  {
    category: "wall-blocks",
    keyword: "retaining wall block",
    what: "a segmental wall block",
    about: [],
    uses: ["Retaining walls", "Garden walls", "Raised planters", "Seat walls"],
  },
  {
    category: "wall-caps",
    keyword: "wall cap",
    what: "a wall cap for finishing block walls",
    about: [],
    uses: ["Top course of retaining and garden walls", "Seat walls", "Planter edges"],
  },
  {
    test: /pier block/i,
    keyword: "pier block",
    what: "a precast concrete pier block with a wood cap",
    about: ["Pier blocks are precast concrete footings with a wood top for fastening posts. They support decks, sheds and other light structures."],
    uses: ["Deck posts", "Sheds and small structures", "Fence and post footings"],
  },
  {
    test: /stepping stone/i,
    keyword: "concrete stepping stone",
    what: "a precast concrete stepping stone",
    about: ["Precast stepping stones make a quick, simple path across lawn, gravel or planting beds."],
    uses: ["Garden paths", "Across lawns", "Through gravel and planting beds"],
  },
  {
    category: "concrete-block",
    keyword: "concrete block",
    what: "a concrete masonry unit (CMU)",
    about: [],
    uses: ["Garden and retaining walls", "Planters", "Foundations and footings"],
  },
  // Turf
  {
    test: /cut charge/i,
    keyword: "artificial turf cut charge",
    what: "the charge for cutting artificial turf to a partial roll",
    short: "Cut Charge, Artificial Turf: the charge applied when an artificial turf order is cut to less than a full roll at our Richmond, CA yard.",
    about: ["Artificial turf comes on rolls. When an order needs less than a full roll, the turf is cut to length and this charge applies."],
    uses: ["Turf orders of less than a full roll"],
  },
  {
    category: "artificial-turf",
    keyword: "artificial turf",
    what: "an artificial turf",
    about: [],
    uses: ["Front and back lawns", "Play areas", "Pet runs", "Areas where real grass struggles"],
  },
  // Bagged
  {
    test: /polymeric/i,
    keyword: "polymeric sand",
    what: "a bagged polymeric sand for paver joints",
    about: [
      "Polymeric sand is swept into the joints between pavers and natural stone, then activated with water. It hardens to lock the pieces together and resists weeds, ants and washout better than plain sand. Follow the manufacturer's directions for joint width and weather.",
    ],
    uses: ["Paver joints", "Natural stone joints", "Patios, walkways and driveways"],
  },
  {
    test: /concrete mix/i,
    keyword: "bagged concrete",
    what: "a bagged high-strength concrete mix",
    about: ["Bagged concrete mix needs only water. It is used for setting posts, small slabs, footings, steps and repairs."],
    uses: ["Setting fence and deck posts", "Small slabs and footings", "Steps and repairs"],
  },
  {
    test: /mortar/i,
    keyword: "type s mortar",
    what: "a bagged Type S mortar mix",
    about: ["Type S mortar mix is used to lay concrete block, brick and stone, including walls below grade and retaining walls."],
    uses: ["Laying block and brick", "Stone veneer and walls", "Repointing"],
  },
  {
    test: /portland cement/i,
    keyword: "portland cement",
    what: "a bagged Portland cement",
    about: ["Portland cement is the binder in concrete, mortar and stucco. Mixed with sand, aggregate and water, it sets into a hard, durable material."],
    uses: ["Mixing concrete", "Mixing mortar", "Stucco and plaster mixes"],
  },
  {
    test: /mesh sand/i,
    keyword: "bagged sand",
    what: "a bagged screened sand",
    about: ["Bagged sand is a convenient way to buy a measured amount for small jobs, without a bulk load."],
    uses: ["Small jobs", "Mixing with cement", "Topping up joints and beds"],
  },
  // Sealers, binders, stabilizers
  {
    test: /bark binder/i,
    keyword: "bark binder",
    what: "a binder for bark and mulch",
    about: ["A bark binder is applied over bark or mulch to bond the top layer, so it holds together against wind, rain and foot traffic."],
    uses: ["Mulch on slopes", "Windy areas", "Bark around play areas and paths"],
  },
  {
    test: /pebble binder/i,
    keyword: "pebble binder",
    what: "a permeable binder for loose pebbles",
    about: ["A pebble binder bonds loose pebbles into a solid surface that still lets water drain through."],
    uses: ["Bonded pebble paths", "Tree wells", "Decorative pebble areas"],
  },
  {
    test: /stabilizer/i,
    keyword: "pathway stabilizer",
    what: "a pathway stabilizer for decomposed granite",
    about: ["A pathway stabilizer is mixed into decomposed granite or similar fines before compaction, making the finished path firmer and more resistant to erosion."],
    uses: ["Decomposed granite paths", "Patios and courtyards", "Fines driveways"],
  },
  {
    test: /enhanc/i,
    keyword: "enhancing sealer",
    what: "an enhancing sealer for pavers and hardscape",
    about: ["An enhancing sealer protects pavers, concrete and stone and deepens their natural colour, giving a richer, wet look."],
    uses: ["Pavers", "Natural stone", "Concrete"],
  },
  {
    test: /seal/i,
    category: "sealers",
    keyword: "paver sealer",
    what: "a sealer for pavers and hardscape",
    about: ["A sealer protects pavers, concrete and stone from stains, weathering and fading. Clean the surface first and follow the label for application and drying time."],
    uses: ["Pavers", "Concrete", "Natural stone"],
  },
  // Cleaners
  {
    test: /efflorescence/i,
    keyword: "efflorescence cleaner",
    what: "an efflorescence cleaner",
    about: ["Efflorescence is the white, chalky mineral deposit that can appear on pavers, block and concrete. An efflorescence cleaner removes it, usually before sealing."],
    uses: ["Pavers", "Retaining wall block", "Concrete"],
  },
  {
    test: /mold|moss|mildew/i,
    keyword: "mold and mildew cleaner",
    what: "a mold, moss and mildew cleaner",
    about: ["A mold, moss and mildew cleaner removes organic growth and staining from pavers, concrete and stone."],
    uses: ["Shaded patios", "Walkways", "Retaining walls"],
  },
  {
    test: /stripper/i,
    keyword: "sealer stripper",
    what: "a sealer stripper",
    about: ["A sealer stripper removes old or failed sealer so the surface can be cleaned and resealed."],
    uses: ["Before resealing pavers", "Removing worn sealer"],
  },
  {
    category: "cleaners",
    keyword: "paver cleaner",
    what: "a cleaner for pavers and hardscape",
    about: ["A hardscape cleaner lifts dirt and general staining from pavers, concrete and stone, and is commonly used before sealing."],
    uses: ["Pavers", "Concrete", "Natural stone"],
  },
  // Adhesives
  {
    test: /turf adhesive/i,
    keyword: "turf seam adhesive",
    what: "an adhesive for artificial turf seams",
    about: ["Turf seam adhesive is spread on seaming tape to join two pieces of artificial turf into one continuous surface."],
    uses: ["Artificial turf seams", "Turf repairs"],
  },
  {
    category: "adhesives",
    keyword: "landscape block adhesive",
    what: "a construction adhesive in a caulk-gun tube",
    about: ["Tube adhesive is applied with a caulk gun to bond wall caps, block, pavers and stone."],
    uses: ["Bonding wall caps", "Block and stone", "Steps and edging"],
  },
  // Fabric
  {
    category: "landscape-fabric",
    keyword: "landscape fabric",
    what: "a landscape fabric roll",
    about: [],
    uses: ["Under decorative rock and gravel", "Under bark and mulch", "Under artificial turf base", "Weed control in beds"],
  },
  // Tools
  {
    test: /caulk gun/i,
    keyword: "caulk gun",
    what: "a caulk gun for tube adhesives and sealants",
    about: ["A caulk gun dispenses adhesive and sealant from a tube with even pressure. Match the gun to the tube size."],
    uses: ["Applying tube adhesives", "Bonding wall caps", "Turf seam adhesive"],
  },
  {
    test: /tamper/i,
    keyword: "hand tamper",
    what: "a steel hand tamper",
    about: ["A hand tamper compacts soil, base rock and sand in small areas and in spots a plate compactor cannot reach."],
    uses: ["Compacting base for pavers", "Post holes and trenches", "Small patios and paths"],
  },
  {
    test: /trowel/i,
    keyword: "masonry trowel",
    what: "a masonry trowel",
    about: ["Trowels are the basic hand tools for placing, spreading and finishing mortar and concrete."],
    uses: ["Mortar work", "Concrete finishing", "Patching and repairs"],
  },
  {
    test: /seam tape|turf tape/i,
    keyword: "turf seam tape",
    what: "a seaming tape for artificial turf",
    about: ["Turf seam tape runs under the joint between two pieces of artificial turf and, with seam adhesive, holds them together as one surface."],
    uses: ["Artificial turf seams", "Turf repairs"],
  },
  {
    test: /turf nails|nails/i,
    keyword: "turf nails",
    what: "a box of nails for fastening artificial turf",
    about: ["Long nails fasten artificial turf along its edges and seams into the compacted base below."],
    uses: ["Securing artificial turf edges", "Fastening seams"],
  },
  {
    test: /staples|u-pin/i,
    keyword: "landscape staples",
    what: "a pack of landscape staples (U-pins)",
    about: ["Landscape staples, or U-pins, are pushed into the ground to hold landscape fabric, artificial turf and drip line in place."],
    uses: ["Pinning landscape fabric", "Holding artificial turf", "Securing drip line"],
  },
  {
    test: /foam roller/i,
    keyword: "foam roller",
    what: "a slit foam roller cover",
    about: ["Foam roller covers are used to roll liquid coatings, such as sealers, onto pavers and hardscape surfaces."],
    uses: ["Rolling on sealers", "Liquid coatings"],
  },
  {
    test: /sprayer/i,
    keyword: "pump sprayer",
    what: "a hand pump sprayer",
    about: ["A pump sprayer applies liquids such as cleaners, sealers and binders in an even, controlled spray."],
    uses: ["Applying cleaners", "Applying sealers and binders"],
  },
  {
    test: /bender board/i,
    keyword: "bender board edging",
    what: "a flexible bender board edging",
    about: ["Bender board is flexible edging that bends into curves to separate planting beds, lawn, gravel and paths. It is held in place with stakes."],
    uses: ["Bed and lawn edging", "Gravel and path borders", "Curved edges"],
  },
  {
    test: /stakes/i,
    keyword: "edging stakes",
    what: "a stake for edging and layout",
    about: ["Stakes hold bender board and other edging in place, and are used to mark out and form small projects."],
    uses: ["Securing bender board", "Edging", "Layout and forms"],
  },
  {
    test: /broom/i,
    keyword: "concrete broom",
    what: "a concrete finishing broom",
    about: ["A concrete broom drags a textured, slip-resistant finish across fresh concrete, and sweeps sand into paver joints."],
    uses: ["Broom-finishing concrete", "Sweeping joint sand"],
  },
  {
    test: /putty knife/i,
    keyword: "putty knife",
    what: "a disposable plastic putty knife",
    about: ["A plastic putty knife spreads and scrapes adhesives, sealants and patching compounds and can be thrown away after messy jobs."],
    uses: ["Spreading adhesive", "Scraping and cleanup"],
  },
  {
    test: /rake/i,
    keyword: "bow rake",
    what: "a garden bow rake",
    about: ["A bow rake spreads and levels gravel, soil and mulch, and breaks up clods."],
    uses: ["Spreading gravel and mulch", "Levelling soil", "Grading base"],
  },
  {
    test: /filter sock/i,
    keyword: "drain filter sock",
    what: "a filter sock for perforated drain pipe",
    about: ["A filter sock slips over perforated drain pipe to keep soil and fines out of the pipe while letting water in."],
    uses: ["French drains", "Perforated drain pipe"],
  },
  {
    test: /wheelbarrow/i,
    keyword: "wheelbarrow",
    what: "a steel tub wheelbarrow",
    about: ["A wheelbarrow moves rock, soil, mulch and mixed concrete around the job site."],
    uses: ["Moving rock, soil and mulch", "Mixing and moving concrete"],
  },
  {
    test: /gloves/i,
    keyword: "work gloves",
    what: "a pair of work gloves",
    about: ["Work gloves protect hands when handling stone, block, tools and rough materials."],
    uses: ["Handling stone and block", "General yard work"],
  },
  {
    test: /cleanup bags/i,
    keyword: "contractor cleanup bags",
    what: "a supply of 42-gallon cleanup bags",
    about: ["Large cleanup bags collect yard waste and job-site debris."],
    uses: ["Yard cleanup", "Job-site debris"],
  },
  {
    test: /mixer/i,
    keyword: "mixing paddle",
    what: "an eggbeater mixing paddle",
    about: ["An eggbeater mixer fits a drill to mix mortar, grout, thinset and similar materials."],
    uses: ["Mixing mortar and grout", "Mixing small batches"],
  },
  {
    test: /grout bag/i,
    keyword: "grout bag",
    what: "a grout bag",
    about: ["A grout bag pipes mortar or grout neatly into joints, much like a pastry bag."],
    uses: ["Grouting stone and paver joints", "Pointing mortar joints"],
  },
  {
    test: /sponge/i,
    keyword: "grout sponge",
    what: "a grouting sponge",
    about: ["A grout sponge wipes excess grout and mortar from stone and tile faces while it is still workable."],
    uses: ["Cleaning grout haze", "Wiping stone and tile"],
  },
  {
    test: /shovel/i,
    keyword: "shovel",
    what: "a long-handled shovel",
    about: ["A long-handled shovel digs, moves and spreads soil, rock and mulch."],
    uses: ["Digging", "Moving and spreading material"],
  },
  {
    test: /mixing tub/i,
    keyword: "mixing tub",
    what: "a small mixing tub",
    about: ["A mixing tub holds small batches of concrete, mortar or grout while you mix and work."],
    uses: ["Mixing small batches", "Holding mortar and grout"],
  },
  {
    test: /tape measure/i,
    keyword: "tape measure",
    what: "a tape measure",
    about: ["A tape measure for measuring out beds, patios and walls, and for working out how much material to order."],
    uses: ["Measuring areas for material", "Layout"],
  },
  {
    category: "tools-accessories",
    keyword: "landscaping supplies",
    what: "a landscaping and masonry accessory",
    about: [],
    uses: ["Landscaping projects", "Masonry and hardscape work"],
  },
  // Services
  {
    test: /delivery/i,
    keyword: "flatbed delivery",
    what: "a flatbed delivery with forklift unloading",
    about: ["Flatbed delivery with forklift unloading is used for materials that ship on pallets or in bulk bags. Call the yard to schedule and to confirm access at your site."],
    uses: ["Palletized pavers and wall block", "Bagged products", "Flagstone and boulders"],
  },
  {
    test: /disposal/i,
    keyword: "concrete and dirt disposal",
    what: "a disposal service for mixed concrete, asphalt and dirt, charged by the ton",
    about: ["Mixed concrete, asphalt and dirt can be brought to the yard for disposal and is charged by the ton. Call ahead to confirm what the yard can accept."],
    uses: ["Demolition debris", "Excavated dirt", "Broken concrete and asphalt"],
  },
];

/** The copy for a product, by name and category. */
export function kindFor(name, categorySlug) {
  for (const k of KINDS) {
    if (k.category && k.category !== categorySlug) continue;
    if (k.test && !k.test.test(name)) continue;
    return { ...k, sizeNote: k.size ? sizeNote(name) : "" };
  }
  throw new Error(`No copy rule for "${name}" (${categorySlug})`);
}
