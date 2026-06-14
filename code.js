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
  function extractColorFromNode(node) {
    const colors = {};
    try {
      if (node.type === "TEXT" || node.type === "VECTOR" || node.type === "BOOLEAN_OPERATION") {
        const fills = node.fills;
        if (Array.isArray(fills)) {
          for (const fill of fills) {
            if (fill.type === "SOLID" && fill.color && fill.visible !== false) {
              const r = Math.round(fill.color.r * 255);
              const g = Math.round(fill.color.g * 255);
              const b = Math.round(fill.color.b * 255);
              colors.textColor = [r, g, b];
              break;
            }
          }
        }
      }
      if (!colors.textColor && "children" in node) {
        const children = node.children;
        if (Array.isArray(children)) {
          for (const child of children) {
            if ((child.type === "TEXT" || child.type === "VECTOR" || child.type === "BOOLEAN_OPERATION") && child.visible) {
              const fills = child.fills;
              if (Array.isArray(fills)) {
                for (const fill of fills) {
                  if (fill.type === "SOLID" && fill.color && fill.visible !== false) {
                    const r = Math.round(fill.color.r * 255);
                    const g = Math.round(fill.color.g * 255);
                    const b = Math.round(fill.color.b * 255);
                    colors.textColor = [r, g, b];
                    break;
                  }
                }
                if (colors.textColor) break;
              }
            }
          }
        }
      }
      if ("fills" in node && node.type !== "TEXT" && node.type !== "VECTOR" && node.type !== "BOOLEAN_OPERATION") {
        const fills = node.fills;
        if (Array.isArray(fills) && fills.length > 0) {
          for (const fill of fills) {
            if (fill.type === "SOLID" && fill.color && fill.visible !== false && fill.opacity !== 0) {
              const r = Math.round(fill.color.r * 255);
              const g = Math.round(fill.color.g * 255);
              const b = Math.round(fill.color.b * 255);
              colors.bgColor = [r, g, b];
              break;
            }
          }
        }
      }
      if (!colors.textColor && "strokes" in node) {
        const strokes = node.strokes;
        if (Array.isArray(strokes) && strokes.length > 0) {
          for (const stroke of strokes) {
            if (stroke.type === "SOLID" && stroke.color && stroke.visible !== false && stroke.strokeWeight > 0) {
              const r = Math.round(stroke.color.r * 255);
              const g = Math.round(stroke.color.g * 255);
              const b = Math.round(stroke.color.b * 255);
              colors.textColor = [r, g, b];
              break;
            }
          }
        }
      }
      if (!colors.bgColor && "parent" in node) {
        let currentParent = node.parent;
        while (currentParent && currentParent.type !== "PAGE" && !colors.bgColor) {
          if ("fills" in currentParent) {
            const fills = currentParent.fills;
            if (Array.isArray(fills)) {
              for (const fill of fills) {
                if (fill.type === "SOLID" && fill.color && fill.visible !== false && fill.opacity !== 0) {
                  const r = Math.round(fill.color.r * 255);
                  const g = Math.round(fill.color.g * 255);
                  const b = Math.round(fill.color.b * 255);
                  colors.bgColor = [r, g, b];
                  break;
                }
              }
            }
          }
          currentParent = currentParent.parent;
        }
      }
    } catch (error) {
      console.error(`[Color] ERROR on "${node.name}":`, error);
    }
    return colors;
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
        const { textColor, bgColor } = extractColorFromNode(node);
        return {
          id: node.id,
          name: node.name,
          type: node.type,
          // Eklendi
          x: absX,
          // Artık Relative değil, Absolute X
          y: absY,
          // Artık Relative değil, Absolute Y
          width: node.width,
          height: node.height,
          textColor,
          // ✨ YENİ
          backgroundColor: bgColor
          // ✨ YENİ
        };
      });
      figma.ui.postMessage({ type: "native-data", nodes: nativeNodes });
    }
  });
})();
