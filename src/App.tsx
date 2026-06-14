import React, { useEffect, useState, useRef } from "react";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import {
  getContrastRatio,
  checkWCAGCompliance,
  getContrastStatus,
  getContrastPercentage,
  type RGB,
} from "./utils/contrastUtils";

// ✅ MODEL URL
const MODEL_URL =
  "https://cdn.jsdelivr.net/gh/EnesPINAR/FigmaSense-UI@main/public/model/model.json";

const CLASSES = ["button", "checkbox", "dropdown", "icon", "input", "label", "radio", "switch"];

// --- TİP TANIMLARI ---
interface NativeNodeData {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  textColor?: RGB;
  backgroundColor?: RGB;
}

interface AIRawResult {
  class: string;
  score: number;
  pixelX: number; 
  pixelY: number; 
  pixelW: number;
  pixelH: number;
  previewUrl: string; 
  extractedTextColor?: RGB;
  extractedBgColor?: RGB;
}

interface AnalysisResult {
  id: string;
  class: string;
  score: number;
  status: "✅" | "❌";
  message: string;
  preciseX: number;
  preciseY?: number;
  width?: number;
  height?: number;
  previewUrl: string; 
}

interface ContrastAnalysisResult extends AnalysisResult {
  textColor?: RGB;
  backgroundColor?: RGB;
  contrastRatio?: number;
  wcagCompliance?: {
    isAANormal: boolean;
    isAALarge: boolean;
    isAAA: boolean;
    isAAALarge: boolean;
  };
  contrastStatus?: "pass" | "warning" | "fail";
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
  const imageRef = useRef<HTMLImageElement | null>(null);

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
        imageRef.current = img;
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
            
            const rawScores = transRes.slice([0, 0, 4], [-1, -1, 8]);
            
            // Dropdown'lar genellikle liste halinde peş peşe gelir ve küçük ok ikonları dışında input'lara çok benzerler.
            // Bu yüzden Dropdown sınıfı çarpanını 2.0'a çıkararak modelin en ufak bir dropdown şüphesini değerlendirmesini sağlıyoruz.
            // Sınıflar: ["button", "checkbox", "dropdown", "icon", "input", "label", "radio", "switch"]
            const multipliers = tf.tensor1d([1.0, 1.2, 2.0, 1.0, 1.0, 1.0, 1.2, 1.0]);
            const boostedScores = rawScores.mul(multipliers);

            return {
              boxes: tf.concat([y1Tensor, x1Tensor, tf.add(y1Tensor, hTensor), tf.add(x1Tensor, wTensor)], 2).squeeze(),
              scores: boostedScores.max(2).squeeze(),
              classes: boostedScores.argMax(2).squeeze(),
            };
        });

        // Kilit Düzeltme: Alt alta sıralı (list) elemanlar söz konusu olduğunda,
        // NMS (Non-Max Suppression) varsayılan olarak %45 (0.45) kesişimde birbirlerini ezer ve sadece ilkini bırakır!
        // iouThreshold'u 0.85'e çıkararak sadece %85 üzeri örtüşen aynı kutuları eziyoruz, böylece alt alta olanlar silinmiyor.
        // scoreThreshold: 0.3 -> 0.2 yapıldı ki liste altlarındaki daha düşük eminlikteki tahminler de yakalansın.
        const nms = await tf.image.nonMaxSuppressionAsync(boxes as any, scores as any, 500, 0.85, 0.2);
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

    const matchedResults: ContrastAnalysisResult[] = [];
    const matchedNativeIds = new Set<string>();

    // 🎯 IoU (Kesişim/Birleşim) Algoritması ile Güvenilir Eşleştirme
    aiResults.forEach((aiItem) => {
        let bestMatch: (typeof normalizedNativeNodes[0]) | null = null;
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
            matchedNativeIds.add(bestMatch.id);
            // ✨ YENİ: Kontrast Analizi
            let contrastRatio: number | undefined;
            let wcagCompliance: ContrastAnalysisResult["wcagCompliance"] | undefined;
            let contrastStatus: "pass" | "warning" | "fail" | undefined;

            // Debug: Renkleri kontrol et
            console.log(`[Contrast] ${bestMatch.name}:`, {
              textColor: bestMatch.textColor,
              backgroundColor: bestMatch.backgroundColor,
            });

            if (bestMatch.textColor && bestMatch.backgroundColor) {
                contrastRatio = getContrastRatio(bestMatch.textColor, bestMatch.backgroundColor);
                wcagCompliance = checkWCAGCompliance(contrastRatio);
                contrastStatus = getContrastStatus(contrastRatio);
                
                console.log(`[Contrast] ${bestMatch.name}: ${contrastRatio.toFixed(2)}:1 - ${contrastStatus}`);
                wcagCompliance = checkWCAGCompliance(contrastRatio);
                contrastStatus = getContrastStatus(contrastRatio);
            }

            matchedResults.push({
                id: bestMatch.id,
                class: aiItem.class,
                score: aiItem.score,
                status: "✅",
                message: "Hizalı",
                preciseX: bestMatch.localX,
                preciseY: bestMatch.localY,
                width: bestMatch.width,
                height: bestMatch.height,
                previewUrl: aiItem.previewUrl,
                // ✨ YENİ: Kontrast alanları
                textColor: bestMatch.textColor,
                backgroundColor: bestMatch.backgroundColor,
                contrastRatio,
                wcagCompliance,
                contrastStatus,
            });
        }
    });

    // ✨ YENİ: HYBRID FALLBACK (Yapay Zekanın Kaçırdıklarını Figma Layer İsimlerinden Yakalama)
    // Eğer AI bir elemanı (özellikle listelerdeki dropdownları) kaçırdıysa ama tasarımcı katman ismine
    // "dropdown", "button" vs. yazdıysa, bu veriyi doğrudan Figma üzerinden yakalayarak kurtarıyoruz.
    normalizedNativeNodes.forEach(native => {
        if (!matchedNativeIds.has(native.id)) {
            const lowerName = native.name.toLowerCase();
            let matchedClass = CLASSES.find(c => lowerName.includes(c));
            
            // Eğer sınıf isminde yoksa ama Figma Tipi VECTOR veya BOOLEAN_OPERATION ise ve ikon boyutlarındaysa
            if (!matchedClass && (lowerName.includes("vector") || native.type === "VECTOR" || native.type === "BOOLEAN_OPERATION")) {
                if (native.width < 100 && native.height < 100) {
                    matchedClass = "icon";
                }
            }
            
            if (matchedClass) {
                let contrastRatio: number | undefined;
                let wcagCompliance: ContrastAnalysisResult["wcagCompliance"] | undefined;
                let contrastStatus: "pass" | "warning" | "fail" | undefined;

                if (native.textColor && native.backgroundColor) {
                    contrastRatio = getContrastRatio(native.textColor, native.backgroundColor);
                    wcagCompliance = checkWCAGCompliance(contrastRatio);
                    contrastStatus = getContrastStatus(contrastRatio);
                }

                let fallbackPreviewUrl = "";
                const img = imageRef.current;
                
                if (img) {
                    const cropCanvas = document.createElement("canvas");
                    const cropCtx = cropCanvas.getContext("2d");
                    
                    const px = native.localX;
                    const py = native.localY;
                    const pw = native.width;
                    const ph = native.height;
                    
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
                        fallbackPreviewUrl = cropCanvas.toDataURL("image/png");
                    }
                }

                matchedResults.push({
                    id: native.id,
                    class: matchedClass,
                    score: 1.0, // Kullanıcı katmana isim verdiği için kesin bilgi
                    status: "✅",
                    message: "Figma Katmanından Yakalandı",
                    preciseX: native.localX,
                    preciseY: native.localY,
                    width: native.width,
                    height: native.height,
                    previewUrl: fallbackPreviewUrl,
                    textColor: native.textColor,
                    backgroundColor: native.backgroundColor,
                    contrastRatio,
                    wcagCompliance,
                    contrastStatus,
                });
            }
        }
    });

    // ✨ YENİ: Kapsayıcı (Container) ve Çift Kopya (Duplicate) Eleme Mantığı
    // Eğer küçük bir eleman daha büyük bir elemanın tamamen veya büyük oranda içindeyse
    // veya tam olarak aynı boyutta birden fazla eleman tespit edildiyse, sadece en güçlüsü listelenir.
    const filteredResults = matchedResults.filter((item, index, self) => {
        if (item.preciseY === undefined || item.width === undefined || item.height === undefined) return true;

        const itemLeft = item.preciseX;
        const itemRight = item.preciseX + item.width;
        const itemTop = item.preciseY;
        const itemBottom = item.preciseY + item.height;
        const itemArea = item.width * item.height;

        for (const other of self) {
            if (other.id === item.id) continue;
            if (other.preciseY === undefined || other.width === undefined || other.height === undefined) continue;

            const otherLeft = other.preciseX;
            const otherRight = other.preciseX + other.width;
            const otherTop = other.preciseY;
            const otherBottom = other.preciseY + other.height;

            const intersectLeft = Math.max(itemLeft, otherLeft);
            const intersectRight = Math.min(itemRight, otherRight);
            const intersectTop = Math.max(itemTop, otherTop);
            const intersectBottom = Math.min(itemBottom, otherBottom);

            if (intersectRight > intersectLeft && intersectBottom > intersectTop) {
                const intersectArea = (intersectRight - intersectLeft) * (intersectBottom - intersectTop);
                
                // Eğer bizim alanımızın %80'inden fazlası diğer elemanla kesişiyorsa tehlike var!
                if (intersectArea / itemArea > 0.8) {
                    const otherArea = other.width * other.height;
                    
                    // Kural 1: Diğer eleman bizden daha büyükse, o bir kapsayıcıdır, bizi yutar.
                    if (otherArea > itemArea) {
                        return false;
                    } 
                    // Kural 2: Boyutlar birebir aynı (veya çok yakın) ise duplicate (çift kopya) vakasıdır.
                    else if (Math.abs(otherArea - itemArea) < 2) {
                        // Kimin güven skoru yüksekse o yaşar
                        if (other.score > item.score) {
                            return false;
                        } 
                        // Skorlar da eşitse dizideki ilk eleman yaşar
                        else if (other.score === item.score) {
                            const myIndex = self.indexOf(item);
                            const otherIndex = self.indexOf(other);
                            if (myIndex > otherIndex) return false;
                        }
                    }
                }
            }
        }
        return true;
    });

    // Hizalama Kontrolü (Demokrasi Yöntemi)
    const targets = filteredResults.filter(r => ["input", "button"].includes(r.class));
    
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

    const finalResults = filteredResults.map(item => {
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

                    <div style={{display: "flex", gap: "6px"}}>
                      {/* ✨ YENİ: Kontrast Badge */}
                      {res.contrastStatus && (
                        <span style={{
                          fontSize:"10px", 
                          padding:"3px 6px", 
                          borderRadius:"3px",
                          fontWeight:"600",
                          background: res.contrastStatus === "pass" ? "#E8F5E9" : res.contrastStatus === "warning" ? "#FFF3E0" : "#FFEBEE",
                          color: res.contrastStatus === "pass" ? "#2E7D32" : res.contrastStatus === "warning" ? "#E65100" : "#C62828",
                          title: res.contrastRatio ? `Kontrast: ${res.contrastRatio.toFixed(2)}:1` : ""
                        }}>
                          {res.contrastStatus === "pass" ? "✓ AAA" : res.contrastStatus === "warning" ? "⚠ AA" : "✗ Zayıf"}
                        </span>
                      )}

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
                </div>

                {/* ✨ YENİ: Kontrast Detayları */}
                {res.contrastRatio ? (
                  <div style={{
                    fontSize: "11px",
                    padding: "8px",
                    background: "#F5F5F5",
                    borderRadius: "4px",
                    marginBottom: "10px",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "8px"
                  }}>
                    <div>
                      <span style={{color: "#666", fontWeight: "500"}}>Kontrast:</span>
                      <div style={{color: "#333", fontWeight: "600", fontSize: "12px"}}>
                        {res.contrastRatio.toFixed(2)}:1
                      </div>
                    </div>
                    <div>
                      <span style={{color: "#666", fontWeight: "500"}}>WCAG:</span>
                      <div style={{color: "#333", fontWeight: "600", fontSize: "12px"}}>
                        {res.wcagCompliance?.isAAA ? "AAA ✓" : res.wcagCompliance?.isAANormal ? "AA ✓" : "Fail ✗"}
                      </div>
                    </div>
                    {res.textColor && res.backgroundColor && (
                      <>
                        <div style={{display: "flex", alignItems: "center", gap: "4px"}}>
                          <span style={{color: "#666", fontWeight: "500"}}>Text:</span>
                          <div style={{
                            width: "16px",
                            height: "16px",
                            background: `rgb(${res.textColor[0]}, ${res.textColor[1]}, ${res.textColor[2]})`,
                            borderRadius: "2px",
                            border: "1px solid #ddd"
                          }} title={`RGB(${res.textColor.join(", ")})`} />
                        </div>
                        <div style={{display: "flex", alignItems: "center", gap: "4px"}}>
                          <span style={{color: "#666", fontWeight: "500"}}>BG:</span>
                          <div style={{
                            width: "16px",
                            height: "16px",
                            background: `rgb(${res.backgroundColor[0]}, ${res.backgroundColor[1]}, ${res.backgroundColor[2]})`,
                            borderRadius: "2px",
                            border: "1px solid #ddd"
                          }} title={`RGB(${res.backgroundColor.join(", ")})`} />
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div style={{
                    fontSize: "10px",
                    padding: "6px 8px",
                    background: "#FFF3CD",
                    borderRadius: "4px",
                    marginBottom: "10px",
                    color: "#856404",
                    fontWeight: "500"
                  }}>
                    ℹ️ Renk bilgisi çıkarılamadı (Element'in fill/stroke renklendirilmesi gerekiyor)
                  </div>
                )}

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
                    {res.previewUrl ? (
                      <img 
                        src={res.previewUrl} 
                        alt="preview" 
                        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} 
                      />
                    ) : null}
                </div>
            </div>
        ))}
      </div>
      <style>{`.scroll-container::-webkit-scrollbar { width: 6px; } .scroll-container::-webkit-scrollbar-thumb { background: #dcdcdc; border-radius: 4px; }`}</style>
    </div>
  );
}

export default App;