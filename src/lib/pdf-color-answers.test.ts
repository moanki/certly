import { describe, expect, it } from "vitest";
import { extractColoredAnswerHints, extractColoredAnswerHintsByPage, inferColoredAnswerHints, textIntersectsHighlight } from "@/lib/pdf-color-answers";

describe("colored PDF answer detection", () => {
  it("maps option text rendered in a different color to each question", () => {
    const black: [number, number, number] = [0, 0, 0];
    const red: [number, number, number] = [220, 35, 45];
    const green: [number, number, number] = [20, 145, 75];

    expect(inferColoredAnswerHints([
      { text: "1. Select the backup component", color: black },
      { text: "A. UPS", color: red },
      { text: "B. Chiller", color: black },
      { text: "C. ATS", color: red },
      { text: "2. True or false", color: black },
      { text: "A. True", color: green },
      { text: "B. False", color: black },
    ])).toEqual([["A", "C"], ["A"]]);
  });

  it("detects colored option text when its label is a separate black run", () => {
    expect(inferColoredAnswerHints([
      { text: "A. ", color: [0, 0, 0] },
      { text: "First option", color: [0, 0, 0] },
      { text: "B. ", color: [0, 0, 0] },
      { text: "Correct option", color: [0, 90, 210] },
    ])).toEqual([["B"]]);
  });

  it("ignores decorative color applied only to option labels", () => {
    expect(inferColoredAnswerHints([
      { text: "A. ", color: [120, 190, 20] },
      { text: "Wrong option", color: [0, 0, 0] },
      { text: "B. ", color: [120, 190, 20] },
      { text: "Correct option", color: [240, 20, 20] },
      { text: "C. ", color: [120, 190, 20] },
      { text: "Wrong option", color: [0, 0, 0] },
    ])).toEqual([["B"]]);
  });

  it("does not treat near-black body text as an answer color", () => {
    expect(inferColoredAnswerHints([
      { text: "Question", color: [50, 50, 50] },
      { text: "A. False", color: [0, 0, 0] },
      { text: "B. True", color: [255, 0, 0] },
    ], [50, 50, 50])).toEqual([["B"]]);
  });

  it("matches positioned PDF text against highlight annotations", () => {
    expect(textIntersectsHighlight([1, 0, 0, 1, 100, 200], 80, 12, [[95, 197, 185, 214]])).toBe(true);
    expect(textIntersectsHighlight([1, 0, 0, 1, 100, 200], 80, 12, [[300, 300, 350, 320]])).toBe(false);
    expect(textIntersectsHighlight([1, 0, 0, 1, 100, 200], 80, 12, [[178, 197, 181, 214]])).toBe(false);
  });

  it("does not mistake decimal option text for a new numbered question", () => {
    expect(inferColoredAnswerHints([
      { text: "A. First", color: [0, 0, 0] },
      { text: "B. ", color: [0, 0, 0] },
      { text: "2.35", color: [230, 20, 20] },
    ])).toEqual([["B"]]);
  });

  it("handles PowerPoint PDFs that split a label from its punctuation", () => {
    expect(inferColoredAnswerHints([
      { text: "A", color: [0, 0, 0] },
      { text: ".", color: [0, 0, 0] },
      { text: "8", color: [0, 0, 0] },
      { text: "B", color: [0, 0, 0] },
      { text: ".", color: [0, 0, 0] },
      { text: "10", color: [0, 0, 0] },
      { text: "C", color: [255, 0, 0] },
      { text: ".", color: [255, 0, 0] },
      { text: "16", color: [255, 0, 0] },
      { text: "D", color: [0, 0, 0] },
      { text: ".", color: [0, 0, 0] },
      { text: "20", color: [0, 0, 0] },
    ])).toEqual([["C"]]);
  });

  it("ignores isolated A-dot text in a question body", () => {
    expect(inferColoredAnswerHints([
      { text: "A", color: [0, 0, 0] },
      { text: ".", color: [0, 0, 0] },
      { text: "single cabinet supports the load", color: [0, 0, 0] },
      { text: "A.", color: [0, 0, 0] },
      { text: "True", color: [255, 0, 0] },
      { text: "B.", color: [0, 0, 0] },
      { text: "False", color: [0, 0, 0] },
    ])).toEqual([["A"]]);
  });

  it("reads color changes from an actual PDF operator stream", async () => {
    const pdf = createPdf(`BT
/F1 12 Tf
72 720 Td
(1. Which option is correct?) Tj
0 -20 Td
(A. First option) Tj
0 -20 Td
1 0 0 rg
(B. Correct option) Tj
ET`);

    await expect(extractColoredAnswerHints(pdf)).resolves.toEqual([["B"]]);
  });

  it("keeps answer groups aligned to their source pages", async () => {
    const pdf = createMultiPagePdf([
      "BT /F1 12 Tf 72 720 Td (Cover page) Tj ET",
      "BT /F1 12 Tf 72 720 Td (1. Pick one) Tj 0 -20 Td (A. Wrong) Tj 0 -20 Td 1 0 0 rg (B. Right) Tj ET",
    ]);

    await expect(extractColoredAnswerHintsByPage(pdf)).resolves.toEqual([[], [["B"]]]);
  });
});

function createPdf(content: string) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(output));
}

function createMultiPagePdf(contents: string[]) {
  const pageObjectIds = contents.map((_, index) => 3 + index);
  const contentObjectIds = contents.map((_, index) => 3 + contents.length + index);
  const fontObjectId = 3 + contents.length * 2;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${contents.length} >>`,
    ...contents.map((_, index) => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectIds[index]} 0 R >>`),
    ...contents.map((content) => `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(output));
}
