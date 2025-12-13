/// <reference types="@figma/plugin-typings" />
// Plugin arayüzünü göster
figma.showUI(__html__, { width: 300, height: 400 });
// UI'dan gelen mesajları dinle
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'analyze-request') {
    // 1. Seçili bir şey var mı kontrol et
    if (figma.currentPage.selection.length === 0) {
      figma.notify("❌ Lütfen analiz edilecek bir Frame seçin.");
      return;
    }

    const node = figma.currentPage.selection[0];

    // 2. Sadece FRAME veya COMPONENT gibi kap kapsayıcıları kabul et
    if (node.type !== 'FRAME' && node.type !== 'COMPONENT' && node.type !== 'INSTANCE') {
      figma.notify("⚠️ Lütfen bir Frame veya Ekran seçin.");
      return;
    }

    figma.notify("📸 Görüntü alınıyor...");
    
    // 3. Seçilen alanı resim (PNG) olarak dışa aktar
    const bytes = await node.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: 2 } // Kaliteli olsun diye 2x alıyoruz
    });

    // 4. Resmi UI tarafına (Yapay Zekaya) gönder
    figma.ui.postMessage({ 
      type: 'image-data', 
      bytes: bytes 
    });
  }
};