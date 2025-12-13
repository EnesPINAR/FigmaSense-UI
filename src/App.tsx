import React, { useEffect, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";

// ✅ MODEL URL
const MODEL_URL =
  "https://cdn.jsdelivr.net/gh/EnesPINAR/FigmaSense-UI@main/public/model/model.json";

const CLASSES = [
  "button",
  "checkbox",
  "dropdown",
  "icon",
  "input",
  "label",
  "radio",
  "switch",
];

// İkonlar
const getIcon = (className: string) => {
  switch (className) {
    case "button":
      return "🖱️";
    case "input":
      return "🔤";
    case "checkbox":
      return "☑️";
    case "radio":
      return "🔘";
    case "label":
      return "🏷️";
    case "icon":
      return "⭐";
    case "switch":
      return "🔌";
    case "dropdown":
      return "🔻";
    default:
      return "📦";
  }
};

const formatName = (name: string) => {
  if (!name) return "Bilinmiyor";
  return name.charAt(0).toUpperCase() + name.slice(1);
};

const rgbToHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");

interface AnalysisResult {
  id: number;
  class: string;
  score: number;
  status: "✅ Geçti" | "❌ Hatalı";
  message: string;
  colors: { text: string; bg: string };
  pixelX: number; // Gerçek piksel değeri
  pixelY: number;
}

function App() {
  const [status, setStatus] = useState<string>("⏳ Başlatılıyor...");
  const [model, setModel] = useState<tf.GraphModel | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<AnalysisResult[]>([]);

  useEffect(() => {
    const loadModel = async () => {
      try {
        setStatus("🧠 Model Yükleniyor...");
        await tf.setBackend("webgl");
        await tf.ready();
        const loadedModel = await tf.loadGraphModel(MODEL_URL);

        // Warm-up
        const zeros = tf.zeros([1, 1280, 1280, 3]);
        // @ts-ignore
        await loadedModel.executeAsync(zeros);
        zeros.dispose();

        setModel(loadedModel);
        setStatus("✅ Hazır! (Ultra Hassas Mod)");
      } catch (error) {
        console.error("Model hatası:", error);
        setStatus("❌ Model yüklenemedi!");
      }
    };
    loadModel();
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (msg && msg.type === "image-data") {
        runPrediction(msg.bytes);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [model]);

  const runPrediction = async (imageBytes: Uint8Array) => {
    if (!model) return;
    setIsProcessing(true);
    setStatus("Piksel analizi yapılıyor...");
    setResults([]);

    try {
      const img = new Image();
      const blob = new Blob([imageBytes as any], { type: "image/png" });
      img.src = URL.createObjectURL(blob);

      img.onload = async () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        // Orijinal boyutları al
        const realWidth = img.width;
        const realHeight = img.height;

        canvas.width = realWidth;
        canvas.height = realHeight;
        if (ctx) ctx.drawImage(img, 0, 0);

        const { input, newW, newH } = tf.tidy(() => {
          const tensor = tf.browser.fromPixels(img);
          const [h, w] = tensor.shape;
          const maxSize = 1280;
          const scale = Math.min(maxSize / h, maxSize / w);
          const targetW = Math.round(w * scale);
          const targetH = Math.round(h * scale);
          const resized = tf.image.resizeBilinear(tensor, [targetH, targetW]);
          const paddings = [
            [0, maxSize - targetH],
            [0, maxSize - targetW],
            [0, 0],
          ];
          const padded = tf.pad(resized, paddings as any, 128);
          return {
            input: padded.div(255.0).expandDims(0),
            newW: targetW,
            newH: targetH,
          };
        });

        // @ts-ignore
        const prediction = await model.executeAsync(input);
        input.dispose();

        const transRes = prediction.transpose([0, 2, 1]);
        const { boxes, scores, classes } = tf.tidy(() => {
          const wTensor = transRes.slice([0, 0, 2], [-1, -1, 1]);
          const hTensor = transRes.slice([0, 0, 3], [-1, -1, 1]);
          const x1Tensor = tf.sub(
            transRes.slice([0, 0, 0], [-1, -1, 1]),
            tf.div(wTensor, 2),
          );
          const y1Tensor = tf.sub(
            transRes.slice([0, 0, 1], [-1, -1, 1]),
            tf.div(hTensor, 2),
          );
          return {
            boxes: tf
              .concat(
                [
                  y1Tensor,
                  x1Tensor,
                  tf.add(y1Tensor, hTensor),
                  tf.add(x1Tensor, wTensor),
                ],
                2,
              )
              .squeeze(),
            scores: transRes.slice([0, 0, 4], [-1, -1, 8]).max(2).squeeze(),
            classes: transRes.slice([0, 0, 4], [-1, -1, 8]).argMax(2).squeeze(),
          };
        });

        const nms = await tf.image.nonMaxSuppressionAsync(
          boxes as any,
          scores as any,
          500,
          0.5,
          0.5,
        );
        const dBoxes = boxes.gather(nms, 0).dataSync();
        const dScores = scores.gather(nms, 0).dataSync();
        const dClasses = classes.gather(nms, 0).dataSync();

        let rawItems = [];

        for (let i = 0; i < nms.size; i++) {
          let y1 = dBoxes[i * 4];
          let x1 = dBoxes[i * 4 + 1];
          let y2 = dBoxes[i * 4 + 2];
          let x2 = dBoxes[i * 4 + 3];

          x1 = Math.max(0, Math.min(x1, newW));
          y1 = Math.max(0, Math.min(y1, newH));
          x2 = Math.max(0, Math.min(x2, newW));
          y2 = Math.max(0, Math.min(y2, newH));

          // Gerçek Piksel Dönüşümü
          const pixelX1 = (x1 / newW) * realWidth;
          const pixelY1 = (y1 / newH) * realHeight;
          const pixelW = ((x2 - x1) / newW) * realWidth;
          const pixelH = ((y2 - y1) / newH) * realHeight;

          let colors = { text: "#000", bg: "#fff" };
          if (ctx) {
            const bgX = Math.floor(pixelX1 + pixelW * 0.1);
            const bgY = Math.floor(pixelY1 + pixelH * 0.1);
            const bgP = ctx.getImageData(bgX, bgY, 1, 1).data;
            const txX = Math.floor(pixelX1 + pixelW / 2);
            const txY = Math.floor(pixelY1 + pixelH / 2);
            const txP = ctx.getImageData(txX, txY, 1, 1).data;
            colors.bg = rgbToHex(bgP[0], bgP[1], bgP[2]);
            colors.text = rgbToHex(txP[0], txP[1], txP[2]);
          }

          rawItems.push({
            pixelX: pixelX1, // Artık ham piksel saklıyoruz
            pixelY: pixelY1,
            class: CLASSES[dClasses[i]],
            score: dScores[i],
            colors: colors,
          });
        }

        // Sıralama (Y'ye göre)
        rawItems.sort((a, b) => {
          const yDiff = a.pixelY - b.pixelY;
          // Satır kontrolü için 10 piksel tolerans
          if (Math.abs(yDiff) < 10) return a.pixelX - b.pixelX;
          return yDiff;
        });

        // --- ULTRA HASSAS HİZALAMA (PIXEL PERFECT) ---
        const formElements = rawItems.filter((r) =>
          ["input", "button"].includes(r.class),
        );

        // Tolerans: Modelin titremesini tolere etmek için 3 piksel veriyoruz.
        const PIXEL_TOLERANCE = 3.0;

        let correctX = 0;

        if (formElements.length > 0) {
          let bestCount = -1;
          // Demokrasi: Hangi piksel hizasında daha çok eleman var?
          formElements.forEach((candidate) => {
            const supporters = formElements.filter(
              (el) => Math.abs(el.pixelX - candidate.pixelX) <= PIXEL_TOLERANCE,
            ).length;
            if (supporters > bestCount) {
              bestCount = supporters;
              correctX = candidate.pixelX;
            }
          });
        }

        const uiResults: AnalysisResult[] = rawItems.map((item, index) => {
          let status: "✅ Geçti" | "❌ Hatalı" = "✅ Geçti";
          let message = "Mükemmel";

          if (["input", "button"].includes(item.class)) {
            const diff = item.pixelX - correctX;

            if (Math.abs(diff) > PIXEL_TOLERANCE) {
              status = "❌ Hatalı";
              // Kullanıcıya ne kadar kaydığını söyle (Örn: 5px Sağda)
              const direction = diff > 0 ? "Sağa" : "Sola";
              message = `${Math.round(Math.abs(diff))}px ${direction} kaymış`;
            }
          }

          return {
            id: index,
            class: item.class,
            score: item.score,
            status: status,
            message: message,
            colors: item.colors,
            pixelX: item.pixelX,
            pixelY: item.pixelY,
          };
        });

        setResults(uiResults);

        tf.dispose([prediction, transRes, boxes, scores, classes, nms]);
        setIsProcessing(false);
        setStatus(`✅ Analiz Tamamlandı!`);
      };
    } catch (e) {
      console.error(e);
      setStatus("❌ Hata oluştu");
      setIsProcessing(false);
    }
  };

  const requestAnalysis = () => {
    parent.postMessage({ pluginMessage: { type: "analyze-request" } }, "*");
  };

  return (
    <div
      style={{
        padding: "16px",
        fontFamily: "Inter, sans-serif",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#f8f9fa",
      }}
    >
      <div style={{ flexShrink: 0 }}>
        <h2
          style={{ marginBottom: "15px", textAlign: "center", color: "#111" }}
        >
          PixelPerfect AI 🎯
        </h2>

        <div
          style={{
            padding: "8px",
            background: status.includes("Hata") ? "#ffebeb" : "#e3f2fd",
            color: status.includes("Hata") ? "#d32f2f" : "#1565c0",
            borderRadius: "6px",
            marginBottom: "15px",
            fontSize: "12px",
            textAlign: "center",
            fontWeight: "600",
          }}
        >
          {status}
        </div>

        <button
          onClick={requestAnalysis}
          disabled={!model || isProcessing}
          style={{
            background: model && !isProcessing ? "#222" : "#ccc",
            color: "#fff",
            border: "none",
            padding: "12px",
            borderRadius: "8px",
            cursor: model && !isProcessing ? "pointer" : "not-allowed",
            width: "100%",
            fontWeight: "600",
            marginBottom: "15px",
            fontSize: "14px",
            boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
            transition: "all 0.2s",
          }}
        >
          {isProcessing ? "Pikseller Sayılıyor..." : "Tasarımı Denetle"}
        </button>
      </div>

      <div style={{ flexGrow: 1, overflowY: "auto", paddingBottom: "20px" }}>
        {results.length === 0 && !isProcessing && (
          <p
            style={{
              textAlign: "center",
              color: "#999",
              fontSize: "13px",
              marginTop: "40px",
            }}
          >
            Tasarımı seçip denetlemeyi başlat.
          </p>
        )}

        {results.map((res) => (
          <div
            key={res.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px",
              marginBottom: "8px",
              background: "#fff",
              // Hata varsa kırmızı border, yoksa temiz border
              border:
                res.status === "❌ Hatalı"
                  ? "1px solid #ff5252"
                  : "1px solid #e0e0e0",
              borderLeft:
                res.status === "❌ Hatalı"
                  ? "4px solid #ff5252"
                  : "4px solid #4caf50",
              borderRadius: "6px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ fontSize: "22px" }}>{getIcon(res.class)}</div>

              <div style={{ display: "flex", flexDirection: "column" }}>
                <span
                  style={{
                    fontWeight: "700",
                    fontSize: "14px",
                    color: "#333",
                    textTransform: "capitalize",
                  }}
                >
                  {formatName(res.class)}
                </span>

                <div
                  style={{
                    display: "flex",
                    gap: "6px",
                    marginTop: "4px",
                    alignItems: "center",
                  }}
                >
                  {/* Renk Göstergeleri */}
                  <div
                    style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "2px",
                      background: res.colors.bg,
                      border: "1px solid #ddd",
                    }}
                  />
                  <div
                    style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "2px",
                      background: res.colors.text,
                      border: "1px solid #ddd",
                    }}
                  />

                  {/* Debug için piksel koordinatı */}
                  <span
                    style={{
                      fontSize: "9px",
                      color: "#bbb",
                      marginLeft: "2px",
                    }}
                  >
                    x:{Math.round(res.pixelX)}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ textAlign: "right", minWidth: "90px" }}>
              {res.status === "❌ Hatalı" ? (
                <>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: "800",
                      color: "#d32f2f",
                    }}
                  >
                    Hatalı
                  </div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "#fff",
                      background: "#d32f2f",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      marginTop: "4px",
                      display: "inline-block",
                    }}
                  >
                    {res.message}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: "700",
                    color: "#388e3c",
                  }}
                >
                  Mükemmel
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
