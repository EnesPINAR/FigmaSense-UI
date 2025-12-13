import React, { useEffect, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl'; // GPU hızlandırma için şart

// Modelin girdi boyutu (Eğitimde 1280 yaptık, burada da 1280 olmalı!)
const MODEL_INPUT_SIZE = 1280;

function App() {
  const [status, setStatus] = useState<string>("⏳ Başlatılıyor...");
  const [model, setModel] = useState<tf.GraphModel | null>(null);

  useEffect(() => {
    const loadModel = async () => {
      try {
        setStatus("🧠 Model Yükleniyor...");
        
        // 1. Backend'i ayarla (WebGL = GPU Kullanımı)
        await tf.setBackend('webgl');
        await tf.ready();
        console.log("Backend:", tf.getBackend()); // Konsolda 'webgl' görmelisin

        // 2. Modeli yükle
        // Figma pluginlerinde 'public' klasörü bazen kök dizin '/' olarak görünür.
        const modelUrl = 'model/model.json'; 
        const loadedModel = await tf.loadGraphModel(modelUrl);
        
        console.log("✅ Model yüklendi:", loadedModel);
        setModel(loadedModel);
        setStatus("✅ Hazır! (v2 - 1280px)");

        // 3. Isınma Turu (Warm-up)
        // İlk tahmin her zaman yavaştır, kullanıcı beklemesin diye boş bir tahmin yapalım.
        const zeros = tf.zeros([1, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, 3]);
        // @ts-ignore (TypeScript bazen shape hatası verebilir, şimdilik görmezden gel)
        loadedModel.predict(zeros).dispose();
        zeros.dispose();
        
      } catch (error) {
        console.error("Model yükleme hatası:", error);
        setStatus("❌ Hata: Model yüklenemedi. (Konsola bak)");
      }
    };

    loadModel();
  }, []);

  const handleAnalyze = () => {
    // Buraya birazdan analiz kodlarını yazacağız
    parent.postMessage({ pluginMessage: { type: 'analyze-request' } }, '*');
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>
      <h2 style={{ margin: '0 0 10px 0' }}>FigmaSense AI 👁️</h2>
      
      <div style={{ 
        padding: '10px', 
        backgroundColor: status.includes('Hata') ? '#ffebeb' : '#e6fffa', 
        borderRadius: '8px',
        marginBottom: '20px',
        color: status.includes('Hata') ? '#c53030' : '#2c7a7b',
        fontWeight: 'bold',
        fontSize: '14px'
      }}>
        {status}
      </div>

      <button 
        onClick={handleAnalyze}
        disabled={!model} // Model yüklenmeden tıklanamasın
        style={{
          backgroundColor: model ? '#18A0FB' : '#ccc',
          color: 'white',
          border: 'none',
          padding: '10px 20px',
          borderRadius: '6px',
          cursor: model ? 'pointer' : 'not-allowed',
          fontWeight: 'bold',
          width: '100%'
        }}
      >
        Tasarımı Analiz Et 🚀
      </button>
      
      <p style={{fontSize: '11px', color: '#888', marginTop: '15px'}}>
        Powered by YOLOv8n (On-Device)
      </p>
    </div>
  );
}

export default App;