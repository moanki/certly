import { describe, expect, it } from "vitest";
import { extractColoredAnswerHints, inferColoredAnswerHints } from "@/lib/pdf-color-answers";

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
