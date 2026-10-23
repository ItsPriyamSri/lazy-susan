import { Index } from "./store.js";
import type { AnnotatedSentence, EssayDraft, EssaySentence } from "./types.js";

/**
 * The essay gets the same treatment as the form.
 *
 * A model may draft the paragraph. It may not introduce a number, an employer,
 * an award, or a date that is not already in the index. Sentences it cannot
 * support are struck out and shown, not quietly deleted.
 */

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/**
 * Small cardinals spelled out, because a model will happily write "a team of
 * five" and a digit regex will not catch it. Ordinals are not included: "third
 * year" is a position in a programme, not a quantity to verify.
 */
const WORD_NUMBERS: string[] = [
  "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty",
  "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "thousand",
];

const AS_DIGIT: Record<string, string> = {
  three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  ten: "10", eleven: "11", twelve: "12", thirteen: "13", fourteen: "14",
  fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19",
  twenty: "20", thirty: "30", forty: "40", fifty: "50", sixty: "60",
  seventy: "70", eighty: "80", ninety: "90", hundred: "100", thousand: "1000",
};

export function annotateEssay(
  question: string,
  candidate: EssaySentence[],
  index: Index,
  maxWords: number,
): EssayDraft {
  const facts = index.facts.map((f) => ({ key: f.key, value: f.value }));

  const annotated: AnnotatedSentence[] = candidate.map((s) => {
    const digits = (s.text.match(NUMBER) ?? []).map((n) => n.replace(/,/g, ""));
    const words = (s.text.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => AS_DIGIT[w]);

    if (!s.supports.length) {
      // A sentence with no claim in it is allowed. A sentence with a number and
      // nothing behind it is not.
      if (digits.length) {
        return {
          text: s.text,
          supported: false,
          usedKeys: [],
          reason: `The number ${digits[0]} appears here and nowhere in your folder or your answers.`,
        };
      }
      if (words.length) {
        return {
          text: s.text,
          supported: false,
          usedKeys: [],
          reason: `The number "${words[0]}" appears here and nowhere in your folder or your answers.`,
        };
      }
      return {
        text: s.text,
        supported: true,
        usedKeys: [],
        reason: "No factual claim in this sentence; kept as your own words.",
      };
    }

    const missing = s.supports.filter((k) => index.byKey(k).length === 0);
    if (missing.length) {
      return {
        text: s.text,
        supported: false,
        usedKeys: s.supports,
        reason: `Nothing in your folder or your answers supports this (${missing.join(", ")}).`,
      };
    }

    // A number has to exist in the facts this sentence is actually leaning on.
    // Widening this to the whole namespace let "three years of experience" pass
    // because the year of study happens to be 3, which is a different claim.
    const pool = facts.filter((f) => s.supports.includes(f.key));
    const poolDigits = new Set(pool.flatMap((f) => (f.value.match(NUMBER) ?? []).map((n) => n.replace(/,/g, ""))));
    const poolText = pool.map((f) => f.value.toLowerCase()).join(" ");

    const invented = digits.find((d) => !poolDigits.has(d));
    if (invented) {
      return {
        text: s.text,
        supported: false,
        usedKeys: s.supports,
        reason: `The number ${invented} does not appear in the facts behind this sentence.`,
      };
    }

    const inventedWord = words.find((w) => !poolDigits.has(AS_DIGIT[w]!) && !poolText.includes(w));
    if (inventedWord) {
      return {
        text: s.text,
        supported: false,
        usedKeys: s.supports,
        reason: `The number "${inventedWord}" does not appear in the facts behind this sentence.`,
      };
    }

    return { text: s.text, supported: true, usedKeys: s.supports, reason: "Traced to your facts." };
  });

  const accepted = annotated.filter((a) => a.supported);
  const struck = annotated.filter((a) => !a.supported);
  // Refusal is about the folder having nothing to say, not about a few
  // sentences being struck. A struck sentence still names the facts it leaned on.
  const used = new Set(annotated.flatMap((a) => a.usedKeys));

  let refused: string | undefined;
  let refusedKind: EssayDraft["refusedKind"];
  if (used.size < 3) {
    refusedKind = used.size === 0 ? "no-facts" : "thin";
    refused =
      used.size === 0
        ? "Nothing in your folder or your notes is about this question, so this one is yours to answer."
        : `Only ${used.size} fact${used.size === 1 ? "" : "s"} in your folder relate to this question. A draft from ${used.size} fact${used.size === 1 ? "" : "s"} would be mostly filler, so this box is yours.`;
  }

  const text = accepted
    .map((a) => a.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const words = text ? text.split(/\s+/).length : 0;
  const over = words > maxWords;

  return {
    question,
    accepted,
    struck,
    text: over ? trimToWords(text, maxWords) : text,
    wordCount: Math.min(words, maxWords),
    refused,
    refusedKind,
  };
}

function trimToWords(text: string, max: number): string {
  const words = text.split(/\s+/).slice(0, max);
  return words.join(" ").replace(/[,;:]$/, "") + "…";
}

/** Splits prose into sentences without pretending to be a linguist. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

/** Words that point at a fact without quoting it. */
const KEYWORDS: [RegExp, string][] = [
  [/\bgpa\b|grade point|grades?/i, "education.gpa"],
  [/\byear\b|semester/i, "education.year"],
  [/\b(college|institute|university|institution)\b/i, "education.institution"],
  [/\b(programme|program|course|degree)\b/i, "education.programme"],
  [/\b(salary|stipend|income|compensation)\b/i, "employment.income_annual"],
  [/\b(employer|company|internship)\b/i, "employment.employer"],
  [/\b(referee|recommendation|reference)\b/i, "referee.1.name"],
];

/**
 * Works out which facts a sentence is actually leaning on.
 *
 * Quoting a value is the strong signal, naming the thing is the weak one, and
 * sharing most of a value's long words is the middle one.
 */
export function attributeFacts(
  text: string,
  facts: { key: string; value: string }[],
): { text: string; supports: string[] }[] {
  return splitSentences(text).map((sentence) => {
    const flat = sentence.toLowerCase();
    const supports = new Set<string>();

    for (const f of facts) {
      const v = f.value.toLowerCase().trim();
      if (v.length >= 3 && flat.includes(v)) {
        supports.add(f.key);
        continue;
      }
      // A sentence that is a slice of a longer fact — a line lifted out of the
      // paragraph about you — is still that fact's sentence.
      if (flat.length >= 12 && v.includes(flat)) {
        supports.add(f.key);
        continue;
      }
      // Commas and bullets are punctuation, not part of a word: "Python,
      // TypeScript" has to match a sentence that says "Python and TypeScript".
      const long = v.split(/[^\p{L}\p{N}.+#]+/u).filter((t) => t.length >= 5);
      const shared = long.filter((t) => flat.includes(t));
      if (long.length >= 2 && shared.length / long.length >= 0.6) supports.add(f.key);
    }

    for (const [re, key] of KEYWORDS) {
      if (re.test(sentence) && facts.some((f) => f.key === key)) supports.add(key);
    }

    return { text: sentence, supports: [...supports] };
  });
}

/**
 * The draft you get when no model is running. Short, plain, and entirely made
 * of facts, so the checker has nothing to strike.
 */
/**
 * A paragraph with no model in it.
 *
 * Every sentence is a fact from the folder, joined with the smallest amount of
 * grammar that makes it read like a person. It is not stylish, and it is not
 * meant to be: it is what the app can say when there is no model, and every
 * line of it can be pointed at.
 */
export function composeDraft(facts: { key: string; value: string }[]): string {
  const get = (key: string) => facts.find((f) => f.key === key)?.value;
  const parts: string[] = [];
  const programme = get("education.programme");
  const institution = get("education.institution");
  const year = get("education.year");
  const gpa = get("education.gpa");
  const role = get("employment.role");
  const employer = get("employment.employer");
  const skills = get("skills.list");
  const certifications = get("certifications.list");

  if (programme && institution) {
    parts.push(`I am studying ${programme} at ${institution}${year ? `, in my year ${year}` : ""}.`);
  } else if (programme) {
    parts.push(`I am studying ${programme}.`);
  }
  if (gpa) parts.push(`My cumulative grade point average is ${gpa}.`);
  if (skills) parts.push(`I work with ${skills.split(",").slice(0, 5).map((s) => s.trim()).join(", ")}.`);
  if (certifications) {
    const first = certifications.split(",").slice(0, 2).map((s) => s.trim()).join(" and ");
    parts.push(`I am certified in ${first}.`);
  }
  if (role && employer) parts.push(`I am working as a ${role} at ${employer}.`);
  if (!parts.length) return "";
  return parts.join(" ");
}

/**
 * A question the folder cannot answer, whatever the model writes.
 *
 * "Why do you want to work at this company?" is not a gap in the documents; it
 * is a question about the company, and the company is not in the folder. The
 * honest answer is to leave it to the person, not to pad it with a resume.
 */
const ABOUT_THE_COMPANY = [
  /\b(?:this|our|the)\s+(?:company|employer|organisation|organization|firm|startup|business)\b/i,
  /\bwhat do you know about (?:us|our (?:company|product|team))\b/i,
  /\bwhy\b[^?]*\b(?:join|work (?:at|for)|choose|want to work)\b/i,
];

export function needsYou(question: string): boolean {
  return ABOUT_THE_COMPANY.some((re) => re.test(question));
}
