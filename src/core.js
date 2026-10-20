/* Núcleo da ferramenta: leitura de texto de PDF, extração de dados da TRT,
   preenchimento do termo e união dos PDFs. Funciona no navegador e no Node. */
const FT = (() => {
  const COL = " │ "; // separador de colunas largas

  /* ---------- texto do PDF em linhas ---------- */
  async function pdfLines(pdfjsLib, bytes) {
    const task = pdfjsLib.getDocument({ data: bytes.slice(0), isEvalSupported: false });
    const pdf = await task.promise;
    const lines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const items = tc.items
        .filter(it => typeof it.str === "string" && it.str.trim() !== "")
        .map(it => ({
          s: it.str,
          x: it.transform[4],
          y: it.transform[5],
          w: it.width || 0,
          fs: Math.hypot(it.transform[2], it.transform[3]) || it.height || 10,
        }));
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const rows = [];
      for (const it of items) {
        const row = rows.find(r => Math.abs(r.y - it.y) <= Math.max(2, it.fs * 0.35));
        if (row) row.items.push(it); else rows.push({ y: it.y, items: [it] });
      }
      rows.sort((a, b) => b.y - a.y);
      for (const r of rows) {
        r.items.sort((a, b) => a.x - b.x);
        let out = "", end = null;
        for (const it of r.items) {
          if (end !== null) {
            const gap = it.x - end;
            if (gap > it.fs * 1.6) out += COL;
            else if (gap > it.fs * 0.12 && !/\s$/.test(out) && !/^\s/.test(it.s)) out += " ";
          }
          out += it.s;
          end = it.x + it.w;
        }
        out = out.replace(/[ \t]+/g, " ").trim();
        if (out) lines.push(out);
      }
    }
    if (pdf.destroy) await pdf.destroy();
    return lines;
  }

  /* ---------- extração ---------- */
  const NAME_LABELS = [
    { re: /\bcontratante\b/i, score: 10, src: "Contratante" },
    { re: /\bpropriet[áa]ri[oa]\b/i, score: 9, src: "Proprietário" },
    { re: /\btitular\b(?:\s+da\s+(?:uc|unidade(?:\s+consumidora)?|conta|instala[çc][ãa]o))?/i, score: 9, src: "Titular" },
    { re: /\bsolicitante\b/i, score: 8, src: "Solicitante" },
    { re: /\boutorgante\b/i, score: 8, src: "Outorgante" },
    { re: /\bcliente\b/i, score: 7, src: "Cliente" },
    { re: /\bconsumidor\b(?!a)/i, score: 6, src: "Consumidor" },
    { re: /\braz[ãa]o\s+social\b/i, score: 4, src: "Razão social" },
    { re: /\bnome(?:\s+completo)?\b/i, score: 3, src: "Nome" },
    { re: /\brespons[áa]vel\s+t[ée]cnico\b/i, score: 2, src: "Responsável técnico", rt: true },
  ];
  const RT_CONTEXT = /respons[áa]vel\s+t[ée]cnico|profissional|t[ée]cnico\s+respons|engenheir|registro\s+(?:no\s+)?(?:crt|cft|crea)|outorgad/i;
  const NAME_PREFIX = /^[\s:.\-–—│|=]*(?:\(?\s*(?:nome\s*\/\s*raz[ãa]o\s+social|nome\s+completo|nome|raz[ãa]o\s+social)\s*\)?)?[\s:.\-–—│|=]*/i;
  const NAME_CUT = /(?:\s│\s|[,;|()]|\s[-–—]\s|\s+(?:CPF\s*\/\s*CNPJ|CPF|CNPJ|RG|R\.G\.|Inscri[çc][ãa]o|Endere[çc]o|Logradouro|Telefone|Tel\.|Celular|E-?mail|Registro|Tipo|Bairro|Cidade|Munic[ií]pio|CEP|Contrato|Valor|Data|Nacionalidade|Estado\s+civil|Profiss[ãa]o|portador[a]?|inscrit[oa]|residente|domiciliad[oa]|brasileir[oa]|N[ºo°]\s*:))/i;
  const NAME_REJECT = /contratante|propriet[áa]ri|titular|outorg|solicitante|mesm[oa]|idem|pessoa\s+(?:f[íi]sica|jur[íi]dica)|dados|endere|cpf|cnpj|unidade|consumidor|respons[áa]vel|t[ée]cnic|n[ãa]o\s+informad|assinatura|termo|atividade|servi[çc]o|obra|celesc|distribui/i;

  function cleanName(v) {
    v = v.replace(NAME_PREFIX, "");
    const cut = v.search(NAME_CUT);
    if (cut >= 0) v = v.slice(0, cut);
    v = v.replace(/[\s:.\-–—]+$/, "").replace(/\s+/g, " ").trim();
    return v;
  }
  function validName(v) {
    if (!v || v.length < 5 || v.length > 90) return false;
    if (/\d/.test(v)) return false;
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ'’´`.&\s-]+$/.test(v)) return false;
    if (v.split(" ").filter(w => /[A-Za-zÀ-ÿ]{2,}/.test(w)).length < 2) return false;
    if (NAME_REJECT.test(v)) return false;
    return true;
  }

  const UC_LABELS = [
    { re: /\bunidade\s+consumidora\b(?:\s*\(\s*u\.?\s?c\.?\s*\))?/i, score: 10, src: "Unidade consumidora" },
    { re: /\bU\.?\s?C\.?(?![A-Za-zÀ-ÿ])/, score: 9, src: "UC" },
    { re: /\bidentifica[çc][ãa]o\s+da\s+unidade\b/i, score: 7, src: "Identificação da unidade" },
    { re: /\bc[óo]digo\s+(?:do\s+cliente|da\s+instala[çc][ãa]o|da\s+unidade|da\s+uc)\b/i, score: 6, src: "Código" },
    { re: /\bn[ºo°.]*\s*(?:da\s+)?instala[çc][ãa]o\b/i, score: 6, src: "Nº da instalação" },
    { re: /\bconta\s+contrato\b/i, score: 5, src: "Conta contrato" },
  ];
  const UC_PREFIX = /^[\s:.\-–—│|=()]*(?:(?:n[ºo°.]*|n[uú]mero|num\.?|c[óo]d(?:igo)?\.?)\s*(?:da\s+|de\s+)?(?:uc)?[\s:.\-–—│|=()]*)*/i;
  const NOT_UC = [
    /^\d{3}\.\d{3}\.\d{3}-\d{2}/, // CPF
    /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/, // CNPJ
    /^\d{5}-\d{3}\b/, // CEP
    /^\d{1,2}\/\d{1,2}\/\d{2,4}/, // data
    /^\d+[.,]\d+\s*k?W/i, // potência
  ];
  function ucFrom(rest) {
    rest = rest.replace(/\s│\s/g, " ").replace(UC_PREFIX, "");
    const m = rest.match(/^\s*(\d[\d.\-\/ ]{2,22}\d)/);
    if (!m) return null;
    const raw = m[1].trim();
    if (NOT_UC.some(r => r.test(raw))) return null;
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 4 || digits.length > 15) return null;
    return digits;
  }

  function addCand(list, value, score, src, from) {
    const key = value.toLocaleUpperCase("pt-BR");
    const ex = list.find(c => c.key === key);
    if (ex) { if (score > ex.score) { ex.score = score; ex.src = src; } return; }
    list.push({ key, value, score, src, from, order: list.length });
  }
  const rank = list => list.sort((a, b) => b.score - a.score || a.order - b.order);

  function extract(lines, from = "TRT", bias = 0) {
    const names = [], ucs = [], rtNames = [];
    lines.forEach((line, i) => {
      const next = lines[i + 1] || "";
      const ctx = (lines[i - 1] || "") + " " + line;
      // nomes
      for (const L of NAME_LABELS) {
        const m = line.match(L.re);
        if (!m) continue;
        let v = cleanName(line.slice(m.index + m[0].length));
        if (!validName(v) && next) {
          const n2 = cleanName(next);
          if (validName(n2) && !/:/.test(next.slice(0, 25))) v = n2;
        }
        if (!validName(v)) continue;
        const isRT = L.rt || RT_CONTEXT.test(line) || (L.score <= 3 && RT_CONTEXT.test(ctx));
        if (isRT) addCand(rtNames, v, L.score, "Responsável técnico", from);
        else addCand(names, v, L.score + bias, L.src, from);
        break;
      }
      // UC
      for (const L of UC_LABELS) {
        const re = new RegExp(L.re.source, L.re.flags.includes("g") ? L.re.flags : L.re.flags + "g");
        let m;
        while ((m = re.exec(line))) {
          let v = ucFrom(line.slice(m.index + m[0].length));
          if (!v && line.slice(m.index + m[0].length).replace(/[\s:.\-–—│|=()nºo°]/gi, "") === "") v = ucFrom(next);
          if (v) addCand(ucs, v, L.score + bias, L.src, from);
        }
      }
    });
    // extras
    const text = lines.join("\n");
    const pot = [];
    for (const m of text.matchAll(/(\d{1,3}(?:[.,]\d{1,3})?)\s*(kWp|kW)\b/gi)) {
      const val = parseFloat(m[1].replace(",", "."));
      const txt = m[1] + " " + m[2];
      if (val > 0 && val < 1000 && !pot.some(p => p.txt === txt)) pot.push({ val, txt });
    }
    const trt = (text.match(/\bTRT\b[^\n\d]{0,25}?([A-Z]{0,5}\d[\dA-Z\-\/.]{5,24})/) || [])[1] || "";
    const cpf = (text.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/) || [])[0] || "";
    return { names: rank(names), ucs: rank(ucs), rtNames: rank(rtNames), potencias: pot, trt, cpf };
  }

  /* ---------- termo preenchido ---------- */
  // Posições medidas no modelo Celesc (pontos, a partir do topo da página A4).
  const FIELDS = {
    uc:   { x: 287, top: 582.96, ideal: 86,  max: 222 },
    nome: { x: 123, top: 665.76, ideal: 194, max: 386 },
  };

  function winAnsiSafe(font, s) {
    let out = "";
    for (const ch of (s || "").normalize("NFC")) {
      try { font.encodeText(ch); out += ch; }
      catch { const b = ch.normalize("NFD").replace(/[̀-ͯ]/g, ""); try { font.encodeText(b); out += b; } catch { /* ignora */ } }
    }
    return out;
  }

  function drawField(page, font, rgb, text, f) {
    if (!text) return;
    const H = page.getHeight();
    let size = 12;
    const w = s => font.widthOfTextAtSize(text, s);
    while (w(size) > f.ideal && size > 10) size -= 0.25;
    while (w(size) > f.max && size > 6) size -= 0.25;
    page.drawText(text, { x: f.x, y: H - f.top + 1.6, size, font, color: rgb(0.05, 0.07, 0.14) });
  }

  async function buildTermo(PDFLib, templateBytes, data) {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.load(templateBytes);
    const page = doc.getPages()[0];
    const font = await doc.embedFont(StandardFonts.TimesRoman);
    drawField(page, font, rgb, winAnsiSafe(font, (data.uc || "").trim()), FIELDS.uc);
    drawField(page, font, rgb, winAnsiSafe(font, (data.nome || "").trim()), FIELDS.nome);
    return doc.save();
  }

  /* ---------- união ---------- */
  // parts: [{kind:"pdf", bytes}, {kind:"jpg"|"png", bytes}]
  async function merge(PDFLib, parts, meta = {}) {
    const { PDFDocument } = PDFLib;
    const out = await PDFDocument.create();
    const A4 = [595.28, 841.89];
    for (const part of parts) {
      if (part.kind === "pdf") {
        const src = await PDFDocument.load(part.bytes, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach(p => out.addPage(p));
      } else {
        const img = part.kind === "png" ? await out.embedPng(part.bytes) : await out.embedJpg(part.bytes);
        const land = img.width > img.height;
        const [pw, ph] = land ? [A4[1], A4[0]] : A4;
        const m = 24;
        const sc = Math.min((pw - 2 * m) / img.width, (ph - 2 * m) / img.height);
        const w = img.width * sc, h = img.height * sc;
        const page = out.addPage([pw, ph]);
        page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
      }
    }
    if (meta.title) out.setTitle(meta.title);
    out.setCreator("Termo de Aceite Fast Track");
    out.setProducer("pdf-lib");
    out.setCreationDate(new Date());
    return out.save();
  }

  function fileName(uc, nome) {
    const slug = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
    const parts = ["Termo-FastTrack"];
    if (uc) parts.push("UC-" + slug(uc));
    if (nome) parts.push(slug(nome).toUpperCase());
    return parts.join("_") + ".pdf";
  }

  return { pdfLines, extract, buildTermo, merge, fileName, FIELDS };
})();
if (typeof module !== "undefined") module.exports = FT;
