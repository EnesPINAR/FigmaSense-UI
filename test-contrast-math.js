// Kontrastı test etmek için standalone kod
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(x => {
    x = x / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(color1, color2) {
  const l1 = getLuminance(...color1);
  const l2 = getLuminance(...color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Test
const black = [0, 0, 0];
const white = [255, 255, 255];
const contrast = getContrastRatio(black, white);

console.log("Black vs White:");
console.log(`  Black lum: ${getLuminance(0, 0, 0)}`);
console.log(`  White lum: ${getLuminance(255, 255, 255)}`);
console.log(`  Contrast: ${contrast.toFixed(2)}:1 (expected: 21:1)`);

// Test with sample colors (example Label)
const siyahYazi = [0, 0, 0];
const beyazArkaplan = [255, 255, 255];
const labelContrast = getContrastRatio(siyahYazi, beyazArkaplan);
console.log("\nLabel Test (Black text on White bg):");
console.log(`  Contrast: ${labelContrast.toFixed(2)}:1`);
console.log(`  Status: ${labelContrast >= 7 ? "AAA ✓" : labelContrast >= 4.5 ? "AA ✓" : "Fail ✗"}`);
