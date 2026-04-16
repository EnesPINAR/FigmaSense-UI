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

  // 2. KESİN VERİ İSTEĞİ (Native Data)
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

        return {
          id: node.id,
          name: node.name,
          x: absX, // Artık Relative değil, Absolute X
          y: absY, // Artık Relative değil, Absolute Y
          width: node.width,
          height: node.height,
        };
      });

    figma.ui.postMessage({ type: "native-data", nodes: nativeNodes });
  }
};
