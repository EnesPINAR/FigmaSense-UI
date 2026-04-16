import React, { useEffect, useState, useRef } from "react";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";

// ✅ MODEL URL
const MODEL_URL =
  "https://cdn.jsdelivr.net/gh/EnesPINAR/FigmaSense-UI@main/public/model/model.json";

const CLASSES = ["button", "checkbox", "dropdown", "icon", "input", "label", "radio", "switch"];

// --- TİP TANIMLARI ---
interface NativeNodeData {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AIRawResult {
  class: string;
  score: number;
  pixelX: number; 
  pixelY: number; 
  pixelW: number;
  pixelH: number;
  previewUrl: string; 
}

interface AnalysisResult {
  id: string;
  class: string;
  score: number;
  status: "✅" | "❌";
  message: string;
  preciseX: number;
  previewUrl: string; 
}

const getIcon = (className: string) => {
  switch (className) {
    case "button": return "🖱️";
    case "input": return "🔤";
    case "label": return "🏷️";
    case "checkbox": return "☑️";
    case "radio": return "🔘";
    case "icon": return "⭐";
    case "dropdown": return "🔻";
    case "switch": return "🔌";
    default: return "📦";
  }
};

const formatName = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

function App() {
  const [status, setStatus] = useState<string>("Hazır");
  const [model, setModel] = useState<tf.GraphModel | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  
  const tempAIResultsStr = useRef<string>("[]"); 

  useEffect(() => {
    const loadModel = async () => {
      try {
        setStatus("🧠 AI Yükleniyor...");
        await tf.setBackend("webgl");
        await tf.ready();
        const loadedModel = await tf.loadGraphModel(MODEL_URL);
        const zeros = tf.zeros([1, 1280, 1280, 3]);
        // @ts-ignore
        await loadedModel.executeAsync(zeros);
        zeros.dispose();
        setModel(loadedModel);
        setStatus("✅ Hazır");
      } catch (error) {
        console.error(error);
        setStatus("❌ Hata");
      }
    };
    loadModel();
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (msg.type === "error") {
        setStatus("❌ " + msg.message);
        setIsProcessing(false);
      } else if (msg.type === "image-data") {
        runAIPrediction(msg.bytes);
      } else if (msg.type === "native-data") {
        processHybridData(msg.nodes);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [model]);

  const runAIPrediction = async (imageBytes: Uint8Array) => {
    if (!model) return;
    setStatus("Görseller Hazırlanıyor...");
    setResults([]);

    try {
      const img = new Image();
      const blob = new Blob([imageBytes as any], { type: "image/png" });
      img.src = URL.createObjectURL(blob);

      img.onload = async () => {
        const { input, newW, newH } = tf.tidy(() => {
            const tensor = tf.browser.fromPixels(img);
            const [h, w] = tensor.shape;
            const maxSize = 1280;
            const scale = Math.min(maxSize / h, maxSize / w);
            const targetW = Math.round(w * scale);
            const targetH = Math.round(h * scale);
            const resized = tf.image.resizeBilinear(tensor, [targetH, targetW]);
            const padded = tf.pad(resized, [[0, maxSize - targetH], [0, maxSize - targetW], [0, 0]] as any, 128);
            return { input: padded.div(255.0).expandDims(0), newW: targetW, newH: targetH };
        });

        // @ts-ignore
        const prediction = await model.executeAsync(input);
        input.dispose();

        const realWidth = img.width / 2; 
        const realHeight = img.height / 2;

        const transRes = prediction.transpose([0, 2, 1]);
        const { boxes, scores, classes } = tf.tidy(() => {
            const wTensor = transRes.slice([0, 0, 2], [-1, -1, 1]);
            const hTensor = transRes.slice([0, 0, 3], [-1, -1, 1]);
            const x1Tensor = tf.sub(transRes.slice([0, 0, 0], [-1, -1, 1]), tf.div(wTensor, 2));
            const y1Tensor = tf.sub(transRes.slice([0, 0, 1], [-1, -1, 1]), tf.div(hTensor, 2));
            return {
              boxes: tf.concat([y1Tensor, x1Tensor, tf.add(y1Tensor, hTensor), tf.add(x1Tensor, wTensor)], 2).squeeze(),
              scores: transRes.slice([0, 0, 4], [-1, -1, 8]).max(2).squeeze(),
              classes: transRes.slice([0, 0, 4], [-1, -1, 8]).argMax(2).squeeze(),
            };
        });

        const nms = await tf.image.nonMaxSuppressionAsync(boxes as any, scores as any, 500, 0.5, 0.5);
        const dBoxes = boxes.gather(nms, 0).dataSync();
        const dScores = scores.gather(nms, 0).dataSync();
        const dClasses = classes.gather(nms, 0).dataSync();

        let aiRawResults: AIRawResult[] = [];
        
        for (let i = 0; i < nms.size; i++) {
          const px = (dBoxes[i * 4 + 1] / newW) * realWidth;
          const py = (dBoxes[i * 4] / newH) * realHeight;
          const pw = ((dBoxes[i * 4 + 3] - dBoxes[i * 4 + 1]) / newW) * realWidth;
          const ph = ((dBoxes[i * 4 + 2] - dBoxes[i * 4]) / newH) * realHeight;

          const cropCanvas = document.createElement("canvas");
          const cropCtx = cropCanvas.getContext("2d");
          
          const MAX_W = 300; 
          const MAX_H = 120;
          const scaleCrop = Math.min(MAX_W / pw, MAX_H / ph, 1);
          
          cropCanvas.width = pw * scaleCrop;
          cropCanvas.height = Math.max(ph * scaleCrop, 1);

          if (cropCtx) {
            cropCtx.drawImage(
                img,
                px * 2, py * 2, pw * 2, ph * 2, 
                0, 0, pw * scaleCrop, ph * scaleCrop 
            );
          }

          aiRawResults.push({
            class: CLASSES[dClasses[i]],
            score: dScores[i],
            pixelX: px,
            pixelY: py,
            pixelW: pw,
            pixelH: ph,
            previewUrl: cropCanvas.toDataURL("image/png")
          });
        }
        
        tf.dispose([prediction, transRes, boxes, scores, classes, nms]);
        tempAIResultsStr.current = JSON.stringify(aiRawResults);
        
        parent.postMessage({ pluginMessage: { type: "fetch-native-data" } }, "*");
      };
    } catch (e) {
      console.error(e);
      setStatus("❌ Hata");
      setIsProcessing(false);
    }
  };

  const processHybridData = (nativeNodes: NativeNodeData[]) => {
    const aiResults: AIRawResult[] = JSON.parse(tempAIResultsStr.current);
    
    if (nativeNodes.length === 0) {
        setIsProcessing(false);
        return;
    }

    const frameMinX = Math.min(...nativeNodes.map(n => n.x));
    const frameMinY = Math.min(...nativeNodes.map(n => n.y));

    const normalizedNativeNodes = nativeNodes.map(n => ({
        ...n,
        localX: n.x - frameMinX,
        localY: n.y - frameMinY
    }));

    const matchedResults: AnalysisResult[] = [];

    // 🎯 IoU (Kesişim/Birleşim) Algoritması ile Güvenilir Eşleştirme
    aiResults.forEach((aiItem) => {
        let bestMatch = null;
        let bestIoU = 0;

        normalizedNativeNodes.forEach(native => {
            // İki kutunun kesişim koordinatları
            const xA = Math.max(aiItem.pixelX, native.localX);
            const yA = Math.max(aiItem.pixelY, native.localY);
            const xB = Math.min(aiItem.pixelX + aiItem.pixelW, native.localX + native.width);
            const yB = Math.min(aiItem.pixelY + aiItem.pixelH, native.localY + native.height);

            // Kesişen alan
            const intersectionArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);

            if (intersectionArea > 0) {
                const aiArea = aiItem.pixelW * aiItem.pixelH;
                const nativeArea = native.width * native.height;
                const unionArea = aiArea + nativeArea - intersectionArea;
                
                // Kesişim / Birleşim oranı (0 ile 1 arası)
                const iou = intersectionArea / unionArea;

                if (iou > bestIoU) {
                    bestIoU = iou;
                    bestMatch = native;
                }
            }
        });

        // Sadece %10'dan fazla uyuşma varsa gerçek bir obje olarak kabul et
        if (bestMatch && bestIoU > 0.1) {
            matchedResults.push({
                id: bestMatch.id,
                class: aiItem.class,
                score: aiItem.score,
                status: "✅",
                message: "Hizalı",
                preciseX: bestMatch.localX, // Eşleşen gerçek katmanın kesin X değeri
                previewUrl: aiItem.previewUrl 
            });
        }
    });

    // Hizalama Kontrolü (Demokrasi Yöntemi)
    const targets = matchedResults.filter(r => ["input", "button"].includes(r.class));
    
    // Tolerans 0.5 piksele indirildi (Auto Layout sub-pixel kusurlarını engeller ama 1 px'i affetmez)
    const TOLERANCE = 0.5; 
    let correctX = 0;
    let bestCount = -1;

    if (targets.length > 0) {
        targets.forEach(candidate => {
            const supporters = targets.filter(el => Math.abs(el.preciseX - candidate.preciseX) <= TOLERANCE).length;
            if (supporters > bestCount) {
                bestCount = supporters;
                correctX = candidate.preciseX;
            }
        });
    }

    const finalResults = matchedResults.map(item => {
        if (["input", "button"].includes(item.class)) {
            const diff = item.preciseX - correctX;
            if (Math.abs(diff) > TOLERANCE) {
                 const dir = diff > 0 ? "Sağ" : "Sol";
                 return { ...item, status: "❌", message: `${Math.abs(diff).toFixed(1)}px ${dir}` };
            }
            return { ...item, status: "✅", message: "Tam Hizalı" };
        }
        return { ...item, status: "✅", message: " " };
    });

    setResults(finalResults);
    setStatus(`Bitti (${finalResults.length} öğe)`);
    setIsProcessing(false);
  };

  const requestAnalysis = () => {
    if (!model) return;
    setIsProcessing(true);
    setStatus("Başlatılıyor...");
    parent.postMessage({ pluginMessage: { type: "analyze-request" } }, "*");
  };

  return (
    <div style={{ fontFamily: "Inter, sans-serif", height: "100vh", display: "flex", flexDirection: "column", background: "#FFFFFF", overflow: "hidden", width: "100%" }}>
      {/* HEADER */}
      <div style={{ padding: "12px", borderBottom: "1px solid #eee", flexShrink: 0 }}>
        <div style={{display: "flex", justifyContent: "space-between", marginBottom: "8px"}}>
          <h2 style={{margin:0, fontSize:"14px", fontWeight: "600"}}>FigmaSense AI 👁️</h2>
          <span style={{fontSize:"11px", color:"#888", fontWeight: "500"}}>{status}</span>
        </div>
        <button onClick={requestAnalysis} disabled={!model || isProcessing} style={{ background: model && !isProcessing ? "#18A0FB" : "#ccc", color: "white", border: "none", padding: "10px", borderRadius: "6px", width: "100%", cursor: model && !isProcessing ? "pointer" : "default", fontWeight: "600" }}>
          {isProcessing ? "İnceleniyor..." : "Tasarımı Denetle"}
        </button>
      </div>

      {/* LİSTE */}
      <div style={{ flexGrow: 1, overflowY: "auto", padding: "12px", background: "#FAFAFA" }} className="scroll-container">
        {results.length === 0 && !isProcessing && (
            <div style={{textAlign:"center", color:"#999", fontSize:"12px", marginTop:"30px"}}>Frame seçip taramayı başlatın.</div>
        )}
        
        {results.map((res, i) => (
            <div key={i} style={{ 
              display: "flex", 
              flexDirection: "column", 
              padding: "12px", 
              marginBottom: "12px", 
              background: "#fff", 
              borderLeft: res.status === "❌" ? "4px solid #FF4D4F" : "4px solid #4CAF50", 
              borderRadius: "8px", 
              boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
              borderTop: "1px solid #f0f0f0",
              borderRight: "1px solid #f0f0f0",
              borderBottom: "1px solid #f0f0f0"
            }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <div style={{display: "flex", alignItems: "center", gap: "6px"}}>
                         <span style={{fontSize: "14px"}}>{getIcon(res.class)}</span>
                         <span style={{fontWeight:"700", fontSize:"13px", textTransform:"capitalize", color: "#333"}}>
                           {formatName(res.class)}
                         </span>
                    </div>

                    {res.status === "❌" ? (
                       <span style={{fontSize:"11px", color:"#D32F2F", background:"#FFEBEE", padding:"4px 8px", borderRadius:"4px", fontWeight:"600"}}>
                         {res.message}
                       </span>
                    ) : (
                       <span style={{fontSize:"11px", color:"#388E3C", fontWeight:"bold"}}>
                          {res.message === "Tam Hizalı" ? "✓ Hizalı" : ""}
                       </span>
                    )}
                </div>

                <div style={{
                    width: "100%", 
                    height: "80px", 
                    background: "#F9F9F9", 
                    borderRadius: "6px",
                    border: "1px dashed #E0E0E0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    padding: "4px"
                }}>
                    <img 
                      src={res.previewUrl} 
                      alt="preview" 
                      style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} 
                    />
                </div>
            </div>
        ))}
      </div>
      <style>{`.scroll-container::-webkit-scrollbar { width: 6px; } .scroll-container::-webkit-scrollbar-thumb { background: #dcdcdc; border-radius: 4px; }`}</style>
    </div>
  );
}

export default App;