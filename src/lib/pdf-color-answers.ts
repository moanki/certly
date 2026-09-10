type ColorRun = { text: string; color: [number, number, number] };

export async function extractColoredAnswerHints(bytes: Uint8Array) {
  const pages = await extractColoredAnswerHintsByPage(bytes);
  return pages.flat();
}

export async function extractColoredAnswerHintsByPage(bytes: Uint8Array) {
  const canvas = await import("@napi-rs/canvas");
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.DOMMatrix ??= canvas.DOMMatrix;
  globals.ImageData ??= canvas.ImageData;
  globals.Path2D ??= canvas.Path2D;
  const { getDocument, OPS, VerbosityLevel } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({ data: bytes.slice(), verbosity: VerbosityLevel.ERRORS });
  const document = await loadingTask.promise;
  const pageRuns: ColorRun[][] = [];
  const pageHighlightRuns: ColorRun[][] = [];
  let color: ColorRun["color"] = [0, 0, 0];
  const stack: ColorRun["color"][] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const runs: ColorRun[] = [];
      const highlightRuns: ColorRun[] = [];
      pageRuns.push(runs);
      pageHighlightRuns.push(highlightRuns);
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
          const text = textForOperation(operation, args, OPS);
          if (text.trim()) runs.push({ text, color: [...color] });
        }
      }

      const annotations = await page.getAnnotations({ intent: "display" });
      const highlightRects = annotations
        .filter((annotation) => annotation.subtype === "Highlight" || annotation.subtype === "Ink")
        .flatMap((annotation) => annotationRects(annotation as { rect: number[]; quadPoints?: ArrayLike<number> }));
      const textContent = await page.getTextContent();
      for (const item of textContent.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        highlightRuns.push({
          text: item.str,
          color: textIntersectsHighlight(item.transform, item.width, item.height, highlightRects) ? [255, 220, 0] : [0, 0, 0],
        });
      }
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }

  const fontBaseColor = dominantColor(pageRuns.flat());
  const annotationBaseColor = dominantColor(pageHighlightRuns.flat());
  return pageRuns.map((runs, pageIndex) => {
    const fontColorHints = inferColoredAnswerHints(runs, fontBaseColor);
    const annotationHints = inferColoredAnswerHints(pageHighlightRuns[pageIndex], annotationBaseColor);
    return Array.from({ length: Math.max(fontColorHints.length, annotationHints.length) }, (_, index) => [
      ...new Set([...(fontColorHints[index] ?? []), ...(annotationHints[index] ?? [])]),
    ]);
  });
}

function annotationRects(annotation: { rect: number[]; quadPoints?: ArrayLike<number> }) {
  const points = annotation.quadPoints ? Array.from(annotation.quadPoints) : [];
  if (points.length < 8) return [annotation.rect];

  const rectangles: number[][] = [];
  for (let offset = 0; offset + 7 < points.length; offset += 8) {
    const xs = [points[offset], points[offset + 2], points[offset + 4], points[offset + 6]];
    const ys = [points[offset + 1], points[offset + 3], points[offset + 5], points[offset + 7]];
    rectangles.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  }
  return rectangles;
}

export function inferColoredAnswerHints(runs: ColorRun[], baseColor = dominantColor(runs)) {
  const answers: Array<Set<string>> = [];
  const seenOptions: Array<Set<string>> = [];
  let currentOption = "";
  let pendingLabel = "";
  let currentOptionHasText = false;

  for (const run of runs) {
    const text = run.text.trim();
    if (run.text === "\f") {
      currentOption = "";
      pendingLabel = "";
      continue;
    }
    if (/^\s*(?:Q(?:uestion)?\.?\s*)?\d{1,4}\s*[\).:-]\s+/i.test(run.text)) currentOption = "";
    if (/^[A-H]$/i.test(text)) {
      pendingLabel = text.toUpperCase();
      continue;
    }
    const splitLabelMatch = pendingLabel ? text.match(/^[\).:-]\s*(.*)/) : null;
    const optionMatch = run.text.match(/^\s*([A-H])\s*[\).:-]/i);
    let optionText = run.text.trim();
    if (optionMatch) {
      currentOption = optionMatch[1].toUpperCase();
      currentOptionHasText = false;
      if (currentOption === "A") {
        answers.push(new Set());
        seenOptions.push(new Set());
      }
      optionText = run.text.slice(optionMatch[0].length).trim();
      pendingLabel = "";
    } else if (splitLabelMatch) {
      currentOption = pendingLabel;
      currentOptionHasText = false;
      if (currentOption === "A") {
        answers.push(new Set());
        seenOptions.push(new Set());
      }
      optionText = splitLabelMatch[1].trim();
      pendingLabel = "";
    } else {
      pendingLabel = "";
    }
    if (answers.length && currentOption) seenOptions[seenOptions.length - 1].add(currentOption);
    if (answers.length && currentOption && optionText && !currentOptionHasText && colorDistance(run.color, baseColor) >= 120) {
      answers[answers.length - 1].add(currentOption);
    }
    if (currentOption && optionText) currentOptionHasText = true;
    if (/^\s*(?:answer|correct answer|explanation)\s*[:.-]/i.test(run.text)) currentOption = "";
  }

  return answers.flatMap((answer, index) => seenOptions[index].has("A") && seenOptions[index].has("B") ? [[...answer]] : []);
}

function dominantColor(runs: ColorRun[]): ColorRun["color"] {
  const colorWeights = new Map<string, number>();
  for (const run of runs) {
    const key = run.color.join(",");
    colorWeights.set(key, (colorWeights.get(key) ?? 0) + run.text.replace(/\s/g, "").length);
  }
  return parseColor([...colorWeights.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "0,0,0");
}

export function textIntersectsHighlight(transform: number[], width: number, height: number, highlightRects: number[][]) {
  const left = transform[4] ?? 0;
  const baseline = transform[5] ?? 0;
  const right = left + width;
  const bottom = baseline - height * 0.25;
  const top = baseline + height;
  return highlightRects.some(([x1, y1, x2, y2]) => {
    const horizontalOverlap = Math.max(0, Math.min(right, x2) - Math.max(left, x1));
    return horizontalOverlap >= Math.min(8, width * 0.15) && top > y1 && bottom < y2;
  });
}

function textForOperation(operation: number, args: unknown[], ops: Record<string, number>) {
  if (operation === ops.showText || operation === ops.showSpacedText || operation === ops.nextLineShowText) {
    return glyphText(args[0]);
  }
  if (operation === ops.nextLineSetSpacingShowText) return glyphText(args[2]);
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
