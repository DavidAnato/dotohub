import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const NAVY: [number, number, number] = [0, 52, 98];

async function settle(el: HTMLElement) {
  if (document.fonts?.ready) await document.fonts.ready;
  const imgs = Array.from(el.querySelectorAll("img"));
  await Promise.all(imgs.map((img) => img.decode?.().catch(() => undefined)));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function captureFace(el: HTMLElement): Promise<string> {
  await settle(el);
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    width,
    height,
    windowWidth: Math.max(width, document.documentElement.clientWidth),
    windowHeight: Math.max(height, document.documentElement.clientHeight),
    onclone: (_doc, cloned) => {
      cloned.style.position = "absolute";
      cloned.style.left = "0";
      cloned.style.top = "0";
      cloned.style.transform = "none";
      cloned.style.margin = "0";
    },
  });
  return canvas.toDataURL("image/png");
}

/** Deux pages A4, une face par page, même rendu que l'aperçu. */
export async function buildCardPdf(front: HTMLElement, back: HTMLElement): Promise<Blob> {
  const [frontImg, backImg] = await Promise.all([captureFace(front), captureFace(back)]);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  pdf.setProperties({ title: "DotoCard", subject: "Carte d'accès santé" });
  const pageW = pdf.internal.pageSize.getWidth();
  const cardW = 160;
  const cardH = 100;
  const x = (pageW - cardW) / 2;

  const paint = (label: string, img: string) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(...NAVY);
    pdf.text(label, pageW / 2, 22, { align: "center" });
    pdf.addImage(img, "PNG", x, 30, cardW, cardH);
  };

  paint("Recto", frontImg);
  pdf.addPage();
  paint("Verso", backImg);
  return pdf.output("blob");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2500);
}

export function printBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.title = "Impression de la DotoCard";
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.src = url;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    URL.revokeObjectURL(url);
    iframe.remove();
  };
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    win.focus();
    win.print();
    win.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(cleanup, 60_000);
  };
  document.body.appendChild(iframe);
}
