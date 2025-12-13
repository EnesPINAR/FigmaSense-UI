/// <reference types="@figma/plugin-typings" />

figma.showUI(__html__, { width: 300, height: 450 });

figma.ui.onmessage = async (msg) => {
  
  // 1. ANALİZ İSTEĞİ GELDİ (Kullanıcı butona bastı)
  if (msg.type === 'analyze-request') {
    if (figma.currentPage.selection.length === 0) {
      figma.notify("❌ Lütfen analiz edilecek bir Frame seçin.");
      return;
    }
    const node = figma.currentPage.selection[0];
    
    // Sadece Frame vb. kabul et
    if (node.type !== 'FRAME' && node.type !== 'COMPONENT' && node.type !== 'INSTANCE') {
      figma.notify("⚠️ Lütfen bir Frame seçin.");
      return;
    }

    figma.notify("📸 Görüntü işleniyor...");
    
    // Resmi al ve UI'a gönder
    const bytes = await node.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: 2 } // Kalite için 2x
    });
    
    figma.ui.postMessage({ type: 'image-data', bytes: bytes });
  }

  // 2. SONUÇLAR GELDİ (Yapay zeka buldu, çizim yapalım)
  else if (msg.type === 'draw-rectangles') {
    const nodes: SceneNode[] = [];
    const selectedNode = figma.currentPage.selection[0] as FrameNode;
    
    // Seçili frame'in boyutları
    const { width, height } = selectedNode;

    // Her bir tespit için kutu çiz
    for (const box of msg.boxes) {
      const rect = figma.createRectangle();
      
      // Koordinatları hesapla (Oransal geldiği için genişlik/yükseklik ile çarpıyoruz)
      const x = box.x1 * width;
      const y = box.y1 * height;
      const w = (box.x2 - box.x1) * width;
      const h = (box.y2 - box.y1) * height;

      rect.x = x;
      rect.y = y;
      rect.resize(w, h);
      
      // Stil Ayarları (Şeffaf Kırmızı Kutu)
      rect.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 0.1 }]; // İçi %10 kırmızı
      rect.strokes = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }]; // Çerçeve tam kırmızı
      rect.strokeWeight = 2;
      rect.name = `${box.class} (${Math.round(box.score * 100)}%)`; // Katman ismi

      // Kutuyu seçili frame'in içine at
      selectedNode.appendChild(rect);
      nodes.push(rect);
    }

    // Çizilen kutuları seçili hale getir
    figma.currentPage.selection = nodes;
    figma.notify(`✅ Analiz Bitti! ${msg.boxes.length} nesne bulundu.`);
  }
};