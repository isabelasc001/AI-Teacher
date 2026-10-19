import type { LessonRecord } from "@/lib/lessons";
import type { LessonQuestion } from "@/lib/questions";
import type { OutputFormat } from "@/lib/workspace";

type DownloadFile = {
  body: Uint8Array;
  contentType: string;
  fileName: string;
};

const encoder = new TextEncoder();

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function safeSlug(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return slug || "aula";
}

function wrapTextLines(lines: string[]) {
  return lines.flatMap((line) => {
    if (line.length <= 92) return [line];
    const words = line.split(/\s+/);
    const wrapped: string[] = [];
    let current = "";
    for (const word of words) {
      if (current && `${current} ${word}`.length > 92) {
        wrapped.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) wrapped.push(current);
    return wrapped.length > 0 ? wrapped : [""];
  });
}

function textLines(lesson: LessonRecord) {
  const { content, input } = lesson;
  return wrapTextLines([
    content.title,
    `Plano ${lesson.planCode === "full" ? "Full" : "Fast"} · ${input.grade} · ${input.duration}`,
    "",
    "RESUMO",
    content.summary,
    "",
    "OBJETIVOS DE APRENDIZAGEM",
    ...content.objectives.map((objective, index) => `${index + 1}. ${objective}`),
    "",
    "SEQUÊNCIA DIDÁTICA",
    ...content.activities.flatMap((activity, index) => [
      `${String(index + 1).padStart(2, "0")} · ${activity.title} (${activity.duration})`,
      activity.instructions,
      `Evidência: ${activity.evidence}`,
      "",
    ]),
    "MATERIAIS",
    ...content.materials.map((material) => `• ${material}`),
    "",
    "AVALIAÇÃO",
    content.assessment,
    "",
    "GABARITO / CRITÉRIOS",
    ...content.answerKey.map((answer, index) => `${index + 1}. ${answer}`),
    "",
    "RECUPERAÇÃO",
    content.recovery,
    "",
    "ADAPTAÇÕES",
    ...content.adaptations.map((adaptation) => `• ${adaptation}`),
    "",
    "NOTAS DO PROFESSOR",
    ...content.teacherNotes.map((note) => `• ${note}`),
    "",
    `RASTREABILIDADE: ${content.traceability}`,
  ]);
}

const winAnsiCharacters: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

function pdfText(value: string) {
  const encoded = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0x3f;
    const byte = codePoint >= 0x20 && codePoint <= 0x7e
      ? codePoint
      : codePoint >= 0xa0 && codePoint <= 0xff
        ? codePoint
        : winAnsiCharacters[codePoint] ?? 0x3f;
    return byte.toString(16).padStart(2, "0");
  }).join("");

  return `<${encoded}>`;
}

function concatBytes(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function createPdfFromLines(lines: string[], title: string) {
  const pageSize = 31;
  const pages = Array.from({ length: Math.max(1, Math.ceil(lines.length / pageSize)) }, (_, index) => lines.slice(index * pageSize, (index + 1) * pageSize));
  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];
  const pagesObjectId = 2;
  const fontObjectId = 3;

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

  pages.forEach((page, pageIndex) => {
    const pageObjectId = 4 + pageIndex * 2;
    const contentObjectId = pageObjectId + 1;
    pageObjectIds.push(pageObjectId);
    contentObjectIds.push(contentObjectId);
    const commands = [
      "BT",
      "/F1 16 Tf",
      "50 780 Td",
      `${pdfText(title)} Tj`,
      "/F1 9 Tf",
      "0 -22 Td",
      ...page.flatMap((line, index) => {
        if (pageIndex === 0 && index === 0) return [];
        const size = line === line.toUpperCase() && line.length < 42 ? 10 : 9;
        return [`/F1 ${size} Tf`, `${pdfText(line)} Tj`, "0 -16 Td"];
      }),
      "ET",
    ].join("\n");
    objects[pageObjectId] = `<< /Type /Page /Parent ${pagesObjectId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId] = `<< /Length ${encoder.encode(commands).length} >>\nstream\n${commands}\nendstream`;
  });

  objects[pagesObjectId] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;

  const chunks: Uint8Array[] = [encoder.encode("%PDF-1.4\n")];
  const offsets: number[] = [0];
  let offset = chunks[0].length;
  for (let id = 1; id < objects.length; id += 1) {
    if (!objects[id]) continue;
    const bytes = encoder.encode(`${id} 0 obj\n${objects[id]}\nendobj\n`);
    offsets[id] = offset;
    chunks.push(bytes);
    offset += bytes.length;
  }
  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    xref += `${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(encoder.encode(xref));
  return concatBytes(chunks);
}

function createPdf(lesson: LessonRecord) {
  return createPdfFromLines(textLines(lesson), lesson.content.title);
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU16(value: number) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function writeU32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

type ZipEntry = { name: string; data: Uint8Array };

function createZip(entries: ZipEntry[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const checksum = crc32(entry.data);
    const localHeader = concatBytes([
      writeU32(0x04034b50), writeU16(20), writeU16(0x800), writeU16(0),
      writeU16(0), writeU16(0), writeU32(checksum), writeU32(entry.data.length),
      writeU32(entry.data.length), writeU16(name.length), writeU16(0), name,
    ]);
    localParts.push(localHeader, entry.data);

    const centralHeader = concatBytes([
      writeU32(0x02014b50), writeU16(20), writeU16(20), writeU16(0x800), writeU16(0),
      writeU16(0), writeU16(0), writeU32(checksum), writeU32(entry.data.length),
      writeU32(entry.data.length), writeU16(name.length), writeU16(0), writeU16(0),
      writeU16(0), writeU16(0), writeU32(0), writeU32(localOffset), name,
    ]);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + entry.data.length;
  }

  const local = concatBytes(localParts);
  const central = concatBytes(centralParts);
  const end = concatBytes([
    writeU32(0x06054b50), writeU16(0), writeU16(0), writeU16(entries.length),
    writeU16(entries.length), writeU32(central.length), writeU32(local.length), writeU16(0),
  ]);
  return concatBytes([local, central, end]);
}

function docxParagraph(text: string, style?: string) {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

function createDocxFromLines(lines: string[], title: string) {
  const paragraphs = lines.map((line, index) => {
    if (!line) return "<w:p/>";
    if (index === 0) return docxParagraph(line, "Title");
    if (line === line.toUpperCase() && line.length < 42) return docxParagraph(line, "Heading1");
    return docxParagraph(line);
  }).join("");
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;
  return createZip([
    { name: "[Content_Types].xml", data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`) },
    { name: "_rels/.rels", data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`) },
    { name: "word/document.xml", data: encoder.encode(documentXml) },
    { name: "docProps/core.xml", data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlEscape(title)}</dc:title><dc:creator>Gerador de Aulas</dc:creator></cp:coreProperties>`) },
    { name: "docProps/app.xml", data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Gerador de Aulas</Application></Properties>`) },
  ]);
}

function createDocx(lesson: LessonRecord) {
  return createDocxFromLines(textLines(lesson), lesson.content.title);
}

function slideTextShape(id: number, text: string, x: number, y: number, width: number, height: number, fontSize: number, bold = false) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="pt-BR" sz="${fontSize * 100}"${bold ? " b=\"1\"" : ""}/><a:t>${xmlEscape(text)}</a:t></a:r><a:endParaRPr lang="pt-BR"/></a:p></p:txBody></p:sp>`;
}

function createPptx(lesson: LessonRecord) {
  const lines = textLines(lesson).filter(Boolean).slice(0, 20);
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${slideTextShape(2, lesson.content.title, 700000, 500000, 8000000, 900000, 26, true)}${lines.slice(1).map((line, index) => slideTextShape(index + 3, line, 700000, 1500000 + index * 320000, 8000000, 280000, 14)).join("")}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const presentationXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
  const masterXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId2"/></p:sldLayoutIdLst><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/></p:sldMaster>`;
  const layoutXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="titleAndContent" preserve="1"><p:cSld name="Title and Content"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  const themeXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Gerador de Aulas"><a:themeElements><a:clrScheme name="Warm"><a:dk1><a:sysClr val="000000" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="FFFFFF" lastClr="FFFFFF"/></a:lt1><a:accent1><a:srgbClr val="B85C47"/></a:accent1><a:accent2><a:srgbClr val="D9823B"/></a:accent2><a:accent3><a:srgbClr val="5F7F67"/></a:accent3><a:accent4><a:srgbClr val="806158"/></a:accent4><a:accent5><a:srgbClr val="E9D4CB"/></a:accent5><a:accent6><a:srgbClr val="CFC7BF"/></a:accent6><a:hlink><a:srgbClr val="B85C47"/></a:hlink><a:folHlink><a:srgbClr val="9A4F3D"/></a:folHlink></a:clrScheme><a:fontScheme name="Warm"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme><a:fmtScheme name="Warm"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme></a:themeElements></a:theme>`;
  return createZip([
    { name: "[Content_Types].xml", data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>`) },
    { name: "_rels/.rels", data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`) },
    { name: "ppt/presentation.xml", data: encoder.encode(presentationXml) },
    { name: "ppt/_rels/presentation.xml.rels", data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`) },
    { name: "ppt/slides/slide1.xml", data: encoder.encode(slideXml) },
    { name: "ppt/slides/_rels/slide1.xml.rels", data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`) },
    { name: "ppt/slideMasters/slideMaster1.xml", data: encoder.encode(masterXml) },
    { name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`) },
    { name: "ppt/slideLayouts/slideLayout1.xml", data: encoder.encode(layoutXml) },
    { name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`) },
    { name: "ppt/theme/theme1.xml", data: encoder.encode(themeXml) },
  ]);
}

export function createLessonDownload(lesson: LessonRecord, format: OutputFormat): DownloadFile {
  const baseName = safeSlug(lesson.content.title);
  if (format === "pdf") {
    return { body: createPdf(lesson), contentType: "application/pdf", fileName: `${baseName}.pdf` };
  }
  if (format === "docx") {
    return { body: createDocx(lesson), contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fileName: `${baseName}.docx` };
  }
  return { body: createPptx(lesson), contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", fileName: `${baseName}.pptx` };
}

export type QuestionDocumentKind = "prova" | "atividade-complementar";
export type QuestionDocumentFormat = "pdf" | "docx";

export type SelectedQuestion = {
  question: LessonQuestion;
  sourceTopic: string;
};

export function createQuestionDocumentDownload(
  kind: QuestionDocumentKind,
  format: QuestionDocumentFormat,
  selectedQuestions: SelectedQuestion[],
): DownloadFile {
  const title = kind === "prova" ? "Prova" : "Atividade complementar";
  const topics = [...new Set(selectedQuestions.map(({ sourceTopic }) => sourceTopic.trim()).filter(Boolean))];
  const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date());
  const answerLines = kind === "prova" ? 4 : 3;
  const lines = wrapTextLines([
    title,
    ...(topics.length > 0 ? [`Tema${topics.length === 1 ? "" : "s"}: ${topics.join(" · ")}`] : []),
    `Questões selecionadas: ${selectedQuestions.length}`,
    "",
    "Nome: _________________________________________________________________",
    "Turma: ______________________________    Data: ____/____/________",
    ...(kind === "prova" ? ["Valor: ______________________________    Nota: _____________________"] : []),
    "",
    "ORIENTAÇÕES",
    kind === "prova"
      ? "Leia cada questão com atenção e responda com clareza. Use o espaço indicado."
      : "Responda às questões e explique seu raciocínio sempre que possível.",
    `Material gerado em ${date}.`,
    "",
    "QUESTÕES",
    ...selectedQuestions.flatMap(({ question }, index) => [
      `${index + 1}. ${question.prompt}`,
      ...Array.from({ length: answerLines }, () => "________________________________________________________________________"),
      "",
    ]),
  ]);
  const baseName = safeSlug(`${kind}-${topics.slice(0, 2).join("-") || "banco-de-questoes"}`)
    .slice(0, 96)
    .replace(/-+$/, "");

  if (format === "pdf") {
    return {
      body: createPdfFromLines(lines, title),
      contentType: "application/pdf",
      fileName: `${baseName}.pdf`,
    };
  }

  return {
    body: createDocxFromLines(lines, title),
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    fileName: `${baseName}.docx`,
  };
}
