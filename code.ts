/// <reference types="@figma/plugin-typings" />
// controller.ts veya code.ts
console.clear();

figma.showUI(__html__, { width: 340, height: 600, themeColors: true });

// Yardımcı Fonksiyon: Tüm alt katmanları düzleştirerek (flatten) getir
// Bu sayede Input bir grubun en dibinde olsa bile buluruz.
function findAllNodes(node: SceneNode, nodes: SceneNode[] = []) {
  if ("children" in node) {
    for (const child of node.children) {
      nodes.push(child);
      findAllNodes(child, nodes);
    }
  }
  return nodes;
}

// ✨ YENİ: Figma node'undan renk bilgisi çıkar (GELİŞTİRİLMİŞ)
function extractColorFromNode(node: SceneNode): { textColor?: [number, number, number], bgColor?: [number, number, number] } {
  const colors: { textColor?: [number, number, number], bgColor?: [number, number, number] } = {};

  try {
    // STRATEJI:
    // 1. Text node ise → text fill'i al
    // 2. Parent text varsa → onun fill'ini al
    // 3. Kendi fill'i varsa → background olarak al
    // 4. Stroke varsa → text rengi olarak al (fallback)

    // 1️⃣ BU NODE'UN KENDI TEXT RENGI (eğer TEXT node ise)
    if (node.type === "TEXT") {
      const textNode = node as TextNode;
      if (textNode.fills && Array.isArray(textNode.fills)) {
        for (const fill of textNode.fills) {
          if (fill.type === "SOLID" && fill.color && (fill.visible !== false)) {
            const r = Math.round(fill.color.r * 255);
            const g = Math.round(fill.color.g * 255);
            const b = Math.round(fill.color.b * 255);
            colors.textColor = [r, g, b];
            console.log(`[Color] TEXT: "${node.name}" text color = RGB(${r},${g},${b})`);
            break;
          }
        }
      }
    }

    // 2️⃣ CHILD TEXT NODE'LARI TARA (Button içinde Text gibi)
    if (!colors.textColor && "children" in node) {
      const children = (node as any).children;
      if (Array.isArray(children)) {
        for (const child of children) {
          if (child.type === "TEXT" && child.visible) {
            const textNode = child as TextNode;
            if (textNode.fills && Array.isArray(textNode.fills)) {
              for (const fill of textNode.fills) {
                if (fill.type === "SOLID" && fill.color && (fill.visible !== false)) {
                  const r = Math.round(fill.color.r * 255);
                  const g = Math.round(fill.color.g * 255);
                  const b = Math.round(fill.color.b * 255);
                  colors.textColor = [r, g, b];
                  console.log(`[Color] CHILD TEXT: "${child.name}" text color = RGB(${r},${g},${b})`);
                  break;
                }
              }
              if (colors.textColor) break; // İlk text rengi bulundu
            }
          }
        }
      }
    }

    // 3️⃣ NODE'UN KENDI FILL'İ (Background) - SADECE TEXT OLMAYAN NODE'LAR İÇİN
    if ("fills" in node && node.type !== "TEXT") {
      const fills = (node as any).fills;
      if (Array.isArray(fills) && fills.length > 0) {
        for (const fill of fills) {
          if (fill.type === "SOLID" && fill.color && (fill.visible !== false)) {
            const r = Math.round(fill.color.r * 255);
            const g = Math.round(fill.color.g * 255);
            const b = Math.round(fill.color.b * 255);
            colors.bgColor = [r, g, b];
            console.log(`[Color] FILL: "${node.name}" bg color = RGB(${r},${g},${b})`);
            break;
          }
        }
      }
    }

    // 4️⃣ NODE'UN STROKE'U (Fallback text color)
    if (!colors.textColor && "strokes" in node) {
      const strokes = (node as any).strokes;
      if (Array.isArray(strokes) && strokes.length > 0) {
        for (const stroke of strokes) {
          if (stroke.type === "SOLID" && stroke.color && (stroke.visible !== false) && stroke.strokeWeight > 0) {
            const r = Math.round(stroke.color.r * 255);
            const g = Math.round(stroke.color.g * 255);
            const b = Math.round(stroke.color.b * 255);
            colors.textColor = [r, g, b];
            console.log(`[Color] STROKE: "${node.name}" stroke color = RGB(${r},${g},${b})`);
            break;
          }
        }
      }
    }

    // 5️⃣ PARENT BACKGROUND (Eğer node'un fill'i yoksa)
    if (!colors.bgColor && "parent" in node && node.parent && node.parent.type !== "PAGE") {
      const parent = node.parent as SceneNode;
      if ("fills" in parent) {
        const fills = (parent as any).fills;
        if (Array.isArray(fills)) {
          for (const fill of fills) {
            if (fill.type === "SOLID" && fill.color && (fill.visible !== false)) {
              const r = Math.round(fill.color.r * 255);
              const g = Math.round(fill.color.g * 255);
              const b = Math.round(fill.color.b * 255);
              colors.bgColor = [r, g, b];
              console.log(`[Color] PARENT: "${parent.name}" bg color = RGB(${r},${g},${b})`);
              break;
            }
          }
        }
      }
    }

    console.log(`[Color] FINAL: "${node.name}" →`, colors);

  } catch (error) {
    console.error(`[Color] ERROR on "${node.name}":`, error);
  }

  return colors;
}

figma.ui.onmessage = async (msg) => {
  // 1. Görüntü İsteği (AI İçin)
  if (msg.type === "analyze-request") {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.ui.postMessage({
        type: "error",
        message: "Lütfen bir Frame seçin.",
      });
      return;
    }
    const node = selection[0];
    try {
      const bytes = await node.exportAsync({
        format: "PNG",
        constraint: { type: "SCALE", value: 2 },
      });
      figma.ui.postMessage({ type: "image-data", bytes });
    } catch (err) {
      figma.ui.postMessage({ type: "error", message: "Görüntü alınamadı." });
    }
  }

  // 2. KESİN VERİ İSTEĞİ (Native Data) + RENK BİLGİSİ
  if (msg.type === "fetch-native-data") {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.ui.postMessage({ type: "native-data", nodes: [] });
      return;
    }

    const mainFrame = selection[0];

    // Sadece doğrudan çocukları değil, tüm ağacı tara (Deep Search)
    // Böylece grupların içindeki inputları da yakalarız.
    const allDescendants = findAllNodes(mainFrame as SceneNode);

    const nativeNodes = allDescendants
      .filter((node) => node.visible)
      .map((node) => {
        // --- KRİTİK DÜZELTME: MUTLAK KOORDİNAT HESABI ---
        // node.x yerine absoluteTransform kullanıyoruz.
        // absoluteTransform[0][2] -> X eksenindeki mutlak konum (Translation X)
        // absoluteTransform[1][2] -> Y eksenindeki mutlak konum (Translation Y)
        const absX = node.absoluteTransform[0][2];
        const absY = node.absoluteTransform[1][2];

        // ✨ YENİ: Renk bilgisini çıkar
        const { textColor, bgColor } = extractColorFromNode(node);

        return {
          id: node.id,
          name: node.name,
          x: absX, // Artık Relative değil, Absolute X
          y: absY, // Artık Relative değil, Absolute Y
          width: node.width,
          height: node.height,
          textColor, // ✨ YENİ
          backgroundColor: bgColor, // ✨ YENİ
        };
      });

    figma.ui.postMessage({ type: "native-data", nodes: nativeNodes });
  }
};
