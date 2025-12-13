"use strict";
(() => {
  var __async = (__this, __arguments, generator) => {
    return new Promise((resolve, reject) => {
      var fulfilled = (value) => {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      };
      var rejected = (value) => {
        try {
          step(generator.throw(value));
        } catch (e) {
          reject(e);
        }
      };
      var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
      step((generator = generator.apply(__this, __arguments)).next());
    });
  };

  // code.ts
  figma.showUI(__html__, { width: 300, height: 450 });
  figma.ui.onmessage = (msg) => __async(null, null, function* () {
    if (msg.type === "analyze-request") {
      if (figma.currentPage.selection.length === 0) {
        figma.notify("\u274C L\xFCtfen analiz edilecek bir Frame se\xE7in.");
        return;
      }
      const node = figma.currentPage.selection[0];
      if (node.type !== "FRAME" && node.type !== "COMPONENT" && node.type !== "INSTANCE") {
        figma.notify("\u26A0\uFE0F L\xFCtfen bir Frame se\xE7in.");
        return;
      }
      figma.notify("\u{1F4F8} G\xF6r\xFCnt\xFC i\u015Fleniyor...");
      const bytes = yield node.exportAsync({
        format: "PNG",
        constraint: { type: "SCALE", value: 2 }
        // Kalite için 2x
      });
      figma.ui.postMessage({ type: "image-data", bytes });
    } else if (msg.type === "draw-rectangles") {
      const nodes = [];
      const selectedNode = figma.currentPage.selection[0];
      const { width, height } = selectedNode;
      for (const box of msg.boxes) {
        const rect = figma.createRectangle();
        const x = box.x1 * width;
        const y = box.y1 * height;
        const w = (box.x2 - box.x1) * width;
        const h = (box.y2 - box.y1) * height;
        rect.x = x;
        rect.y = y;
        rect.resize(w, h);
        rect.fills = [{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 0.1 }];
        rect.strokes = [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }];
        rect.strokeWeight = 2;
        rect.name = `${box.class} (${Math.round(box.score * 100)}%)`;
        selectedNode.appendChild(rect);
        nodes.push(rect);
      }
      figma.currentPage.selection = nodes;
      figma.notify(`\u2705 Analiz Bitti! ${msg.boxes.length} nesne bulundu.`);
    }
  });
})();
