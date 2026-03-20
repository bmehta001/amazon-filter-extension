/**
 * Integration test: fetch real CPSC data and test matching against
 * realistic Amazon product titles for various recall-heavy categories.
 */
import { extractMatchTokens, computeMatchConfidence, matchProductToRecalls } from "../src/recall/checker";
import type { CpscRecall } from "../src/recall/types";

const CATEGORIES: Record<string, { title: string; brand?: string }[]> = {
  "power bank": [
    { title: "Anker PowerCore 10000mAh Portable Charger Power Bank", brand: "Anker" },
    { title: "INIU Power Bank 10000mAh Slim Portable Charger", brand: "INIU" },
    { title: "Baseus Power Bank 65W 20000mAh Laptop Portable Charger", brand: "Baseus" },
    { title: "Miady 10000mAh Dual USB Portable Charger", brand: "Miady" },
  ],
  "high chair": [
    { title: "Graco Blossom 6-in-1 Convertible High Chair", brand: "Graco" },
    { title: "Fisher-Price SpaceSaver Simple Clean High Chair", brand: "Fisher-Price" },
    { title: "IKEA ANTILOP High Chair with Tray", brand: "IKEA" },
    { title: "Cosco Simple Fold High Chair", brand: "Cosco" },
  ],
  "baby swing": [
    { title: "VEVOR Baby Swing Electric Infant Cradle", brand: "VEVOR" },
    { title: "Graco Soothe My Way Swing with Removable Rocker", brand: "Graco" },
    { title: "Fisher-Price Sweet Snugapuppy Swing", brand: "Fisher-Price" },
    { title: "Ingenuity ConvertMe 2-in-1 Compact Portable Baby Swing", brand: "Ingenuity" },
  ],
  "mattress": [
    { title: "Zinus 10 Inch Green Tea Memory Foam Mattress", brand: "Zinus" },
    { title: "Casper Sleep Original Hybrid Mattress", brand: "Casper" },
    { title: "Sweetnight Queen Mattress in a Box 12 Inch", brand: "Sweetnight" },
    { title: "Linenspa 8 Inch Memory Foam and Innerspring Hybrid Mattress", brand: "Linenspa" },
  ],
  "helmet": [
    { title: "Giro Register MIPS Adult Recreational Cycling Helmet", brand: "Giro" },
    { title: "Bell Qualifier Full-Face Motorcycle Helmet", brand: "Bell" },
    { title: "Triple Eight Gotham Dual Certified Skateboard Helmet", brand: "Triple Eight" },
    { title: "Schwinn Thrasher Adult Bike Helmet", brand: "Schwinn" },
  ],
  "toy": [
    { title: "LEGO Classic Large Creative Brick Box", brand: "LEGO" },
    { title: "Melissa & Doug Wooden Building Blocks Set", brand: "Melissa & Doug" },
    { title: "Fisher-Price Laugh & Learn Smart Stages Chair", brand: "Fisher-Price" },
    { title: "Magna-Tiles Clear Colors 100 Piece Set", brand: "Magna-Tiles" },
  ],
  "battery": [
    { title: "Energizer MAX AA Batteries 48 Pack", brand: "Energizer" },
    { title: "Duracell Optimum AA Batteries 28 Count", brand: "Duracell" },
    { title: "Amazon Basics 48 Pack AA Alkaline Batteries", brand: "Amazon Basics" },
    { title: "EBL Rechargeable AA Batteries 2800mAh 16 Pack", brand: "EBL" },
    { title: "Panasonic Eneloop Pro AA Rechargeable Batteries", brand: "Panasonic" },
  ],
  "lithium battery": [
    { title: "EF ECOFLOW RIVER 2 Portable Power Station", brand: "EF ECOFLOW" },
    { title: "Jackery Explorer 300 Portable Power Station", brand: "Jackery" },
    { title: "Goal Zero Yeti 200X Portable Power Station", brand: "Goal Zero" },
    { title: "Bluetti EB3A Portable Power Station", brand: "Bluetti" },
  ],
  "laptop": [
    { title: "Apple MacBook Air 15-inch M3 Chip", brand: "Apple" },
    { title: "HP Pavilion 15 Laptop", brand: "HP" },
    { title: "Lenovo IdeaPad 3 15 Laptop", brand: "Lenovo" },
    { title: "Dell Inspiron 15 3520 Laptop", brand: "Dell" },
  ],
  "charger": [
    { title: "Anker 735 Charger GaNPrime 65W", brand: "Anker" },
    { title: "Apple 20W USB-C Power Adapter", brand: "Apple" },
    { title: "Samsung 25W Super Fast Wall Charger", brand: "Samsung" },
    { title: "Belkin BoostCharge Pro 3-in-1 Wireless Charger", brand: "Belkin" },
  ],
  "space heater": [
    { title: "Lasko Ceramic Portable Space Heater", brand: "Lasko" },
    { title: "Dreo Space Heater for Indoor Use", brand: "Dreo" },
    { title: "GiveBest Portable Electric Space Heater", brand: "GiveBest" },
    { title: "Vornado MVH Vortex Heater", brand: "Vornado" },
  ],
  "hoverboard": [
    { title: "Swagtron T580 Bluetooth Hoverboard", brand: "Swagtron" },
    { title: "TOMOLOO Hoverboard with Bluetooth Speaker", brand: "TOMOLOO" },
    { title: "Gyroor Warrior Off Road Hoverboard", brand: "Gyroor" },
    { title: "Hover-1 Helix Electric Hoverboard", brand: "Hover-1" },
  ],
  "electric scooter": [
    { title: "Segway Ninebot MAX G30LP Electric Kick Scooter", brand: "Segway" },
    { title: "Gotrax GXL V2 Commuting Electric Scooter", brand: "Gotrax" },
    { title: "Razor E300 Electric Scooter", brand: "Razor" },
    { title: "Hiboy S2 Pro Electric Scooter", brand: "Hiboy" },
  ],
};

async function main() {
  console.log("🔍 CPSC Recall Matching Integration Test\n");
  let totalMatches = 0;
  let totalProducts = 0;

  for (const [query, titles] of Object.entries(CATEGORIES)) {
    const url = `https://www.saferproducts.gov/RestWebServices/Recall?ProductName=${encodeURIComponent(query)}&format=json&RecallDateStart=2023-01-01`;
    const res = await fetch(url);
    const recalls: CpscRecall[] = await res.json();
    const amazonRecalls = recalls.filter(r =>
      r.Retailers?.some(ret => ret.Name?.toLowerCase().includes("amazon"))
    );

    console.log(`\n${"=".repeat(60)}`);
    console.log(`📦 "${query}" — ${recalls.length} recalls (${amazonRecalls.length} sold on Amazon)`);
    console.log("=".repeat(60));

    for (const product of titles) {
      totalProducts++;
      const matches = matchProductToRecalls(product.title, product.brand, recalls, 0.25);
      if (matches.length > 0) {
        totalMatches++;
        const m = matches[0];
        console.log(`  ⚠️  ${product.title}`);
        console.log(`     Recall: ${m.recall.Title.slice(0, 90)}`);
        console.log(`     Confidence: ${(m.confidence * 100).toFixed(0)}% | Matched on: ${m.matchedOn.join(", ")}`);
        if (m.recall.Hazards?.length > 0) {
          console.log(`     Hazard: ${m.recall.Hazards[0].Name.slice(0, 80)}`);
        }
      } else {
        console.log(`  ✅ ${product.title} — no recall matches`);
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 Summary: ${totalMatches}/${totalProducts} products matched a recall`);
  console.log("=".repeat(60));
}

main().catch(console.error);
