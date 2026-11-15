/**
 * Builds a tiny, valid PDF in memory: one page per entry, each line drawn with Helvetica.
 * An empty array for a page makes a page with no text (like a scanned page).
 * Test-only; keeps binary fixtures out of the repo.
 */
export function makePdf(pages: string[][], info: { title?: string } = {}): Uint8Array {
  const objs: string[] = [];
  const n = pages.length;
  const font = 3 + n * 2;
  const infoObj = font + 1;
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  pages.forEach((lines, i) => {
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R ` +
        `/Resources << /Font << /F1 ${font} 0 R >> >> >>`,
    );
    const body = lines
      .map((line, j) => `BT /F1 12 Tf 72 ${720 - j * 16} Td (${pdfString(line)}) Tj ET`)
      .join("\n");
    objs.push(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
  });
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objs.push(info.title ? `<< /Title (${pdfString(info.title)}) >>` : "<< >>");

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${infoObj} 0 R >>\n`;
  out += `startxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

const pdfString = (s: string) => s.replace(/([\\()])/g, "\\$1");
