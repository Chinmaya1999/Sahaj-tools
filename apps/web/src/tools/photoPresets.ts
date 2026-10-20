/**
 * Configurable presets. These are common EXAMPLES, not guarantees: every form/portal sets its own rules,
 * so always compare with the official instructions. Edit or add entries freely.
 */
export interface Preset { id: string; label: string; width: number; height: number; maxKb: number; format: "jpeg" | "png" | "webp"; fit: "cover" | "contain"; requirements: string }
export const PRESETS: Preset[] = [
  { id: "profile-square", label: "Square profile picture", width: 400, height: 400, maxKb: 100, format: "jpeg", fit: "cover", requirements: "400 × 400 px, JPEG, up to 100 KB (cropped to fill)" },
  { id: "passport-413", label: "Passport-style photo (35×45 mm at 300 dpi)", width: 413, height: 531, maxKb: 100, format: "jpeg", fit: "cover", requirements: "413 × 531 px, JPEG, up to 100 KB (cropped to fill)" },
  { id: "passport-small", label: "Small passport-style photo (example form limit)", width: 200, height: 230, maxKb: 50, format: "jpeg", fit: "cover", requirements: "200 × 230 px, JPEG, up to 50 KB (cropped to fill)" },
  { id: "signature", label: "Signature (example form limit)", width: 140, height: 60, maxKb: 20, format: "jpeg", fit: "contain", requirements: "140 × 60 px, JPEG, up to 20 KB (kept whole on white)" },
  { id: "signature-wide", label: "Signature, wider (example form limit)", width: 300, height: 100, maxKb: 50, format: "jpeg", fit: "contain", requirements: "300 × 100 px, JPEG, up to 50 KB (kept whole on white)" },
  { id: "upload-1280", label: "Small web upload (max 1280 px wide)", width: 1280, height: 0, maxKb: 300, format: "jpeg", fit: "contain", requirements: "1280 px wide (height follows), JPEG, up to 300 KB" },
];
