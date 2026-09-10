import { describe, expect, it } from "vitest";
import { extractLooseQuestionsFromText } from "@/lib/importers";

describe("PDF question extraction", () => {
  it("parses multiline questions and explanations", () => {
    const questions = extractLooseQuestionsFromText(`
      1. Which cooling method is most efficient?
      A. Direct expansion
      B. Free cooling
      C. Electric heating
      Answer: B
      Explanation: Free cooling reduces compressor use
      when ambient conditions permit.
    `);

    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      question: "Which cooling method is most efficient?",
      options: ["Direct expansion", "Free cooling", "Electric heating"],
      answer: "B",
      explanation: "Free cooling reduces compressor use when ambient conditions permit.",
      type: "single",
    });
  });

  it("parses flattened PDF text and compact multiple answers", () => {
    const questions = extractLooseQuestionsFromText(
      "Question 12: Select the redundant power components. A. UPS B. ATS C. Generator D. Humidifier Correct Answer: AC Explanation: UPS and generator provide backup power.",
    );

    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      question: "Select the redundant power components.",
      options: ["UPS", "ATS", "Generator", "Humidifier"],
      answer: "A,C",
      type: "multiple",
    });
  });

  it("normalizes written multiple answers", () => {
    const [question] = extractLooseQuestionsFromText(`
      2) Select two valid statements.
      A) First statement
      B) Second statement
      C) Third statement
      Answer: A and C
      Explanation: The first and third statements are valid.
    `);

    expect(question.answer).toBe("A,C");
    expect(question.type).toBe("multiple");
  });

  it("creates true and false options when a PDF omits them", () => {
    const [question] = extractLooseQuestionsFromText(`
      3. A UPS can provide temporary backup power.
      Answer: True
      Explanation: The battery carries the load during an outage.
    `);

    expect(question).toMatchObject({
      options: ["True", "False"],
      answer: "A",
      type: "true_false",
    });
  });

  it("uses color-derived answers when the PDF has no answer line", () => {
    const [question] = extractLooseQuestionsFromText(`
      8. Which component is correct?
      A. UPS
      B. Chiller
      C. ATS
    `, [["A", "C"]]);

    expect(question.answer).toBe("A,C");
    expect(question.type).toBe("multiple");
  });

  it("ignores numbered page furniture without a complete question", () => {
    const questions = extractLooseQuestionsFromText(`
      2026. HCIP Datacenter Facility Deployment Practice Material
      4. Which device transfers load between power sources?
      A. ATS
      B. Chiller
      Answer: A
      Explanation: An ATS switches between available sources.
      17. Copyright and distribution notice for this document
    `);

    expect(questions).toHaveLength(1);
    expect(questions[0].question).toContain("Which device");
  });

  it("does not let numbered page furniture shift color-derived answers", () => {
    const [question] = extractLooseQuestionsFromText(`
      2026. HCIP Datacenter Facility Deployment Practice Material
      9. Which device is marked as correct?
      A. UPS
      B. Chiller
    `, [["B"]]);

    expect(question.answer).toBe("B");
  });

  it("removes generated page markers and recurring certification headers", () => {
    const [question] = extractLooseQuestionsFromText(`
      10. Which option is correct?
      A. First
      B. Second
      -- 2 of 24 --
      Huawei HCIP-DCF Sept 2019
      2
    `, [["B"]]);

    expect(question.options).toEqual(["First", "Second"]);
  });

  it("does not treat the F in a T or F marker as an answer option", () => {
    const [question] = extractLooseQuestionsFromText(`
      14. (T or F) A stable load lets idle modules enter hibernation.
      A. True
      B. False
    `, [["A"]]);

    expect(question).toMatchObject({
      question: "(T or F) A stable load lets idle modules enter hibernation.",
      options: ["True", "False"],
      answer: "A",
      type: "true_false",
    });
  });

  it("keeps multiline multiple-answer wording in the question", () => {
    const [question] = extractLooseQuestionsFromText(`
      Q5. What are the supported functions? (Multiple
      answers)
      A. First
      B. Second
      C. Third
    `, [["A", "B", "C"]]);

    expect(question).toMatchObject({
      question: "What are the supported functions? (Multiple answers)",
      answer: "A,B,C",
    });
  });
});
