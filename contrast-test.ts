/**
 * Quick Contrast Math Verification
 * Test: Black(0,0,0) vs White(255,255,255) = 21:1
 */

import { getLuminance, getContrastRatio, checkWCAGCompliance } from "./src/utils/contrastUtils";

console.log("=== Contrast Ratio Tests ===\n");

// Test 1: Pure Black vs Pure White
const black: [number, number, number] = [0, 0, 0];
const white: [number, number, number] = [255, 255, 255];

const blackLum = getLuminance(...black);
const whiteLum = getLuminance(...white);
const bwContrast = getContrastRatio(black, white);

console.log("Test 1: Black vs White");
console.log(`  Black luminance: ${blackLum}`);
console.log(`  White luminance: ${whiteLum}`);
console.log(`  Expected contrast: 21:1`);
console.log(`  Actual contrast: ${bwContrast.toFixed(2)}:1`);
console.log(`  ✓ PASS` + (Math.abs(bwContrast - 21) < 0.1 ? "" : " - ERROR!"));
console.log("");

// Test 2: Dark Gray vs Light Gray
const darkGray: [number, number, number] = [51, 51, 51];
const lightGray: [number, number, number] = [204, 204, 204];

const dgLum = getLuminance(...darkGray);
const lgLum = getLuminance(...lightGray);
const dgContrast = getContrastRatio(darkGray, lightGray);

console.log("Test 2: Dark Gray vs Light Gray");
console.log(`  Dark gray luminance: ${dgLum}`);
console.log(`  Light gray luminance: ${lgLum}`);
console.log(`  Contrast ratio: ${dgContrast.toFixed(2)}:1`);
console.log(`  WCAG AA (Normal): ${checkWCAGCompliance(dgContrast).isAANormal ? "✓ PASS" : "✗ FAIL"}`);
console.log("");

// Test 3: Check if same colors give 1:1
const sameColor: [number, number, number] = [100, 150, 200];
const sameContrast = getContrastRatio(sameColor, sameColor);

console.log("Test 3: Same Color vs Itself");
console.log(`  Expected contrast: 1:1`);
console.log(`  Actual contrast: ${sameContrast.toFixed(2)}:1`);
console.log(`  ✓ PASS` + (Math.abs(sameContrast - 1) < 0.01 ? "" : " - ERROR!"));
