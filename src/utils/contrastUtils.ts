/**
 * WCAG 2.1 Kontrast Analiz Utilityleri
 * Referans: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */

export type RGB = [number, number, number];

/**
 * sRGB rengi için Luminans (L) değerini hesapla
 * @param r Red (0-255)
 * @param g Green (0-255)
 * @param b Blue (0-255)
 * @returns Luminans değeri (0-1)
 */
export function getLuminance(r: number, g: number, b: number): number {
  // Normalize et (0-1 aralığına)
  const [rs, gs, bs] = [r, g, b].map(x => {
    x = x / 255;
    // sRGB kompensasyonu
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });

  // Luminans formülü: L = 0.2126 * R + 0.7152 * G + 0.0722 * B
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * İki renk arasındaki kontrast oranını hesapla
 * @param color1 İlk renk [R, G, B]
 * @param color2 İkinci renk [R, G, B]
 * @returns Kontrast oranı (1-21 aralığında)
 */
export function getContrastRatio(color1: RGB, color2: RGB): number {
  const l1 = getLuminance(...color1);
  const l2 = getLuminance(...color2);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  // Kontrast Oranı = (L1 + 0.05) / (L2 + 0.05), L1 > L2
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG standartlarına uygun mu kontrol et
 */
export interface AccessibilityLevel {
  AA_NORMAL: number; // 4.5:1
  AA_LARGE: number;  // 3:1
  AAA_NORMAL: number; // 7:1
  AAA_LARGE: number;  // 4.5:1
}

export const WCAG_STANDARDS: AccessibilityLevel = {
  AA_NORMAL: 4.5,
  AA_LARGE: 3,
  AAA_NORMAL: 7,
  AAA_LARGE: 4.5,
};

/**
 * Kontrast oranının WCAG uyumluluğunu kontrol et
 */
export interface WCAGCompliance {
  isAANormal: boolean;  // Normal metin için AA (4.5:1)
  isAALarge: boolean;   // Büyük metin için AA (3:1)
  isAAA: boolean;       // Normal metin için AAA (7:1)
  isAAALarge: boolean;  // Büyük metin için AAA (4.5:1)
}

export function checkWCAGCompliance(contrastRatio: number): WCAGCompliance {
  return {
    isAANormal: contrastRatio >= WCAG_STANDARDS.AA_NORMAL,
    isAALarge: contrastRatio >= WCAG_STANDARDS.AA_LARGE,
    isAAA: contrastRatio >= WCAG_STANDARDS.AAA_NORMAL,
    isAAALarge: contrastRatio >= WCAG_STANDARDS.AAA_LARGE,
  };
}

/**
 * Kontrast seviyesine göre özellik sınıfı döndür
 */
export function getContrastStatus(contrastRatio: number): "pass" | "warning" | "fail" {
  if (contrastRatio >= WCAG_STANDARDS.AAA_NORMAL) return "pass"; // AAA ✅
  if (contrastRatio >= WCAG_STANDARDS.AA_NORMAL) return "warning"; // AA ⚠️
  return "fail"; // Başarısız ❌
}

/**
 * Kontrast oranını yüzde cinsinden göster
 */
export function getContrastPercentage(contrastRatio: number): number {
  // 1:1 = 0%, 21:1 = 100%
  const normalized = (contrastRatio - 1) / 20; // 0-1 aralığına normalize et
  return Math.round(normalized * 100);
}

/**
 * Hex rengi RGB'ye dönüştür
 */
export function hexToRgb(hex: string): RGB | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
  ];
}

/**
 * RGB'yi Hex'e dönüştür
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join("").toUpperCase();
}

/**
 * Piksel verisi (Uint8ClampedArray) den RGB değer çıkar
 * x, y koordinatlarında bulunan pikselin RGB değeri
 */
export function getPixelColor(
  imageData: ImageData,
  x: number,
  y: number
): RGB {
  const { width, data } = imageData;
  const index = (Math.floor(y) * width + Math.floor(x)) * 4;
  return [data[index], data[index + 1], data[index + 2]];
}

/**
 * Görüntü bölgesinden dominant rengi çıkar (histogram-based)
 */
export function getDominantColor(
  imageData: ImageData,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): RGB {
  const { width, data } = imageData;

  const colorMap = new Map<string, number>();
  let maxCount = 0;
  let dominantKey = "0,0,0";

  // Bölgedeki tüm pikselleri istatistikle
  for (let y = Math.floor(y1); y < Math.ceil(y2); y++) {
    for (let x = Math.floor(x1); x < Math.ceil(x2); x++) {
      if (x < 0 || x >= width || y < 0 || y >= imageData.height) continue;

      const [r, g, b] = getPixelColor(imageData, x, y);
      const key = `${r},${g},${b}`;

      const count = (colorMap.get(key) || 0) + 1;
      colorMap.set(key, count);

      if (count > maxCount) {
        maxCount = count;
        dominantKey = key;
      }
    }
  }

  const [r, g, b] = dominantKey.split(",").map(Number) as RGB;
  return [r, g, b];
}

/**
 * Renk kontrast İyileştirme önerisi
 */
export function getContrastImprovementSuggestion(
  textColor: RGB,
  backgroundColor: RGB,
  targetRatio: number = WCAG_STANDARDS.AAA_NORMAL
): { suggestedText?: RGB; suggestedBg?: RGB } {
  // Basit suggestion: text rengini daha açık/koyu yap veya bg'yi adjust et
  // Gelişmiş algoritma daha sonra eklenebilir
  return {
    suggestedText: undefined,
    suggestedBg: undefined,
  };
}
