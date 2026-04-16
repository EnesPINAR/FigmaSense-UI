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
  console.clear();
  figma.showUI(__html__, { width: 340, height: 600, themeColors: true });
  function findAllNodes(node, nodes = []) {
    if ("children" in node) {
      for (const child of node.children) {
        nodes.push(child);
        findAllNodes(child, nodes);
      }
    }
    return nodes;
  }
  figma.ui.onmessage = (msg) => __async(null, null, function* () {
    if (msg.type === "analyze-request") {
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        figma.ui.postMessage({
          type: "error",
          message: "L\xFCtfen bir Frame se\xE7in."
        });
        return;
      }
      const node = selection[0];
      try {
        const bytes = yield node.exportAsync({
          format: "PNG",
          constraint: { type: "SCALE", value: 2 }
        });
        figma.ui.postMessage({ type: "image-data", bytes });
      } catch (err) {
        figma.ui.postMessage({ type: "error", message: "G\xF6r\xFCnt\xFC al\u0131namad\u0131." });
      }
    }
    if (msg.type === "fetch-native-data") {
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        figma.ui.postMessage({ type: "native-data", nodes: [] });
        return;
      }
      const mainFrame = selection[0];
      const allDescendants = findAllNodes(mainFrame);
      const nativeNodes = allDescendants.filter((node) => node.visible).map((node) => {
        const absX = node.absoluteTransform[0][2];
        const absY = node.absoluteTransform[1][2];
        return {
          id: node.id,
          name: node.name,
          x: absX,
          // Artık Relative değil, Absolute X
          y: absY,
          // Artık Relative değil, Absolute Y
          width: node.width,
          height: node.height
        };
      });
      figma.ui.postMessage({ type: "native-data", nodes: nativeNodes });
    }
  });
})();
