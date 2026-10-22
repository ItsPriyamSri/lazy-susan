import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import type { FillPlan } from "@lazy-susan/core";

/** Writes the values into a real AcroForm, so the file opens filled in a viewer. */
export async function fillPdf(src: string, plan: FillPlan, out: string): Promise<{ filled: number; missing: string[] }> {
  const doc = await PDFDocument.load(readFileSync(src));
  const form = doc.getForm();
  const missing: string[] = [];
  let filled = 0;

  for (const patch of plan.patches) {
    try {
      form.getTextField(patch.fieldId).setText(patch.value);
      filled++;
    } catch {
      missing.push(patch.fieldId);
    }
  }

  for (const att of plan.attachments) {
    try {
      form.getTextField(att.fieldId).setText(att.file);
    } catch {
      missing.push(att.fieldId);
    }
  }

  writeFileSync(out, await doc.save());
  return { filled, missing };
}

/** The same plan, applied to an HTML form. Nothing clever: attributes. */
export function fillHtml(src: string, plan: FillPlan): string {
  let html = readFileSync(src, "utf8");

  const setValue = (id: string, value: string): void => {
    const escaped = value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const re = new RegExp(`(<input[^>]*\\bname="${id}"[^>]*?)(\\s*/?>)`);
    if (re.test(html)) {
      html = html.replace(re, `$1 value="${escaped}"$2`);
      return;
    }
    const ta = new RegExp(`(<textarea[^>]*\\bname="${id}"[^>]*>)([\\s\\S]*?)(</textarea>)`);
    html = html.replace(ta, `$1${escaped}$3`);
  };

  for (const p of plan.patches) setValue(p.fieldId, p.value);
  for (const a of plan.attachments) setValue(a.fieldId, a.file);

  // A banner so nobody mistakes the output for the original blank form.
  html = html.replace(
    "</main>",
    `<p style="margin-top:28px;font:13px ui-monospace,monospace;color:#6b675e">
       Filled by Lazy Susan. ${plan.questions.length} field(s) still need a person.
     </p>\n</main>`,
  );

  return html;
}

export function ensureDir(path: string, mkdir: (p: string) => void): void {
  if (!existsSync(path)) mkdir(path);
}
