#!/usr/bin/env node
/* =====================================================================
   Security report builder (used by the security-scanner agent)
   ---------------------------------------------------------------------
   Turns a findings JSON file into a time-stamped Word report:
     node .claude/scripts/security-report.js <findings.json> [outDir]
   Output: <outDir or project root>/security-report_YYYY-MM-DD_HHMMSS.docx
   The JSON schema is documented in .claude/agents/security-scanner.md.
   ===================================================================== */
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType, LevelFormat, BorderStyle, Header, Footer, PageNumber
} = require("docx");

/* ===== Constants ===== */
const SEVERITIES = ["Critical", "High", "Medium", "Low", "Info"];
const SEVERITY_STYLE = {
  Critical: { color: "7A1F1F", fill: "F8D7DA" },
  High:     { color: "B42318", fill: "FDECEA" },
  Medium:   { color: "8A3A06", fill: "FEF0E1" },
  Low:      { color: "164BA8", fill: "E2EBF8" },
  Info:     { color: "4A5D78", fill: "EEF2F6" }
};
const STRIDE = ["Spoofing", "Tampering", "Repudiation", "Information disclosure", "Denial of service", "Elevation of privilege"];
const NAVY = "0E2A47";
const HEAD_FILL = "DCE6F2";
const PAGE_W = 11906;               // A4 portrait, DXA
const MARGIN = 1080;                // 0.75 inch
const CONTENT_W = PAGE_W - 2 * MARGIN;

/* ===== Input ===== */
function fail(msg) { console.error("security-report: " + msg); process.exit(1); }

const [, , inputPath, outDirArg] = process.argv;
if (!inputPath) fail("usage: node .claude/scripts/security-report.js <findings.json> [outDir]");
let data;
try { data = JSON.parse(fs.readFileSync(inputPath, "utf8")); }
catch (err) { fail(`cannot read ${inputPath}: ${err.message}`); }

["project", "scope", "summary", "overallRisk", "findings"].forEach(k => {
  if (data[k] === undefined) fail(`missing required field "${k}"`);
});
data.findings.forEach((f, i) => {
  ["id", "title", "severity", "stride", "location", "description", "recommendation"].forEach(k => {
    if (f[k] === undefined) fail(`finding #${i + 1} is missing "${k}"`);
  });
  if (!SEVERITIES.includes(f.severity)) fail(`finding ${f.id}: severity must be one of ${SEVERITIES.join(", ")}`);
  f.stride.forEach(s => { if (!STRIDE.includes(s)) fail(`finding ${f.id}: unknown STRIDE category "${s}"`); });
});
const findings = [...data.findings].sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));

/* ===== Helpers ===== */
const pad = n => String(n).padStart(2, "0");
const now = new Date();
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const humanTime = now.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });

const toLines = value => (Array.isArray(value) ? value : String(value ?? "").split(/\r?\n/));

function para(text, opts = {}) {
  return toLines(text).map(line => new Paragraph({
    spacing: { after: opts.after ?? 120 },
    alignment: opts.align,
    children: [new TextRun({ text: line, bold: opts.bold, italics: opts.italics, color: opts.color, size: opts.size })]
  }));
}

function labelled(label, text) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text: label + ": ", bold: true }), new TextRun(String(text))]
  });
}

const bullet = text => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 60 }, children: [new TextRun(String(text))] });
const numbered = text => new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { after: 60 }, children: [new TextRun(String(text))] });
const heading = (text, level) => new Paragraph({ heading: level, children: [new TextRun(text)] });

/* cell: string, or { text, bold, color, fill } */
function cell(value, width, isHead) {
  const v = typeof value === "object" && value !== null ? value : { text: value };
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: (isHead || v.fill) ? { type: ShadingType.CLEAR, color: "auto", fill: isHead ? HEAD_FILL : v.fill } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: toLines(v.text).map(line => new Paragraph({
      children: [new TextRun({ text: line, bold: isHead || v.bold, color: v.color, size: 18 })]
    }))
  });
}

/* columns: [{ header, width }] where widths are fractions summing to 1 */
function table(columns, rows) {
  const widths = columns.map(c => Math.round(c.width * CONTENT_W));
  widths[widths.length - 1] += CONTENT_W - widths.reduce((a, b) => a + b, 0);
  const border = { style: BorderStyle.SINGLE, size: 4, color: "B8C6D8" };
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({ tableHeader: true, children: columns.map((c, i) => cell(c.header, widths[i], true)) }),
      ...rows.map(r => new TableRow({ children: r.map((v, i) => cell(v, widths[i], false)) }))
    ]
  });
}

const sevCell = s => ({ text: s, bold: true, color: SEVERITY_STYLE[s].color, fill: SEVERITY_STYLE[s].fill });
const gap = () => new Paragraph({ spacing: { after: 120 }, children: [] });

/* ===== Sections ===== */
const counts = Object.fromEntries(SEVERITIES.map(s => [s, findings.filter(f => f.severity === s).length]));
const children = [];

// Title block
children.push(
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "Security assessment report", bold: true, size: 44, color: NAVY })] }),
  new Paragraph({
    spacing: { after: 240 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 6 } },
    children: [new TextRun({ text: data.project, size: 28, color: "4A5D78" })]
  }),
  table([{ header: "Item", width: 0.28 }, { header: "Detail", width: 0.72 }], [
    ["Project", data.project],
    ["Location", data.location || "Not stated"],
    ["Report generated", humanTime],
    ["Scanner", data.scanner || "security-scanner agent (cybersecurity-analyst skill)"],
    ["Frameworks", "STRIDE threat model, CIA triad, OWASP Top 10, CWE, MITRE ATT&CK, likelihood × impact risk rating"],
    ["Overall risk", sevCell(data.overallRisk)]
  ]),
  gap()
);

// 1. Executive summary
children.push(heading("1. Executive summary", HeadingLevel.HEADING_1), ...para(data.summary));
children.push(table(
  SEVERITIES.map(s => ({ header: s, width: 0.2 })),
  [SEVERITIES.map(s => ({ text: String(counts[s]), bold: true, color: SEVERITY_STYLE[s].color, fill: SEVERITY_STYLE[s].fill }))]
), gap());

// 2. Scope and methodology
children.push(heading("2. Scope and methodology", HeadingLevel.HEADING_1));
children.push(heading("In scope", HeadingLevel.HEADING_2), ...toLines(data.scope).map(bullet));
if (data.outOfScope?.length) children.push(heading("Out of scope", HeadingLevel.HEADING_2), ...data.outOfScope.map(bullet));
if (data.methodology?.length) children.push(heading("Method", HeadingLevel.HEADING_2), ...data.methodology.map(numbered));
children.push(heading("Severity scale", HeadingLevel.HEADING_2), table(
  [{ header: "Severity", width: 0.18 }, { header: "Meaning", width: 0.82 }],
  [
    [sevCell("Critical"), "Exploitable now with severe impact (data breach, full compromise). Fix immediately."],
    [sevCell("High"), "Likely to be exploited or high impact. Fix before the next release."],
    [sevCell("Medium"), "Plausible exploitation with moderate impact, or high impact needing unusual conditions. Plan a fix."],
    [sevCell("Low"), "Limited impact or unlikely. Fix when convenient or accept with a reason."],
    [sevCell("Info"), "Observation or hardening opportunity; no direct vulnerability."]
  ]
), gap());

// 3. Assets and attack surface
if (data.assets?.length) {
  children.push(heading("3. Assets and attack surface", HeadingLevel.HEADING_1), heading("Assets", HeadingLevel.HEADING_2));
  children.push(table(
    [{ header: "Asset", width: 0.3 }, { header: "Why it matters (CIA)", width: 0.7 }],
    data.assets.map(a => [a.name, a.value])
  ), gap());
}
if (data.attackSurface?.length) {
  children.push(heading("Attack surface", HeadingLevel.HEADING_2), table(
    [{ header: "Entry point", width: 0.3 }, { header: "Exposure", width: 0.7 }],
    data.attackSurface.map(a => [a.name, a.exposure])
  ), gap());
}

// 4. Findings summary
children.push(heading("4. Findings summary", HeadingLevel.HEADING_1));
children.push(findings.length ? table(
  [{ header: "ID", width: 0.1 }, { header: "Finding", width: 0.38 }, { header: "Severity", width: 0.12 }, { header: "STRIDE", width: 0.2 }, { header: "Location", width: 0.2 }],
  findings.map(f => [f.id, f.title, sevCell(f.severity), f.stride.join(", "), f.location])
) : para("No vulnerabilities were found in scope.")[0], gap());

// 5. Detailed findings
children.push(heading("5. Detailed findings", HeadingLevel.HEADING_1));
findings.forEach(f => {
  children.push(heading(`${f.id}: ${f.title}`, HeadingLevel.HEADING_2));
  children.push(table([{ header: "Attribute", width: 0.25 }, { header: "Value", width: 0.75 }], [
    ["Severity", sevCell(f.severity)],
    ["Likelihood × impact", `${f.likelihood || "n/a"} × ${f.impact || "n/a"}`],
    ["STRIDE", f.stride.join(", ")],
    ["CWE", f.cwe || "n/a"],
    ["OWASP Top 10", f.owasp || "n/a"],
    ["MITRE ATT&CK", f.attack || "n/a"],
    ["Location", f.location],
    ["Status", f.status || "Open"]
  ]), gap());
  children.push(...para(f.description));
  if (f.evidence) children.push(labelled("Evidence", f.evidence));
  children.push(labelled("Recommendation", f.recommendation));
});

// 6. STRIDE matrix
children.push(heading("6. Threat classification (STRIDE)", HeadingLevel.HEADING_1), table(
  [{ header: "STRIDE category", width: 0.3 }, { header: "Findings", width: 0.5 }, { header: "Highest severity", width: 0.2 }],
  STRIDE.map(cat => {
    const hits = findings.filter(f => f.stride.includes(cat));
    const top = hits.length ? hits[0].severity : null;   // findings are sorted by severity
    return [cat, hits.length ? hits.map(f => f.id).join(", ") : "None found", top ? sevCell(top) : "n/a"];
  })
), gap());

// 7. Controls in place
if (data.controls?.length) {
  children.push(heading("7. Security controls already in place", HeadingLevel.HEADING_1), ...data.controls.map(bullet));
}

// 8. Recommendations
if (data.recommendations?.length) {
  children.push(heading("8. Prioritised recommendations", HeadingLevel.HEADING_1), ...data.recommendations.map(numbered));
}

// 9. Limitations
if (data.limitations?.length) {
  children.push(heading("9. Limitations", HeadingLevel.HEADING_1), ...data.limitations.map(bullet));
}

/* ===== Document ===== */
const doc = new Document({
  creator: "security-scanner agent",
  title: `Security assessment report: ${data.project}`,
  styles: {
    default: { document: { run: { font: "Calibri", size: 21 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, color: NAVY }, paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, color: NAVY }, paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 1 } }
    ]
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] }
    ]
  },
  sections: [{
    properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: `Security assessment: ${data.project}`, size: 16, color: "4A5D78" })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: `Generated ${humanTime}. Confidential: contains vulnerability details. Page `, size: 16, color: "4A5D78" }),
      new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "4A5D78" }),
      new TextRun({ text: " of ", size: 16, color: "4A5D78" }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "4A5D78" })
    ] })] }) },
    children
  }]
});

const outDir = path.resolve(outDirArg || path.join(__dirname, "..", ".."));
const outFile = path.join(outDir, `security-report_${stamp}.docx`);
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outFile, buf);
  console.log(outFile);
}).catch(err => fail(err.message));
