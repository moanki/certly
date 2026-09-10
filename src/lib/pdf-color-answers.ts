import { getDocument, OPS, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";

type ColorRun = { text: string; color: [number, number, number] };

export async function extractColoredAnswerHints(bytes: Uint8Array) {
  const loadingTask = getDocument({ data: bytes.slice(), verbosity: VerbosityLevel.ERRORS });
  const document = await loadingTask.promise;
  const runs: ColorRun[] = [];
  let color: ColorRun["color"] = [0, 0, 0];
  const stack: ColorRun["color"][] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      color = [0, 0, 0];
      stack.length = 0;
      const page = await document.getPage(pageNumber);
      const operators = await page.getOperatorList();

      for (let index = 0; index < operators.fnArray.length; index += 1) {
        const operation = operators.fnArray[index];
        const args = operators.argsArray[index] ?? [];
        if (operation === OPS.save) stack.push([...color]);
        else if (operation === OPS.restore) color = stack.pop() ?? [0, 0, 0];
        else if (operation === OPS.setFillRGBColor) color = rgbColor(args);
        else if (operation === OPS.setFillGray) color = grayColor(args);
        else if (operation === OPS.setFillCMYKColor) color = cmykColor(args);
        else {
          const text = textForOperation(operation, args);
          if (text.trim()) runs.push({ text, color: [...color] });
        }
      }
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }

  return inferColoredAnswerHints(runs);
}

export function inferColoredAnswerHints(runs: ColorRun[]) {
  const colorWeights = new Map<string, number>();
  for (const run of runs) {
    const key = run.color.join(",");
    colorWeights.set(key, (colorWeights.get(key) ?? 0) + run.text.replace(/\s/g, "").length);
  }
  const baseColor = parseColor([...colorWeights.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "0,0,0");
  const answers: Array<Set<string>> = [];
  let currentOption = "";

  for (const run of runs) {
    const optionMatch = run.text.match(/^\s*([A-H])\s*[\).:-]/i);
    if (optionMatch) {
      currentOption = optionMatch[1].toUpperCase();
      if (currentOption === "A") answers.push(new Set());
    }
    if (answers.length && currentOption && colorDistance(run.color, baseColor) >= 60) {
      answers[answers.length - 1].add(currentOption);
    }
    if (/^\s*(?:answer|correct answer|explanation)\s*[:.-]/i.test(run.text)) currentOption = "";
  }

  return answers.map((answer) => [...answer]);
}

function textForOperation(operation: number, args: unknown[]) {
  if (operation === OPS.showText || operation === OPS.showSpacedText || operation === OPS.nextLineShowText) {
    return glyphText(args[0]);
  }
  if (operation === OPS.nextLineSetSpacingShowText) return glyphText(args[2]);
  return "";
}

function glyphText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((glyph) => {
    if (typeof glyph === "string") return glyph;
    if (glyph && typeof glyph === "object" && "unicode" in glyph) return String(glyph.unicode ?? "");
    return "";
  }).join("");
}

function colorValues(args: unknown[]) {
  const raw = ArrayBuffer.isView(args[0]) || Array.isArray(args[0]) ? Array.from(args[0] as ArrayLike<number>) : args;
  const values = raw.map(Number);
  return values.some((value) => value > 1) ? values : values.map((value) => value * 255);
}

function rgbColor(args: unknown[]): ColorRun["color"] {
  if (typeof args[0] === "string" && /^#[0-9a-f]{6}$/i.test(args[0])) {
    return [
      Number.parseInt(args[0].slice(1, 3), 16),
      Number.parseInt(args[0].slice(3, 5), 16),
      Number.parseInt(args[0].slice(5, 7), 16),
    ];
  }
  const [red = 0, green = 0, blue = 0] = colorValues(args);
  return [red, green, blue];
}

function grayColor(args: unknown[]): ColorRun["color"] {
  const [gray = 0] = colorValues(args);
  return [gray, gray, gray];
}

function cmykColor(args: unknown[]): ColorRun["color"] {
  const [cyan = 0, magenta = 0, yellow = 0, black = 0] = colorValues(args).map((value) => value / 255);
  return [cyan, magenta, yellow].map((value) => 255 * (1 - Math.min(1, value + black))) as ColorRun["color"];
}

function parseColor(value: string): ColorRun["color"] {
  const [red = 0, green = 0, blue = 0] = value.split(",").map(Number);
  return [red, green, blue];
}

function colorDistance(left: ColorRun["color"], right: ColorRun["color"]) {
  return Math.sqrt(left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0));
}
