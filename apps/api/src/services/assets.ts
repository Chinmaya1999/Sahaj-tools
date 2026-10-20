import JSZip from "jszip";
import { toCsv } from "@ek/shared";

const HEADER = ["name", "sku", "barcode", "category", "supplier", "price", "cost", "quantity", "reorder_level", "expiry_date", "size", "colour", "variant"];

/** Generates the actual downloadable file on demand. Every asset is a real, valid archive with instructions. */
export async function buildAsset(id: string): Promise<{ filename: string; contentType: string; data: Buffer } | null> {
  if (id !== "inventory-starter-kit") return null;
  const zip = new JSZip();
  zip.file("README.txt", [
    "Oqzra – Inventory Starter Kit",
    "====================================",
    "",
    "What is inside",
    "  - inventory-general.csv   : a general-purpose product list",
    "  - inventory-cosmetics.csv : products with expiry dates",
    "  - inventory-clothing.csv  : products with size / colour / variant",
    "",
    "How to use",
    "  1. Open the Inventory & Expiry Manager in your browser and sign in.",
    "  2. Go to Items -> Import CSV.",
    "  3. Choose one of these files (or your own CSV exported from Excel / Google Sheets).",
    "  4. Check the column mapping, review the preview, fix any rows marked with errors, then confirm.",
    "",
    "Column notes",
    "  price and cost are in rupees (e.g. 249.50). quantity is the opening stock.",
    "  expiry_date uses YYYY-MM-DD. SKU must be unique within your account.",
    "  Existing SKUs are skipped, never overwritten.",
    "",
    "The sample rows are fictional examples – delete them before real use.",
  ].join("\n"));
  zip.file("inventory-general.csv", toCsv([HEADER, ["Notebook A5", "NB-A5", "", "Stationery", "Local Supplier", "40", "25", "100", "20", "", "", "", ""], ["Ball Pen Blue", "PEN-BL", "", "Stationery", "Local Supplier", "10", "6", "250", "50", "", "", "", ""]]));
  zip.file("inventory-cosmetics.csv", toCsv([HEADER, ["Aloe Face Wash 100ml", "FW-ALOE-100", "", "Skincare", "Herbal Co", "180", "110", "24", "6", "2027-06-30", "", "", ""], ["Rose Lip Balm", "LB-ROSE", "", "Lip care", "Herbal Co", "90", "50", "40", "10", "2027-01-31", "", "", ""]]));
  zip.file("inventory-clothing.csv", toCsv([HEADER, ["Cotton T-Shirt", "TS-COT-M-BLK", "", "Tops", "Textile Hub", "399", "230", "15", "5", "", "M", "Black", "Round neck"], ["Cotton T-Shirt", "TS-COT-L-BLK", "", "Tops", "Textile Hub", "399", "230", "12", "5", "", "L", "Black", "Round neck"]]));
  const data = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { filename: "inventory-starter-kit.zip", contentType: "application/zip", data };
}
