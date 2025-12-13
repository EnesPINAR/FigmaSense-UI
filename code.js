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
  figma.showUI(__html__, { width: 300, height: 400 });
  figma.ui.onmessage = (msg) => __async(null, null, function* () {
    if (msg.type === "analyze-request") {
      if (figma.currentPage.selection.length === 0) {
        figma.notify("\u274C L\xFCtfen analiz edilecek bir Frame se\xE7in.");
        return;
      }
      const node = figma.currentPage.selection[0];
      if (node.type !== "FRAME" && node.type !== "COMPONENT" && node.type !== "INSTANCE") {
        figma.notify("\u26A0\uFE0F L\xFCtfen bir Frame veya Ekran se\xE7in.");
        return;
      }
      figma.notify("\u{1F4F8} G\xF6r\xFCnt\xFC al\u0131n\u0131yor...");
      const bytes = yield node.exportAsync({
        format: "PNG",
        constraint: { type: "SCALE", value: 2 }
        // Kaliteli olsun diye 2x alıyoruz
      });
      figma.ui.postMessage({
        type: "image-data",
        bytes
      });
    }
  });
})();
