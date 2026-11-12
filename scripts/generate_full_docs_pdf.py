import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether, PageBreak, HRFlowable
)
from reportlab.pdfgen import canvas

import re
import hashlib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image as PILImage

from reportlab.platypus import Paragraph as _BaseParagraph

# =============================================================================
# MATH RENDERING ENGINE
# -----------------------------------------------------------------------------
# The original script embedded raw LaTeX strings (e.g. "$$\alpha = ...$$")
# directly into ReportLab Paragraph objects. ReportLab's Paragraph markup is
# an HTML-like subset -- it has no idea what LaTeX is, so those strings were
# printed literally (backslashes, dollar signs, \frac, ^{...} and all),
# which is exactly the broken output seen in the source screenshots.
#
# Fix: every Paragraph string is now pre-processed before ReportLab ever
# sees it.
#   - "$$ ... $$" (standalone display equations) are rendered with
#     matplotlib's mathtext engine into a small transparent PNG and swapped
#     in as an <img> tag, so they render as real typeset mathematics.
#   - "$ ... $" (inline math fragments inside prose) are converted into
#     ReportLab markup directly (Greek letters, <sub>/<super> tags, math
#     operators) so they read naturally inline with the surrounding text.
#   - Anything that merely *looks* like a stray dollar sign (currency
#     values such as "$75 / m²") is left completely untouched.
# =============================================================================

import tempfile
MATH_CACHE_DIR = os.path.join(tempfile.gettempdir(), "urbancoolsim_math_cache")
os.makedirs(MATH_CACHE_DIR, exist_ok=True)

_DISPLAY_MATH_RE = re.compile(r'^\$\$(.+)\$\$$', re.DOTALL)
_INLINE_MATH_RE = re.compile(r'\$([^$]+)\$')

_GREEK = {
    "alpha": "α", "beta": "β", "gamma": "γ", "Gamma": "Γ", "delta": "δ",
    "Delta": "Δ", "epsilon": "ε", "varepsilon": "ε", "zeta": "ζ", "eta": "η",
    "theta": "θ", "Theta": "Θ", "iota": "ι", "kappa": "κ", "lambda": "λ",
    "Lambda": "Λ", "mu": "μ", "nu": "ν", "xi": "ξ", "Xi": "Ξ", "pi": "π",
    "Pi": "Π", "rho": "ρ", "sigma": "σ", "Sigma": "Σ", "tau": "τ",
    "upsilon": "υ", "phi": "φ", "Phi": "Φ", "chi": "χ", "psi": "ψ",
    "Psi": "Ψ", "omega": "ω", "Omega": "Ω",
}

_OPS = [
    (r"\\times", "×"), (r"\\cdot", "·"), (r"\\pm", "±"), (r"\\mp", "∓"),
    (r"\\leq", "≤"), (r"\\le\b", "≤"), (r"\\geq", "≥"), (r"\\ge\b", "≥"),
    (r"\\neq", "≠"), (r"\\approx", "≈"), (r"\\equiv", "≡"),
    (r"\\propto", "∝"), (r"\\infty", "∞"), (r"\\partial", "∂"),
    (r"\\nabla", "∇"), (r"\\sum", "Σ"), (r"\\prod", "Π"), (r"\\int", "∫"),
    (r"\\rightarrow", "→"), (r"\\to\b", "→"), (r"\\leftarrow", "←"),
    (r"\\Rightarrow", "⇒"), (r"\\in\b", "∈"), (r"\\notin", "∉"),
    (r"\\subseteq", "⊆"), (r"\\subset", "⊂"), (r"\\cup", "∪"), (r"\\cap", "∩"),
    (r"\\emptyset", "∅"), (r"\\forall", "∀"), (r"\\exists", "∃"),
    (r"\\circ", "°"), (r"\\downarrow", "↓"), (r"\\uparrow", "↑"),
    (r"\\setminus", "∖"), (r"\\max\b", "max"), (r"\\min\b", "min"),
    (r"\\exp\b", "exp"), (r"\\ln\b", "ln"), (r"\\log\b", "log"),
    (r"\\sin\b", "sin"), (r"\\cos\b", "cos"), (r"\\tan\b", "tan"),
    (r"\\arctan\b", "arctan"), (r"\\quad", " "), (r"\\qquad", "  "),
    (r"\\,", " "), (r"\\:", " "), (r"\\;", " "), (r"\\!", ""),
    (r"\\left", ""), (r"\\right", ""), (r"\\%", "%"),
]


def _extract_braced(s, i):
    """Given s[i] == '{', return (content, index_after_matching_close_brace)."""
    depth = 0
    j = i
    while j < len(s):
        if s[j] == '{':
            depth += 1
        elif s[j] == '}':
            depth -= 1
            if depth == 0:
                return s[i + 1:j], j + 1
        j += 1
    return s[i + 1:], len(s)


def _unwrap_macro(s, macro):
    """Replace \\macro{content} with content (non-recursive braces ok)."""
    pattern = "\\\\" + macro + r"\{"
    out = []
    i = 0
    for m in re.finditer(pattern, s):
        pass
    # manual scan (regex alone can't balance braces)
    i = 0
    result = ""
    rx = re.compile(pattern)
    while True:
        m = rx.search(s, i)
        if not m:
            result += s[i:]
            break
        result += s[i:m.start()]
        content, end = _extract_braced(s, m.end() - 1)
        result += content
        i = end
    return result


def _convert_frac(s):
    """Replace \\frac{a}{b} with (a)/(b), handling one level of nesting."""
    rx = re.compile(r"\\frac\{")
    while True:
        m = rx.search(s)
        if not m:
            break
        num, after_num = _extract_braced(s, m.end() - 1)
        if after_num < len(s) and s[after_num] == '{':
            den, after_den = _extract_braced(s, after_num)
        else:
            den, after_den = "", after_num
        s = s[:m.start()] + "(" + num + ")/(" + den + ")" + s[after_den:]
    return s


def _convert_sqrt(s):
    rx = re.compile(r"\\sqrt\{")
    while True:
        m = rx.search(s)
        if not m:
            break
        content, end = _extract_braced(s, m.end() - 1)
        s = s[:m.start()] + "√(" + content + ")" + s[end:]
    return s


def inline_latex_to_markup(content):
    """Convert the inside of a $...$ span into ReportLab paragraph markup."""
    s = content
    for macro in ("text", "mathrm", "operatorname"):
        s = _unwrap_macro(s, macro)
    s = re.sub(r"\\mathbf\{([^{}]*)\}", r"<b>\1</b>", s)
    s = _convert_frac(s)
    s = _convert_sqrt(s)
    for pattern, repl in _OPS:
        s = re.sub(pattern, repl, s)
    for name, glyph in sorted(_GREEK.items(), key=lambda kv: -len(kv[0])):
        s = re.sub(r"\\" + name + r"\b", glyph, s)
    # subscripts / superscripts (braced form first, then single-char form)
    s = re.sub(r"_\{([^{}]*)\}", r"<sub>\1</sub>", s)
    s = re.sub(r"\^\{([^{}]*)\}", r"<super>\1</super>", s)
    s = re.sub(r"_([A-Za-z0-9])", r"<sub>\1</sub>", s)
    s = re.sub(r"\^([A-Za-z0-9\+\-])", r"<super>\1</super>", s)
    s = s.replace("\\", "").replace("{", "").replace("}", "")
    s = re.sub(r"[ \t]+", " ", s).strip()
    return s


def _looks_like_math(content):
    return bool(re.search(r"[\\_^]", content))


def render_display_math(latex_body, fontsize=14, color="#0f172a"):
    """Render a LaTeX-ish expression via matplotlib mathtext into a cached PNG."""
    expr = latex_body
    expr = _unwrap_macro(expr, "text") if "\\text{" in expr else expr
    expr = expr.replace(r"\text", r"\mathrm")
    key = hashlib.md5((expr + str(fontsize) + color).encode("utf-8")).hexdigest()
    path = os.path.join(MATH_CACHE_DIR, key + ".png")
    if not os.path.exists(path):
        fig = plt.figure(figsize=(6, 1))
        fig.patch.set_alpha(0.0)
        fig.text(0.5, 0.5, "$" + expr + "$", fontsize=fontsize, color=color,
                  ha="center", va="center")
        fig.savefig(path, dpi=300, transparent=True, bbox_inches="tight", pad_inches=0.03)
        plt.close(fig)
    with PILImage.open(path) as im:
        w_px, h_px = im.size
    dpi = 300.0
    return path, (w_px / dpi) * 72.0, (h_px / dpi) * 72.0


def process_math_text(text, max_width_pt=515.0):
    if not isinstance(text, str) or "$" not in text:
        return text
    stripped = text.strip()
    m = _DISPLAY_MATH_RE.match(stripped)
    if m:
        latex_body = m.group(1).strip()
        for fontsize in (14, 11, 9):
            try:
                path, w, h = render_display_math(latex_body, fontsize=fontsize)
            except Exception:
                return re.sub(r"\\[a-zA-Z]+", "", latex_body).replace("{", "").replace("}", "")
            if w <= max_width_pt or fontsize == 9:
                if w > max_width_pt:
                    scale = max_width_pt / w
                    w *= scale
                    h *= scale
                return f'<img src="{path}" width="{w:.1f}" height="{h:.1f}" valign="middle"/>'
        return ""

    def _sub(mo):
        content = mo.group(1)
        if not _looks_like_math(content):
            return mo.group(0)
        try:
            return inline_latex_to_markup(content)
        except Exception:
            return content.replace("\\", "")

    return _INLINE_MATH_RE.sub(_sub, text)


class Paragraph(_BaseParagraph):
    """Drop-in replacement for reportlab.platypus.Paragraph that first
    converts any LaTeX-style math markup in the source text into either
    a rendered image (display equations) or ReportLab markup (inline
    math), so formulas display as real mathematics instead of raw
    LaTeX source."""

    def __init__(self, text, *args, **kwargs):
        try:
            text = process_math_text(text)
        except Exception:
            pass
        super().__init__(text, *args, **kwargs)


class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        print(f"[UrbanCoolSim] Total PDF Pages Rendered: {num_pages}")
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        if self._pageNumber == 1:
            # Skip header and footer on cover page
            return
        self.saveState()
        
        # Running Header
        self.setFont("Helvetica-Bold", 7.5)
        self.setFillColor(colors.HexColor("#475569"))
        self.drawString(40, 755, "URBANCOOLSIM: AI-DRIVEN URBAN HEAT INTELLIGENCE & PHYSICS SIMULATION")
        self.setFont("Helvetica", 7.5)
        self.drawRightString(572, 755, "SYSTEM ARCHITECTURE & SPECIFICATION")
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.6)
        self.line(40, 748, 572, 748)
        
        # Running Footer
        self.line(40, 42, 572, 42)
        self.setFont("Helvetica", 7.5)
        self.setFillColor(colors.HexColor("#64748b"))
        self.drawString(40, 30, "UrbanCoolSim Technical Documentation • Physics-Informed Digital Twin v1.0.0")
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(572, 30, page_text)
        self.restoreState()

def build_pdf_documentation(output_pdf_path="UrbanCoolSim_Technical_Documentation.pdf"):
    print(f"[UrbanCoolSim] Compiling comprehensive PDF documentation to: {output_pdf_path}")
    os.makedirs(os.path.dirname(os.path.abspath(output_pdf_path)), exist_ok=True)
    
    doc = SimpleDocTemplate(
        output_pdf_path,
        pagesize=letter,
        leftMargin=40,
        rightMargin=40,
        topMargin=54,
        bottomMargin=54
    )
    
    # Palette
    c_primary = colors.HexColor("#0f172a")     # Deep Slate / Navy
    c_secondary = colors.HexColor("#0284c7")   # Azure / Cyan
    c_accent = colors.HexColor("#059669")      # Emerald Green
    c_danger = colors.HexColor("#dc2626")      # Crimson
    c_dark = colors.HexColor("#1e293b")        # Charcoal
    c_muted = colors.HexColor("#64748b")       # Muted Gray
    c_light_bg = colors.HexColor("#f8fafc")    # Background light
    c_card_bg = colors.HexColor("#f1f5f9")     # Card fill
    c_border = colors.HexColor("#cbd5e1")      # Border gray
    c_callout_bg = colors.HexColor("#ecfdf5")  # Green callout
    c_callout_border = colors.HexColor("#10b981")
    c_warn_bg = colors.HexColor("#fffbeb")
    c_warn_border = colors.HexColor("#f59e0b")
    
    # Styles
    base_styles = getSampleStyleSheet()
    
    styles = {
        "CoverTitle": ParagraphStyle(
            "CoverTitle",
            parent=base_styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=28,
            textColor=c_primary,
            alignment=0,
            spaceAfter=8
        ),
        "CoverSubtitle": ParagraphStyle(
            "CoverSubtitle",
            parent=base_styles["Normal"],
            fontName="Helvetica",
            fontSize=11,
            leading=15,
            textColor=c_secondary,
            spaceAfter=15
        ),
        "CoverMetaLabel": ParagraphStyle(
            "CoverMetaLabel",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=12,
            textColor=c_dark
        ),
        "CoverMetaVal": ParagraphStyle(
            "CoverMetaVal",
            parent=base_styles["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=12,
            textColor=c_muted
        ),
        "H1": ParagraphStyle(
            "H1",
            parent=base_styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=19,
            textColor=c_primary,
            spaceBefore=14,
            spaceAfter=6,
            keepWithNext=True
        ),
        "H2": ParagraphStyle(
            "H2",
            parent=base_styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=11.5,
            leading=15,
            textColor=c_secondary,
            spaceBefore=10,
            spaceAfter=4,
            keepWithNext=True
        ),
        "H3": ParagraphStyle(
            "H3",
            parent=base_styles["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=9.5,
            leading=13,
            textColor=c_dark,
            spaceBefore=8,
            spaceAfter=3,
            keepWithNext=True
        ),
        "Body": ParagraphStyle(
            "Body",
            parent=base_styles["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=12,
            textColor=c_dark,
            spaceAfter=5
        ),
        "BodyBold": ParagraphStyle(
            "BodyBold",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=12,
            textColor=c_primary
        ),
        "Bullet": ParagraphStyle(
            "Bullet",
            parent=base_styles["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=12,
            textColor=c_dark,
            leftIndent=12,
            firstLineIndent=-8,
            spaceAfter=3
        ),
        "CodeBlock": ParagraphStyle(
            "CodeBlock",
            parent=base_styles["Normal"],
            fontName="Courier",
            fontSize=7.5,
            leading=10.5,
            textColor=colors.HexColor("#0f172a")
        ),
        "Formula": ParagraphStyle(
            "Formula",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=13,
            textColor=colors.HexColor("#0f172a"),
            alignment=1
        ),
        "CalloutText": ParagraphStyle(
            "CalloutText",
            parent=base_styles["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=11.5,
            textColor=colors.HexColor("#064e3b")
        ),
        "CalloutWarn": ParagraphStyle(
            "CalloutWarn",
            parent=base_styles["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=11.5,
            textColor=colors.HexColor("#78350f")
        ),
        "TableHeader": ParagraphStyle(
            "TableHeader",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7.5,
            leading=10,
            textColor=colors.white,
            alignment=0
        ),
        "TableCell": ParagraphStyle(
            "TableCell",
            parent=base_styles["Normal"],
            fontName="Helvetica",
            fontSize=7.5,
            leading=10,
            textColor=c_dark,
            alignment=0
        ),
        "TableCellBold": ParagraphStyle(
            "TableCellBold",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7.5,
            leading=10,
            textColor=c_primary,
            alignment=0
        ),
        "TableCellCode": ParagraphStyle(
            "TableCellCode",
            parent=base_styles["Normal"],
            fontName="Courier",
            fontSize=7,
            leading=9,
            textColor=colors.HexColor("#0369a1")
        ),
        "FigCaption": ParagraphStyle(
            "FigCaption",
            parent=base_styles["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=7.5,
            leading=10,
            textColor=c_muted,
            alignment=1,
            spaceAfter=8
        )
    }

    def make_callout(text, is_warn=False):
        bg = c_warn_bg if is_warn else c_callout_bg
        border = c_warn_border if is_warn else c_callout_border
        p_style = styles["CalloutWarn"] if is_warn else styles["CalloutText"]
        p = Paragraph(text, p_style)
        t = Table([[p]], colWidths=[532])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), bg),
            ("BOX", (0, 0), (-1, -1), 1, border),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ]))
        return t

    def make_code_box(code_text):
        lines = [Paragraph(line.replace(" ", "&nbsp;"), styles["CodeBlock"]) for line in code_text.strip().split("\n")]
        t = Table([[lines]], colWidths=[532])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#cbd5e1")),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ]))
        return t

    story = []

    # =========================================================================
    # COVER PAGE
    # =========================================================================
    # Top decorative banner bar
    top_bar = Table([[""]], colWidths=[532], rowHeights=[6])
    top_bar.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), c_secondary),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(top_bar)
    story.append(Spacer(1, 15))
    
    # Title & Subtitle
    story.append(Paragraph("UrbanCoolSim", styles["CoverTitle"]))
    story.append(Paragraph("AI-Driven Urban Heat Intelligence, Physics Simulation & Multi-Objective Decision Support Platform", ParagraphStyle(
        "CoverSubTitleMain", parent=styles["CoverTitle"], fontSize=14, leading=18, textColor=c_dark
    )))
    story.append(Paragraph("Comprehensive Technical Reference Manual, Architecture Specification, Mathematical Physics Derivations & System Runbook", styles["CoverSubtitle"]))
    
    story.append(HRFlowable(width="100%", thickness=1.5, color=c_secondary, spaceBefore=4, spaceAfter=15))
    
    # Executive Quote Callout
    story.append(make_callout("<b>Platform Thesis:</b> <i>'We are not selling a heat map. We are selling better urban infrastructure decisions.'</i><br/>"
                             "UrbanCoolSim unifies multi-spectral remote sensing, deterministic surface energy balance thermodynamics, "
                             "AI surrogate model acceleration (LightGBM + TreeSHAP), and multi-objective Pareto optimization (NSGA-II) "
                             "into an enterprise-grade microclimate digital twin.", is_warn=False))
    
    story.append(Spacer(1, 15))
    
    # Metadata Table
    meta_data = [
        [Paragraph("Document ID:", styles["CoverMetaLabel"]), Paragraph("UCS-SPEC-2026-V1.0", styles["CoverMetaVal"]),
         Paragraph("Classification:", styles["CoverMetaLabel"]), Paragraph("Engineering & Scientific Specification", styles["CoverMetaVal"])],
        [Paragraph("Platform Version:", styles["CoverMetaLabel"]), Paragraph("v1.0.0 (Physics-Informed Digital Twin)", styles["CoverMetaVal"]),
         Paragraph("Release Date:", styles["CoverMetaLabel"]), Paragraph("August 2026", styles["CoverMetaVal"])],
        [Paragraph("Target Architecture:", styles["CoverMetaLabel"]), Paragraph("FastAPI / Next.js 14 / Deck.gl / PostGIS", styles["CoverMetaVal"]),
         Paragraph("License:", styles["CoverMetaLabel"]), Paragraph("MIT Open Source License", styles["CoverMetaVal"])],
        [Paragraph("Core Repositories:", styles["CoverMetaLabel"]), Paragraph("github.com/your-org/UrbanCoolSim", styles["CoverMetaVal"]),
         Paragraph("Validation Fit:", styles["CoverMetaLabel"]), Paragraph("R² = 0.973 (Landsat 8 Ground Truth)", styles["CoverMetaVal"])],
    ]
    meta_table = Table(meta_data, colWidths=[100, 166, 100, 166])
    meta_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), c_card_bg),
        ("BOX", (0, 0), (-1, -1), 0.8, c_border),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(meta_table)
    
    story.append(Spacer(1, 20))
    
    # Table of Contents Summary Grid
    toc_data = [
        [Paragraph("<b>Section</b>", styles["TableHeader"]), Paragraph("<b>Core Focus Area</b>", styles["TableHeader"])],
        [Paragraph("1. Executive Overview & Vision", styles["TableCellBold"]), Paragraph("Urban Heat Island crisis, core thesis, and holistic computational solution", styles["TableCell"])],
        [Paragraph("2. Spatial Data Architecture", styles["TableCellBold"]), Paragraph("Two-Tier spatial model (10m Tier 1 microgrids vs 1km Tier 2 NASA GIBS)", styles["TableCell"])],
        [Paragraph("3. Dataset Specification & Pipeline", styles["TableCellBold"]), Paragraph("10-source dataset matrix (Landsat, Sentinel, GEDI, Open Buildings, DEM)", styles["TableCell"])],
        [Paragraph("4. Surface Energy Balance (SEB)", styles["TableCellBold"]), Paragraph("Thermodynamic conservation, turbulent flux formulations, Newton-Raphson", styles["TableCell"])],
        [Paragraph("5. Parameterized Interventions", styles["TableCellBold"]), Paragraph("Cool roofs, green roofs, canopy trees, pavements, water, and CapEx/OpEx accounting", styles["TableCell"])],
        [Paragraph("6. AI Surrogate & TreeSHAP", styles["TableCellBold"]), Paragraph("LightGBM acceleration (sub-2ms), R²=0.962 accuracy, Shapley explainability", styles["TableCell"])],
        [Paragraph("7. NSGA-II Multi-Objective Opt", styles["TableCellBold"]), Paragraph("Pareto trade-offs (ΔT vs $ vs Water) and deterministic physics re-validation", styles["TableCell"])],
        [Paragraph("8. Observational Validation", styles["TableCellBold"]), Paragraph("Landsat 8 / ECOSTRESS ground-truth calibration and semantic provenance taxonomy", styles["TableCell"])],
        [Paragraph("9. Frontend Architecture (11 Screens)", styles["TableCellBold"]), Paragraph("Next.js 14 App Router, Deck.gl, MapLibre GL, and complete screen-by-screen UX", styles["TableCell"])],
        [Paragraph("10. Backend Architecture & REST API", styles["TableCellBold"]), Paragraph("FastAPI endpoints, SQLAlchemy models, Pydantic schemas, and Celery jobs", styles["TableCell"])],
        [Paragraph("11. Security, Hardening & Audit", styles["TableCellBold"]), Paragraph("Rate limiting, input bounds, non-root containers, and audit remediation batches 1-6", styles["TableCell"])],
        [Paragraph("12. Operational Runbook & Appendix", styles["TableCellBold"]), Paragraph("Docker Compose, local setup, pytest test suite, physical constants glossary", styles["TableCell"])],
    ]
    toc_table = Table(toc_data, colWidths=[180, 352])
    toc_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), c_primary),
        ("GRID", (0, 0), (-1, -1), 0.5, c_border),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, c_light_bg]),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(toc_table)
    
    story.append(PageBreak())

    # =========================================================================
    # CHAPTER 1: EXECUTIVE OVERVIEW & SCIENTIFIC VISION
    # =========================================================================
    story.append(Paragraph("1. Executive Overview & Scientific Vision", styles["H1"]))
    story.append(HRFlowable(width="100%", thickness=1, color=c_secondary, spaceBefore=2, spaceAfter=8))
    
    story.append(Paragraph("<b>1.1 The Urban Heat Island (UHI) Crisis</b>", styles["H2"]))
    story.append(Paragraph(
        "Urban Heat Islands (UHIs) represent one of the most severe climate vulnerabilities facing 21st-century cities. "
        "Impervious materials (asphalt, dark roofs, concrete) absorb solar shortwave radiation, while high-density urban geometry "
        "restricts radiative cooling and traps anthropogenic waste heat ($Q_f$). As a result, urban core surface temperatures routinely "
        "exceed surrounding rural baselines by <b>4°C to 12°C</b> during peak summer heat waves, precipitating severe public health emergencies, "
        "spiking peak electrical grid cooling loads, and exacerbating thermal mortality in vulnerable demographic populations.",
        styles["Body"]
    ))
    
    story.append(Paragraph("<b>1.2 Flaws in Conventional Urban Heat Solutions</b>", styles["H2"]))
    story.append(Paragraph("Traditional municipal heat mitigation strategies suffer from three fundamental systemic flaws:", styles["Body"]))
    story.append(Paragraph("• <b>Passive Visualizations ('Heat Maps'):</b> Static satellite rasters indicate where temperatures are high today, but fail to explain the thermodynamic drivers or quantify how much cooling a specific capital investment will deliver.", styles["Bullet"]))
    story.append(Paragraph("• <b>Computational Bottlenecks:</b> Full 3D Computational Fluid Dynamics (CFD) simulation packages (e.g., ENVI-met, OpenFOAM) require hours or days per run, making iterative scenario exploration and multi-objective optimization computationally impossible.", styles["Bullet"]))
    story.append(Paragraph("• <b>Unconstrained Greening:</b> Policy proposals frequently overlook real-world engineering constraints such as capital expenditure (CapEx), ongoing operational maintenance (OpEx), water resource scarcity, and structural rooftop weight limits.", styles["Bullet"]))

    story.append(Paragraph("<b>1.3 The UrbanCoolSim Unified Solution</b>", styles["H2"]))
    story.append(Paragraph(
        "UrbanCoolSim bridges the gap between academic microclimate physics and actionable municipal capital planning. "
        "By pairing <b>first-principles Surface Energy Balance (SEB) thermodynamics</b> with an <b>AI surrogate emulator (LightGBM)</b>, "
        "the platform compresses spatial simulation latency from minutes to <b>sub-2-milliseconds</b> ($R^2 = 0.962$). "
        "This speed enables <b>NSGA-II multi-objective genetic algorithms</b> to evaluate millions of intervention trade-offs across cooling, "
        "budget, water demand, and demographic vulnerability, backed by an automated <b>deterministic physics re-validation safeguard</b>.",
        styles["Body"]
    ))
    
    story.append(Paragraph("<b>1.4 Semantic Provenance Taxonomy</b>", styles["H2"]))
    story.append(Paragraph(
        "To guarantee zero hallucination and total computational integrity, every data metric in UrbanCoolSim is stamped with an immutable provenance tag:",
        styles["Body"]
    ))
    
    prov_data = [
        [Paragraph("<b>Provenance Tag</b>", styles["TableHeader"]), Paragraph("<b>Definition & Scientific Source</b>", styles["TableHeader"])],
        [Paragraph("[OBSERVED]", styles["TableCellCode"]), Paragraph("Direct satellite remote sensing measurement (Landsat 8 TIRS, ECOSTRESS, Sentinel-2 BOA)", styles["TableCell"])],
        [Paragraph("[DERIVED]", styles["TableCellCode"]), Paragraph("Deterministically calculated from observations (Liang Broadband Albedo, NDVI, FVC, NDWI)", styles["TableCell"])],
        [Paragraph("[SIMULATED]", styles["TableCellCode"]), Paragraph("Computed via deterministic Newton-Raphson Surface Energy Balance solver ($Q^*+Q_f=Q_h+Q_e+\\Delta Q_s$)", styles["TableCell"])],
        [Paragraph("[PREDICTED]", styles["TableCellCode"]), Paragraph("Inferred by the LightGBM AI surrogate model trained on physical ground-truth", styles["TableCell"])],
        [Paragraph("[OPTIMIZED]", styles["TableCellCode"]), Paragraph("Generated by the NSGA-II Pareto genetic algorithm solver", styles["TableCell"])],
    ]
    t_prov = Table(prov_data, colWidths=[110, 422])
    t_prov.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), c_dark),
        ("GRID", (0, 0), (-1, -1), 0.5, c_border),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, c_light_bg]),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t_prov)
    
    story.append(Spacer(1, 10))

    # =========================================================================
    # CHAPTER 2: SYSTEM ARCHITECTURE & TWO-TIER SPATIAL MODEL
    # =========================================================================
    story.append(Paragraph("2. System Architecture & Two-Tier Spatial Data Model", styles["H1"]))
    story.append(HRFlowable(width="100%", thickness=1, color=c_secondary, spaceBefore=2, spaceAfter=8))
    
    story.append(Paragraph(
        "UrbanCoolSim deploys a principled <b>Two-Tier Spatial Architecture</b> balancing global planetary coverage with rigorous microclimate thermodynamic modeling:",
        styles["Body"]
    ))
    
    story.append(Paragraph("• <b>Tier 2: Global Planetary Reference Layer (~1km Resolution)</b>: Powered by NASA EOSDIS GIBS MODIS Terra / Aqua and VIIRS Daytime Land Surface Temperature (LST). Provides true worldwide coverage with a native thermal rainbow palette. <i>Surface Temperature is the only layer with true planetary satellite coverage.</i>", styles["Bullet"]))
    story.append(Paragraph("• <b>Tier 1: High-Resolution 10m Physics-Simulated Microgrids (5 Archetypes)</b>: Full 10m x 10m microgrid cells with multi-layer Surface Energy Balance physics, 3D building extrusions, LiDAR canopy models, and NSGA-II multi-objective optimization.", styles["Bullet"]))
    story.append(Paragraph("• <b>Zoom-Driven Cross-Fade (12 ≤ z < 14)</b>: When zooming into a registered study area, MapLibre GL seamlessly cross-fades from the ~1km GIBS planetary raster into the 10m physics-informed microgrid.", styles["Bullet"]))

    story.append(Spacer(1, 4))
    
    # Embed Architecture Flow Figure
    fig1_path = "docs/figures/arch_flow.png"
    if os.path.exists(fig1_path):
        story.append(Image(fig1_path, width=520, height=270))
        story.append(Paragraph("Figure 1: UrbanCoolSim End-to-End System Architecture & Two-Tier Spatial Data Flow", styles["FigCaption"]))
    
    story.append(Paragraph("<b>2.1 Registered Urban Archetype Study Areas (Tier 1)</b>", styles["H2"]))
    
    archetype_data = [
        [Paragraph("<b>Study Area ID</b>", styles["TableHeader"]), Paragraph("<b>Location & Urban Archetype</b>", styles["TableHeader"]), Paragraph("<b>Base Ts</b>", styles["TableHeader"]), Paragraph("<b>Albedo</b>", styles["TableHeader"]), Paragraph("<b>Bldg Den</b>", styles["TableHeader"]), Paragraph("<b>Solar S↓</b>", styles["TableHeader"]), Paragraph("<b>Qf (Waste)</b>", styles["TableHeader"])],
        [Paragraph("delhi_cp", styles["TableCellCode"]), Paragraph("Connaught Place (New Delhi, IN) - Radial commercial core", styles["TableCell"]), Paragraph("42.0°C", styles["TableCellBold"]), Paragraph("0.18", styles["TableCell"]), Paragraph("0.45", styles["TableCell"]), Paragraph("920 W/m²", styles["TableCell"]), Paragraph("45 W/m²", styles["TableCell"])],
        [Paragraph("mumbai_bkc", styles["TableCellCode"]), Paragraph("Bandra Kurla Complex (Mumbai, IN) - Coastal humid core", styles["TableCell"]), Paragraph("36.5°C", styles["TableCellBold"]), Paragraph("0.15", styles["TableCell"]), Paragraph("0.50", styles["TableCell"]), Paragraph("840 W/m²", styles["TableCell"]), Paragraph("50 W/m²", styles["TableCell"])],
        [Paragraph("singapore_marina", styles["TableCellCode"]), Paragraph("Marina Bay (Singapore) - Tropical waterfront high-rise", styles["TableCell"]), Paragraph("33.0°C", styles["TableCellBold"]), Paragraph("0.19", styles["TableCell"]), Paragraph("0.40", styles["TableCell"]), Paragraph("880 W/m²", styles["TableCell"]), Paragraph("40 W/m²", styles["TableCell"])],
        [Paragraph("phoenix_downtown", styles["TableCellCode"]), Paragraph("Downtown Core (Phoenix, USA) - Arid desert grid", styles["TableCell"]), Paragraph("45.0°C", styles["TableCellBold"]), Paragraph("0.16", styles["TableCell"]), Paragraph("0.35", styles["TableCell"]), Paragraph("1020 W/m²", styles["TableCell"]), Paragraph("55 W/m²", styles["TableCell"])],
        [Paragraph("tokyo_shinjuku", styles["TableCellCode"]), Paragraph("Shinjuku Center (Tokyo, JP) - Dense skyscraper canyons", styles["TableCell"]), Paragraph("35.5°C", styles["TableCellBold"]), Paragraph("0.16", styles["TableCell"]), Paragraph("0.65", styles["TableCell"]), Paragraph("860 W/m²", styles["TableCell"]), Paragraph("65 W/m²", styles["TableCell"])],
    ]
    t_arch = Table(archetype_data, colWidths=[75, 185, 48, 44, 52, 64, 64])
    t_arch.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), c_primary),
        ("GRID", (0, 0), (-1, -1), 0.5, c_border),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, c_light_bg]),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t_arch)
    
    story.append(Spacer(1, 6))
    story.append(make_callout("<b>Data Integrity Guarantee:</b> Microclimate parameters including Building Heights ($H$), Tree Canopy ($GEDI$), Demographic Exposure ($WorldPop$), Waste Heat ($Q_f$), and Albedo ($\\alpha$) are strictly high-resolution Tier 1 microgrid layers available within the 5 registered study areas. When panning globally outside these areas, the system displays the authentic NASA GIBS LST layer for surface temperature, and renders an honest 'No global reference available' notice for non-LST layers rather than fabricating unverified global numbers.", is_warn=False))

    story.append(PageBreak())

    # =========================================================================
    # CHAPTER 3: DATASET SPECIFICATION & INGESTION PIPELINE
    # =========================================================================
    story.append(Paragraph("3. Comprehensive Dataset Specification & Ingestion Pipeline", styles["H1"]))
    story.append(HRFlowable(width="100%", thickness=1, color=c_secondary, spaceBefore=2, spaceAfter=8))
    
    story.append(Paragraph(
        "UrbanCoolSim ingests a multi-spectral remote sensing, geospatial vector, and atmospheric reanalysis dataset matrix "
        "(<b>Groups A through J</b>) into a standardized 10m Digital Twin microgrid:",
        styles["Body"]
    ))
    
    ds_matrix = [
        [Paragraph("<b>Dataset Source</b>", styles["TableHeader"]), Paragraph("<b>Resolution</b>", styles["TableHeader"]), Paragraph("<b>Format</b>", styles["TableHeader"]), Paragraph("<b>Physical Role in Digital Twin Microgrid</b>", styles["TableHeader"])],
        [Paragraph("Landsat 8/9 Level-2 (TIRS)", styles["TableCellBold"]), Paragraph("30m -> 10m", styles["TableCell"]), Paragraph("GeoTIFF", styles["TableCellCode"]), Paragraph("Peak-afternoon ground-truth Land Surface Temperature ($T_s$) calibration", styles["TableCell"])],
        [Paragraph("NASA ECOSTRESS L2", styles["TableCellBold"]), Paragraph("70m Diurnal", styles["TableCell"]), Paragraph("GeoTIFF/H5", styles["TableCellCode"]), Paragraph("Diurnal precessing thermal cycle & broadband emissivity ($\\epsilon_{wb} \\approx 0.92-0.98$)", styles["TableCell"])],
        [Paragraph("Sentinel-2 MSI Level-2A", styles["TableCellBold"]), Paragraph("10m Multi-spectral", styles["TableCell"]), Paragraph("GeoTIFF", styles["TableCellCode"]), Paragraph("BOA Reflectance (B2, B4, B8, B11) for Liang Albedo, NDVI, and FVC ($f_{veg}$)", styles["TableCell"])],
        [Paragraph("Google Open Buildings V3", styles["TableCellBold"]), Paragraph("Vector / 10m", styles["TableCell"]), Paragraph("GeoJSON", styles["TableCellCode"]), Paragraph("High-precision building footprints, heights ($H$), and density ($f_{bldg}$)", styles["TableCell"])],
        [Paragraph("NASA GEDI LiDAR (L2A/B)", styles["TableCellBold"]), Paragraph("25m Footprints", styles["TableCell"]), Paragraph("HDF5 / GeoTIFF", styles["TableCellCode"]), Paragraph("3D Tree canopy height profile ($H_{canopy}$) and Leaf Area Index (LAI)", styles["TableCell"])],
        [Paragraph("WorldPop Constrained", styles["TableCellBold"]), Paragraph("100m Demographic", styles["TableCell"]), Paragraph("GeoTIFF", styles["TableCellCode"]), Paragraph("Heat Vulnerability Index (HVI) & demographic exposure weighting", styles["TableCell"])],
        [Paragraph("VIIRS VNP46A2 NTL", styles["TableCellBold"]), Paragraph("500m Daily", styles["TableCell"]), Paragraph("GeoTIFF", styles["TableCellCode"]), Paragraph("Dynamic spatial proxy for anthropogenic waste heat emissions ($Q_f$)", styles["TableCell"])],
        [Paragraph("Copernicus DEM (GLO-30)", styles["TableCellBold"]), Paragraph("30m Surface", styles["TableCell"]), Paragraph("GeoTIFF", styles["TableCellCode"]), Paragraph("Topography, elevation gradients, and canyon Sky View Factor (SVF)", styles["TableCell"])],
        [Paragraph("OpenStreetMap (OSM)", styles["TableCellBold"]), Paragraph("Vector Geometries", styles["TableCell"]), Paragraph("OSM PBF", styles["TableCellCode"]), Paragraph("Street canyon widths, road networks, and rooftop retrofit bounds", styles["TableCell"])],
        [Paragraph("ERA5-Land Reanalysis", styles["TableCellBold"]), Paragraph("0.1° (~9km) Hourly", styles["TableCell"]), Paragraph("NetCDF / GRIB", styles["TableCellCode"]), Paragraph("Meteorological boundary conditions ($T_a, S_\\downarrow, L_\\downarrow, u_{10}, q, p_s$)", styles["TableCell"])],
    ]
    t_ds = Table(ds_matrix, colWidths=[125, 75, 60, 272])
    t_ds.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), c_dark),
        ("GRID", (0, 0), (-1, -1), 0.5, c_border),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, c_light_bg]),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t_ds)
    
    story.append(Paragraph("<b>3.1 Mathematical Derivations from Multi-Spectral Satellite Bands</b>", styles["H2"]))
    story.append(Paragraph("• <b>Broadband Shortwave Surface Albedo (α)</b> derived via Liang's formulation across Sentinel-2 Level-2A bands:", styles["Body"]))
    story.append(Paragraph("$$\\alpha = 0.356 \\cdot B02 + 0.130 \\cdot B04 + 0.373 \\cdot B08 + 0.085 \\cdot B11 + 0.072$$", styles["Formula"]))
    
    story.append(Paragraph("• <b>Normalized Difference Vegetation Index (NDVI) & Fractional Vegetation Cover (FVC / f_veg):</b>", styles["Body"]))
    story.append(Paragraph("$$NDVI = \\frac{B08 - B04}{B08 + B04}, \\quad f_{veg} = \\left[ \\text{clip}\\left( \\frac{NDVI - NDVI_{soil}}{NDVI_{veg} - NDVI_{soil}}, 0.0, 1.0 \\right) \\right]^2$$", styles["Formula"]))
    story.append(Paragraph("where $NDVI_{soil} = 0.12$ and $NDVI_{veg} = 0.65$.", styles["Body"]))

    story.append(Paragraph("• <b>Landsat 8 Collection 2 Digital Number (DN) Calibration to Kelvin and Celsius:</b>", styles["Body"]))
    story.append(Paragraph("$$T_K = DN \\times 0.00341802 + 149.0, \\quad T_c = T_K - 273.15$$", styles["Formula"]))

    story.append(Paragraph("• <b>Sky View Factor (SVF) & Aerodynamic Roughness Lengths:</b>", styles["Body"]))
    story.append(Paragraph("$$\\text{SVF} = \\cos\\left( \\arctan\\left( \\frac{2 H_{bldg}}{W_{street}} \\right) \\right), \\quad z_0 = 0.10 \\cdot H_{bldg}, \\quad d = 0.70 \\cdot H_{bldg}$$", styles["Formula"]))

    story.append(Paragraph("<b>3.2 Spatial Grid Unification Standard</b>", styles["H2"]))
    story.append(Paragraph(
        "All raster and vector layers are clipped and resampled onto a unified <b>10m x 10m grid matrix</b> in local UTM coordinates "
        "(e.g., WGS 84 / UTM Zone 43N - EPSG:32643 for New Delhi and Mumbai). Each spatial cell $(i, j)$ stores a multi-channel feature vector: "
        "<code>[x, y, elevation, H_bldg, f_bldg, f_veg, NDVI, f_water, albedo, emissivity, Ta, S_down, u10, RH, Qf]</code>.",
        styles["Body"]
    ))

    story.append(PageBreak())

    # =========================================================================
    # CHAPTER 4: THEORETICAL PHYSICS ENGINE: SURFACE ENERGY BALANCE
    # =========================================================================
    story.append(Paragraph("4. Theoretical Physics Engine: Surface Energy Balance (SEB)", styles["H1"]))
    story.append(HRFlowable(width="100%", thickness=1, color=c_secondary, spaceBefore=2, spaceAfter=8))
    
    story.append(Paragraph(
        "At every 10m x 10m microgrid cell, UrbanCoolSim enforces the <b>first-principles conservation of thermodynamic energy</b>:",
        styles["Body"]
    ))
    story.append(Paragraph("$$Q^* + Q_f = Q_h + Q_e + \\Delta Q_s \\quad [\\text{W/m}^2]$$", styles["Formula"]))
    
    # Embed SEB Flux Figure
    fig2_path = "docs/figures/seb_flux.png"
    if os.path.exists(fig2_path):
        story.append(Image(fig2_path, width=480, height=220))
        story.append(Paragraph("Figure 2: Surface Energy Balance (SEB) Thermodynamic Flux Coupling Schematic", styles["FigCaption"]))
    
    story.append(Paragraph("<b>4.1 Detailed Thermodynamic Formulations</b>", styles["H2"]))
    
    story.append(Paragraph("<b>1. Net Radiation Flux ($Q^*$):</b>", styles["H3"]))
    story.append(Paragraph("$$Q^* = (1 - \\alpha)S_\\downarrow + \\epsilon L_\\downarrow - \\epsilon \\sigma T_s^4 \\quad [\\text{W/m}^2]$$", styles["Formula"]))
    story.append(Paragraph("Where $\\alpha$ is broadband albedo ($0.05 \\le \\alpha \\le 0.85$), $S_\\downarrow$ is downwelling solar irradiance ($850\\text{ W/m}^2$), $\\epsilon$ is surface emissivity ($0.95$), $\\sigma = 5.670374 \\times 10^{-8}\\text{ W/m}^2\\text{K}^4$, and $L_\\downarrow = \\epsilon_{atm}\\sigma T_a^4$ with $\\epsilon_{atm} = 1.24 (e_a / T_a)^{1/7}$ (Brutsaert formulation).", styles["Body"]))

    story.append(Paragraph("<b>2. Sensible Heat Flux ($Q_h$) & Aerodynamic Coupling:</b>", styles["H3"]))
    story.append(Paragraph("$$Q_h = \\rho c_p \\frac{T_s - T_a}{r_a} \\quad [\\text{W/m}^2], \\quad r_a = \\frac{\\left[\\ln\\left(\\frac{z_{eff} - d}{z_0}\\right)\\right]^2}{\\kappa^2 u_{10}}$$", styles["Formula"]))
    story.append(Paragraph("Where $\\rho c_p = 1200\\text{ J/m}^3\\text{K}$, $\\kappa = 0.40$ (von Kármán constant), $u_{10} \\ge 0.1\\text{ m/s}$ (clamped to prevent zero division), $z_0 = 0.1 H_{bldg}(1 + f_{bldg})$, and $d = 0.7 H_{bldg}$. Resistance $r_a$ is bounded: $5 \\le r_a \\le 300\\text{ s/m}$.", styles["Body"]))

    story.append(Paragraph("<b>3. Latent Heat Flux / Evapotranspiration ($Q_e$):</b>", styles["H3"]))
    story.append(Paragraph("$$Q_e = \\left(f_{veg} \\cdot \\beta_{wet} + f_{water}\\right) \\cdot Q_{e,\\text{pot}}, \\quad Q_{e,\\text{pot}} = \\max\\left(0.0, 0.60 \\cdot Q^*\\right) \\quad [\\text{W/m}^2]$$", styles["Formula"]))
    story.append(Paragraph("Where $\\beta_{wet}$ is the moisture availability factor ($0.0 \\le \\beta_{wet} \\le 1.0$), and $f_{water}$ represents open water bodies with direct potential evaporation.", styles["Body"]))

    story.append(Paragraph("<b>4. Fabric Storage Heat Flux ($\\Delta Q_s$):</b>", styles["H3"]))
    story.append(Paragraph("$$\\Delta Q_s = C_{storage} \\cdot Q^*, \\quad C_{storage} = 0.35 f_{imperv} + 0.15 f_{veg} + 0.08 f_{water}$$", styles["Formula"]))
    story.append(Paragraph("Derived from the Grimmond & Oke Objective Hysteresis Model (OHM). Impervious urban fabric (concrete, asphalt) stores high thermal energy ($35\\%$ of $Q^*$), while vegetation and water store low energy ($15\\%$ and $8\\%$).", styles["Body"]))

    story.append(Paragraph("<b>4.2 Vectorized Newton-Raphson Numerical Equilibrium Solver</b>", styles["H2"]))
    story.append(Paragraph(
        "The non-linear energy balance residual $F(T_s) = Q^*(T_s) + Q_f - [Q_h(T_s) + Q_e(T_s) + \\Delta Q_s(T_s)] = 0$ "
        "is solved via analytical Newton-Raphson iterations:",
        styles["Body"]
    ))
    story.append(Paragraph("$$T_s^{(k+1)} = T_s^{(k)} - \\frac{F(T_s^{(k)})}{F'(T_s^{(k)})}, \\quad F'(T_s) = \\frac{\\partial Q^*}{\\partial T_s} - \\left( \\frac{\\partial Q_h}{\\partial T_s} + \\frac{\\partial Q_e}{\\partial T_s} + \\frac{\\partial \\Delta Q_s}{\\partial T_s} \\right)$$", styles["Formula"]))
    story.append(Paragraph(
        "Where $\\frac{\\partial Q^*}{\\partial T_s} = -4 \\epsilon \\sigma T_s^3$, $\\frac{\\partial Q_h}{\\partial T_s} = \\frac{\\rho c_p}{r_a}$, "
        "and $\\frac{\\partial Q_e}{\\partial T_s} = 0.6 (f_{veg}\\beta_{wet} + f_{water}) \\frac{\\partial Q^*}{\\partial T_s}$. "
        "The solver terminates when $|\\Delta T_s| < 10^{-4}\\text{ K}$, converging reliably within <b>4 to 7 iterations</b> across the entire 2D grid matrix.",
        styles["Body"]
    ))

    story.append(PageBreak())

    # =========================================================================
    # CHAPTER 5: PARAMETERIZED INTERVENTIONS & RESOURCE ACCOUNTING
    # =========================================================================
    story.append(Paragraph("5. Parameterized Intervention Engine & Resource Accounting", styles["H1"]))
    story.append(HRFlowable(width="100%", thickness=1, color=c_secondary, spaceBefore=2, spaceAfter=8))
    
    story.append(Paragraph(
        "Urban cooling interventions physically modify grid cell surface properties and induce capital cost (CapEx), "
        "annual water demand ($m^3/yr$), and land footprint requirements:",
        styles["Body"]
    ))
    
    int_matrix = [
        [Paragraph("<b>Intervention Modality</b>", styles["TableHeader"]), Paragraph("<b>Physical Mechanism</b>", styles["TableHeader"]), Paragraph("<b>Unit CapEx</b>", styles["TableHeader"]), Paragraph("<b>Annual Water</b>", styles["TableHeader"]), Paragraph("<b>Thermal Cooling Role</b>", styles["TableHeader"])],
        [Paragraph("Green Roofs (Extensive)", styles["TableCellBold"]), Paragraph("↑ $f_{veg}$, ↑ $Q_e$, ↓ $\\Delta Q_s$", styles["TableCellCode"]), Paragraph("$75 / m²", styles["TableCellBold"]), Paragraph("450 L/m²/yr", styles["TableCell"]), Paragraph("Latent cooling & stomatal evapotranspiration", styles["TableCell"])],
        [Paragraph("Cool Roofs (High Albedo)", styles["TableCellBold"]), Paragraph("↑ Albedo ($\\Delta\\alpha = +0.40$)", styles["TableCellCode"]), Paragraph("$18 / m²", styles["TableCellBold"]), Paragraph("0 L/m²/yr", styles["TableCellBold"]), Paragraph("Solar shortwave reflection, zero water consumption", styles["TableCell"])],
        [Paragraph("Urban Tree Canopy", styles["TableCellBold"]), Paragraph("↑ $f_{veg}$, ↑ Shading, ↓ $S_\\downarrow$", styles["TableCellCode"]), Paragraph("$35 / m²", styles["TableCellBold"]), Paragraph("600 L/m²/yr", styles["TableCell"]), Paragraph("Ground shading & microclimate transpiration", styles["TableCell"])],
        [Paragraph("Reflective Pavements", styles["TableCellBold"]), Paragraph("↑ Albedo ($\\Delta\\alpha = +0.20$)", styles["TableCellCode"]), Paragraph("$22 / m²", styles["TableCellBold"]), Paragraph("0 L/m²/yr", styles["TableCellBold"]), Paragraph("Reflects street canyon shortwave radiation", styles["TableCell"])],
        [Paragraph("Urban Water Features", styles["TableCellBold"]), Paragraph("↑ $f_{water}$, Direct $Q_e$", styles["TableCellCode"]), Paragraph("$120 / m²", styles["TableCellBold"]), Paragraph("1,200 L/m²/yr", styles["TableCell"]), Paragraph("Direct evaporative microclimate cooling sink", styles["TableCell"])],
    ]
    t_int = Table(int_matrix, colWidths=[115, 110, 65, 80, 162])
    t_int.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), c_primary),
        ("GRID", (0, 0), (-1, -1), 0.5, c_border),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, c_light_bg]),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t_int)
    
    story.append(Paragraph("<b>5.1 Physical Property Transformations in Grid Cells</b>", styles["H2"]))
    story.append(Paragraph("$$\\alpha_{\\text{mod}} = \\text{clip}\\left(\\alpha_{\\text{base}} + f_{bldg} \\cdot \\Delta\\alpha_{\\text{cool}} + (1 - f_{bldg} - f_{water}) \\cdot \\Delta\\alpha_{\\text{pave}}, 0.05, 0.85\\right)$$", styles["Formula"]))
    story.append(Paragraph("$$f_{veg,\\text{mod}} = \\text{clip}\\left(f_{veg,\\text{base}} + f_{bldg} \\cdot \\text{Cov}_{\\text{green}} + \\Delta f_{\\text{tree}}, 0.0, 1.0\\right)$$", styles["Formula"]))
    story.append(Paragraph("$$f_{water,\\text{mod}} = \\text{clip}\\left(f_{water,\\text{base}} + \\Delta f_{\\text{water}}, 0.0, 1.0\\right)$$", styles["Formula"]))

    story.append(Paragraph("<b>5.2 Resource Accounting Equations (<code>InterventionEngine</code>)</b>", styles["H2"]))
    story.append(Paragraph("For a study area with total ground footprint $A_{\\text{total}} = 250,000\\text{ m}^2$ ($50 \\times 50$ cells of 10m) and building density $f_{bldg}$:", styles["Body"]))
    story.append(Paragraph("$$\\text{CapEx}(\\$) = A_{bldg}\\left(c_g \\text{Cov}_g + c_c \\text{Cov}_c\\right) + A_{ground}\\left(c_t \\text{Cov}_t + c_p \\text{Cov}_p + c_w \\text{Cov}_w\\right)$$", styles["Formula"]))
    story.append(Paragraph("$$\\text{Water Demand}(\\text{m}^3/\\text{yr}) = \\frac{A_{bldg} \\text{Cov}_g W_g + A_{ground} \\text{Cov}_t W_t + A_{ground} \\text{Cov}_w W_w}{1000}$$", styles["Formula"]))

    story.append(Spacer(1, 10))

    # =========================================================================
    # CHAPTER 6: AI SURROGATE ACCELERATION & SHAP EXPLAINABILITY
    # =========================================================================
    story.append(Paragraph("6. AI Surrogate Model Acceleration & TreeSHAP Explainability", styles["H1"]))
    story.append(HRFlowable(width="100%", thickness=1, color=c_secondary, spaceBefore=2, spaceAfter=8))
    
    story.append(Paragraph(
        "To enable real-time interactive exploration and genetic algorithm sweeps across millions of candidate policy configurations, "
        "UrbanCoolSim trains a high-fidelity <b>LightGBM Regressor</b> directly on physical SEB ground truth:",
        styles["Body"]
    ))
    
    story.append(Paragraph("• <b>Latin Hypercube Sampling (LHS)</b>: 1,200 multi-dimensional sample points spanning morphology ($f_{bldg} \\in [0.15, 0.70]$, $H \\in [5, 45\\text{m}]$, $f_{veg} \\in [0.05, 0.40]$), weather forcing ($T_a \\in [32, 44^\\circ\\text{C}]$, $S_\\downarrow \\in [600, 950\\text{ W/m}^2]$, $u \\in [1, 5\\text{ m/s}]$), and intervention allocations.", styles["Bullet"]))
    story.append(Paragraph("• <b>LightGBM Architecture & Hyperparameters</b>: <code>n_estimators=300, max_depth=6, learning_rate=0.05, num_leaves=31</code>.", styles["Bullet"]))
    story.append(Paragraph("• <b>Benchmark Performance</b>: $R^2 = 0.962$, $\\text{MAE} = 0.085^\\circ\\text{C}$, $\\text{RMSE} = 0.114^\\circ\\text{C}$, inference latency <b>$< 1.8\\text{ ms}$</b> per scenario grid (vs $> 10\\text{ seconds}$ for full SEB iterative sweeps).", styles["Bullet"]))

    story.append(Spacer(1, 4))
    
    # Embed AI Surrogate & SHAP Figure
    fig3_path = "docs/figures/ai_surrogate_shap.png"
    if os.path.exists(fig3_path):
        story.append(Image(fig3_path, width=520, height=218))
        story.append(Paragraph("Figure 3: AI Surrogate Accuracy (R² = 0.962) and Global TreeSHAP Feature Attribution Breakdown", styles["FigCaption"]))
    
    story.append(Paragraph("<b>6.1 TreeSHAP Local & Global Interpretability Formulation</b>", styles["H2"]))
    story.append(Paragraph(
        "UrbanCoolSim computes exact Shapley Additive exPlanations (SHAP) across decision trees:",
        styles["Body"]
    ))
    story.append(Paragraph("$$\\phi_i(x) = \\sum_{S \\subseteq F \\setminus \\{i\\}} \\frac{|S|!(|F| - |S| - 1)!}{|F|!} \\left[ f_x(S \\cup \\{i\\}) - f_x(S) \\right]$$", styles["Formula"]))
    story.append(Paragraph(
        "Decision-makers can inspect exactly how a <b>-3.4°C cooling benefit</b> is partitioned: "
        "Cool Roof Albedo (+42%), Tree Canopy Shading (+31%), Green Roof Evapotranspiration (+19%), and Water Features (+8%).",
        styles["Body"]
    ))

    story.append(PageBreak())

    # =========================================================================
    # CHAPTER 7: NSGA-II MULTI-OBJECTIVE PARETO OPTIMIZATION
    # =========================================================================
    story.append(Paragraph("7. NSGA-II Multi-Objective Optimization & Physics Re-Validation", styles["H1"]))
    story.append(HRFlowable(width="100%", thickness=1, color=c_secondary, spaceBefore=2, spaceAfter=8))
    
    story.append(Paragraph(
        "Urban cooling portfolio design is formulated as a <b>4-dimensional constrained multi-objective optimization problem</b> solved via NSGA-II:",
        styles["Body"]
    ))
    
    story.append(Paragraph("$$\\min_{x \\in \\Omega} \\mathbf{F}(x)$$", styles["Formula"]))
    obj_data = [
        [Paragraph("<b>Component</b>", styles["TableHeader"]), Paragraph("<b>Expression</b>", styles["TableHeader"]), Paragraph("<b>Objective</b>", styles["TableHeader"])],
        [Paragraph("$F_1(x)$", styles["TableCellCode"]), Paragraph("$-\\Delta T_{mean}(x)$", styles["TableCellCode"]), Paragraph("Maximize mean cooling benefit (°C)", styles["TableCell"])],
        [Paragraph("$F_2(x)$", styles["TableCellCode"]), Paragraph("$\\text{CapEx}(x)$", styles["TableCellCode"]), Paragraph("Minimize capital budget ($ USD)", styles["TableCell"])],
        [Paragraph("$F_3(x)$", styles["TableCellCode"]), Paragraph("$\\text{WaterDemand}(x)$", styles["TableCellCode"]), Paragraph("Minimize annual water demand (m³/year)", styles["TableCell"])],
        [Paragraph("$F_4(x)$", styles["TableCellCode"]), Paragraph("$\\text{LandArea}(x)$", styles["TableCellCode"]), Paragraph("Minimize land footprint consumed (m²)", styles["TableCell"])],
    ]
    t_obj = Table(obj_data, colWidths=[60, 150, 322])
    t_obj.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), c_primary),
        ("GRID", (0, 0), (-1, -1), 0.5, c_border),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, c_light_bg]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(Spacer(1, 3))
    story.append(t_obj)
    story.append(Spacer(1, 6))
    story.append(Paragraph("Subject to:", styles["Body"]))
    story.append(Paragraph("$$\\text{CapEx}(x) \\le \\text{Budget}_{\\max}, \\quad \\text{WaterDemand}(x) \\le \\text{Water}_{\\max}, \\quad x_{\\text{green}} + x_{\\text{cool}} \\le 1.0 \\quad \\text{(Rooftop conservation)}$$", styles["Formula"]))

    story.append(Spacer(1, 4))
    
    # Embed Pareto Frontier Figure
    fig4_path = "docs/figures/pareto_frontier.png"
    if os.path.exists(fig4_path):
        story.append(Image(fig4_path, width=480, height=240))
        story.append(Paragraph("Figure 4: NSGA-II Pareto Frontier Trade-Off Space with Annotated Optimal Strategy Solutions", styles["FigCaption"]))

    story.append(Paragraph("<b>7.1 Deterministic Physics Re-Validation Safeguard</b>", styles["H2"]))
    story.append(make_callout(
        "<b>Surrogate Exploitation Safeguard:</b> A recognized vulnerability in AI-accelerated optimization is <i>surrogate exploitation</i>, "
        "where genetic algorithms converge on outlier regions where the ML emulator over-predicts cooling. "
        "UrbanCoolSim eliminates this risk through a mandatory two-stage safeguard:<br/>"
        "1. NSGA-II explores millions of states rapidly using the LightGBM surrogate.<br/>"
        "2. The top candidate Pareto solutions are automatically passed through the <b>deterministic Surface Energy Balance physics solver</b>.<br/>"
        "3. If $|\\Delta T_{\\text{physics}} - \\Delta T_{\\text{surrogate}}| > \\text{Threshold}$, the candidate is flagged and recalibrated.<br/>"
        "4. Only 100% physics-verified solutions are presented to municipal decision-makers.",
        is_warn=False
    ))

    story.append(Spacer(1, 10))

    # =========================================================================
    # CHAPTER 8: OBSERVATIONAL SATELLITE VALIDATION
    # =========================================================================
    story.append(Paragraph("8. Observational Satellite Validation & Ground-Truth Calibration", styles["H1"]))
    story.append(HRFlowable(width="100%", thickness=1, color=c_secondary, spaceBefore=2, spaceAfter=8))
    
    story.append(Paragraph(
        "UrbanCoolSim validates simulated thermal equilibrium fields against high-resolution satellite remote sensing observations "
        "captured during peak summer heat waves (Landsat 8 Collection 2 Level-2 TIRS Band 10 & NASA ECOSTRESS):",
        styles["Body"]
    ))
    
    # Embed Satellite Validation & Diurnal Figures side by side or sequentially
    fig5_path = "docs/figures/satellite_validation.png"
    if os.path.exists(fig5_path):
        story.append(Image(fig5_path, width=480, height=235))
        story.append(Paragraph("Figure 5: Satellite Ground-Truth Calibration Scatter (Landsat 8 TIRS vs Simulated Ts)", styles["FigCaption"]))

    story.append(Paragraph("<b>8.1 Calibration Goodness-of-Fit Metrics (May 18, 2024 Heat Wave)</b>", styles["H2"]))
    
    val_data = [
        [Paragraph("<b>Validation Statistical Metric</b>", styles["TableHeader"]), Paragraph("<b>Achieved Model Fit</b>", styles["TableHeader"]), Paragraph("<b>Scientific Acceptance Standard</b>", styles["TableHeader"])],
        [Paragraph("Coefficient of Determination ($R^2$)", styles["TableCellBold"]), Paragraph("0.973", styles["TableCellBold"]), Paragraph("R² > 0.85 (High microclimate fidelity)", styles["TableCell"])],
        [Paragraph("Mean Absolute Error (MAE)", styles["TableCellBold"]), Paragraph("0.375 °C", styles["TableCellBold"]), Paragraph("MAE < 1.0 °C (Sub-degree precision)", styles["TableCell"])],
        [Paragraph("Root Mean Square Error (RMSE)", styles["TableCellBold"]), Paragraph("0.465 °C", styles["TableCellBold"]), Paragraph("RMSE < 1.5 °C (Exceptional fit)", styles["TableCell"])],
        [Paragraph("Mean Bias Error (MBE)", styles["TableCellBold"]), Paragraph("+0.042 °C", styles["TableCellBold"]), Paragraph("|MBE| < 0.20 °C (Negligible systematic bias)", styles["TableCell"])],
    ]
    t_val = Table(val_data, colWidths=[180, 110, 242])
    t_val.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), c_dark),
        ("GRID", (0, 0), (-1, -1), 0.5, c_border),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, c_light_bg]),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t_val)
    
    story.append(Spacer(1, 4))
    
    fig6_path = "docs/figures/diurnal_profile.png"
    if os.path.exists(fig6_path):
        story.append(Image(fig6_path, width=490, height=215))
        story.append(Paragraph("Figure 6: 24-Hour Diurnal Surface Temperature Profile & Net Mitigation Thermal Zone", styles["FigCaption"]))

    story.append(PageBreak())

    # =========================================================================
    # CHAPTER 9: FRONTEND ARCHITECTURE & THE 11 CORE SCREENS
    # =========================================================================
    story.append(Paragraph("9. Frontend User Experience & The 11 Core Application Screens", styles["H1"]))
    story.append(HRFlowable(width="100%", thickness=1, color=c_secondary, spaceBefore=2, spaceAfter=8))
    
    story.append(Paragraph(
        "The Next.js 14 frontend is architected around two complementary visual worlds: "
        "a <b>warm editorial public storytelling world (<code>/</code>)</b> and an <b>obsidian graphite analytical product world</b> "
        "encompassing 10 specialized decision-support tools:",
        styles["Body"]
    ))
    
    screen_data = [
        [Paragraph("<b>Route</b>", styles["TableHeader"]), Paragraph("<b>Page Title & Purpose</b>", styles["TableHeader"]), Paragraph("<b>Key Interactive Components & Capabilities</b>", styles["TableHeader"])],
        [Paragraph("/", styles["TableCellCode"]), Paragraph("Public Storytelling Landing", styles["TableCellBold"]), Paragraph("Hero 3D canvas, 7-step pipeline narrative, before/after thermal slider, stakeholder personas", styles["TableCell"])],
        [Paragraph("/dashboard", styles["TableCellCode"]), Paragraph("Executive Overview", styles["TableCellBold"]), Paragraph("Asymmetric hero KPI delta, multi-city study switcher, 5-city microclimate summary cards", styles["TableCell"])],
        [Paragraph("/digital-twin", styles["TableCellCode"]), Paragraph("2D/3D Geospatial Twin", styles["TableCellBold"]), Paragraph("Deck.gl raster heatmaps, 3D extruded building envelopes, NASA GIBS 1km overlay, DeckGL controls", styles["TableCell"])],
        [Paragraph("/heat-risk", styles["TableCellCode"]), Paragraph("Heat Vulnerability & Exposure", styles["TableCellBold"]), Paragraph("Demographic HVI matrix, Heat-Health Action Plan tier banners (Yellow/Orange/Red), 4 zones table", styles["TableCell"])],
        [Paragraph("/thermal-analysis", styles["TableCellCode"]), Paragraph("Microclimate Thermal Analysis", styles["TableCellBold"]), Paragraph("Flux component inspection ($Q^*, Q_h, Q_e, \\Delta Q_s$), pixel-level cell probe, thermal histograms", styles["TableCell"])],
        [Paragraph("/intervention-studio", styles["TableCellCode"]), Paragraph("Intervention Studio (Live)", styles["TableCellBold"]), Paragraph("Real-time parameterized sliders with spring physics, live 2D canvas simulation, preset templates", styles["TableCell"])],
        [Paragraph("/scenario-lab", styles["TableCellCode"]), Paragraph("Scenario Comparison Lab", styles["TableCellBold"]), Paragraph("Synchronized dual-map viewport and interactive A/B swipe divider with delta temperature inspection", styles["TableCell"])],
        [Paragraph("/optimization", styles["TableCellCode"]), Paragraph("5-Objective NSGA-II Studio", styles["TableCellBold"]), Paragraph("Objective sliders (ΔT, Cost, Water, HVI, Energy), interactive Pareto 3D/2D scatter, 'Apply to Twin'", styles["TableCell"])],
        [Paragraph("/simulation-results", styles["TableCellCode"]), Paragraph("Diurnal Cycle & TreeSHAP", styles["TableCellBold"]), Paragraph("24-hour diurnal profile curve, cooling modality donut breakdown, HVAC energy & financial ROI", styles["TableCell"])],
        [Paragraph("/validation", styles["TableCellCode"]), Paragraph("Satellite Ground-Truth Fit", styles["TableCellBold"]), Paragraph("Landsat 8 TIRS 1:1 scatter plot, residual error histograms, R², MAE, RMSE calibration cards", styles["TableCell"])],
        [Paragraph("/reports", styles["TableCellCode"]), Paragraph("Decision Reports & Exports", styles["TableCellBold"]), Paragraph("Executive PDF export, 10m microgrid CSV export, vector GeoJSON blueprint with dynamic metadata", styles["TableCell"])],
    ]
    t_screen = Table(screen_data, colWidths=[105, 145, 282])
    t_screen.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), c_primary),
        ("GRID", (0, 0), (-1, -1), 0.5, c_border),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, c_light_bg]),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t_screen)

    story.append(Paragraph("<b>9.1 Design System Tokens & Typography Pairings</b>", styles["H2"]))
    story.append(Paragraph("• <b>Display Headlines:</b> <code>Instrument Serif</code> (Editorial serif for display metrics, executive callouts, and hero statements).", styles["Bullet"]))
    story.append(Paragraph("• <b>UI Navigation & Controls:</b> <code>Plus Jakarta Sans</code> (Clean, geometric grotesk for application navigation, slider labels, and modal interfaces).", styles["Bullet"]))
    story.append(Paragraph("• <b>Precision Coordinates & Formulas:</b> <code>JetBrains Mono</code> (Reserved strictly for bounding boxes, GPS coordinates, equations, and JSON parameters).", styles["Bullet"]))
    story.append(Paragraph("• <b>Theme Palette:</b> Obsidian Graphite (<code>#0d0e11</code>), Surface (<code>#1b1d24</code>), Forest Botanical Green (<code>#15803d</code>), Leaf Green (<code>#22c55e</code>), Controlled Thermal Scale (Sky <code>#0ea5e9</code> $\\to$ Emerald <code>#10b981</code> $\\to$ Amber <code>#f59e0b</code> $\\to$ Orange <code>#ea580c</code> $\\to$ Crimson <code>#dc2626</code>).", styles["Bullet"]))

    story.append(PageBreak())

    # =========================================================================
    # CHAPTER 10: BACKEND ARCHITECTURE & REST API SPECIFICATION
    # =========================================================================
    story.append(Paragraph("10. Backend Architecture & Complete REST API Specification", styles["H1"]))
    story.append(HRFlowable(width="100%", thickness=1, color=c_secondary, spaceBefore=2, spaceAfter=8))
    
    story.append(Paragraph(
        "The backend is built with <b>FastAPI</b>, featuring modular routers, Celery distributed job workers, Redis caching, "
        "and PostgreSQL + PostGIS database persistence with SQLAlchemy 2.0 ORM:",
        styles["Body"]
    ))
    
    api_data = [
        [Paragraph("<b>Method</b>", styles["TableHeader"]), Paragraph("<b>API Endpoint URL</b>", styles["TableHeader"]), Paragraph("<b>Router Module</b>", styles["TableHeader"]), Paragraph("<b>Parameters & Functional Description</b>", styles["TableHeader"])],
        [Paragraph("GET", styles["TableCellBold"]), Paragraph("/health", styles["TableCellCode"]), Paragraph("main.py", styles["TableCell"]), Paragraph("Stack health probe (database, redis, physics solver, AI surrogate)", styles["TableCell"])],
        [Paragraph("POST", styles["TableCellBold"]), Paragraph("/api/v1/auth/register", styles["TableCellCode"]), Paragraph("auth_router.py", styles["TableCell"]), Paragraph("User registration with email, password, and RBAC role (rate limited)", styles["TableCell"])],
        [Paragraph("POST", styles["TableCellBold"]), Paragraph("/api/v1/auth/login", styles["TableCellCode"]), Paragraph("auth_router.py", styles["TableCell"]), Paragraph("OAuth2 password flow returning JWT bearer access token", styles["TableCell"])],
        [Paragraph("GET", styles["TableCellBold"]), Paragraph("/api/v1/digital-twin/study-areas", styles["TableCellCode"]), Paragraph("digital_twin_router.py", styles["TableCell"]), Paragraph("Lists all 5 registered urban archetypes with bounding boxes", styles["TableCell"])],
        [Paragraph("GET", styles["TableCellBold"]), Paragraph("/api/v1/digital-twin/grid", styles["TableCellCode"]), Paragraph("digital_twin_router.py", styles["TableCell"]), Paragraph("Returns 10m spatial grid arrays (albedo, bldg_density, veg, Ts)", styles["TableCell"])],
        [Paragraph("GET", styles["TableCellBold"]), Paragraph("/api/v1/digital-twin/inspect-cell", styles["TableCellCode"]), Paragraph("digital_twin_router.py", styles["TableCell"]), Paragraph("Inspects physical morphology and energy balance of coordinate (x, y)", styles["TableCell"])],
        [Paragraph("POST", styles["TableCellBold"]), Paragraph("/api/v1/thermal/simulate", styles["TableCellCode"]), Paragraph("thermal_router.py", styles["TableCell"]), Paragraph("Executes Newton-Raphson SEB solver across 10m grid (rate limited)", styles["TableCell"])],
        [Paragraph("GET", styles["TableCellBold"]), Paragraph("/api/v1/thermal/diurnal-profile", styles["TableCellCode"]), Paragraph("thermal_router.py", styles["TableCell"]), Paragraph("Calculates 24-hour diurnal temperature cycle for active scenario", styles["TableCell"])],
        [Paragraph("GET", styles["TableCellBold"]), Paragraph("/api/v1/heat-risk/analysis", styles["TableCellCode"]), Paragraph("heat_risk_router.py", styles["TableCell"]), Paragraph("Evaluates Heat Vulnerability Index (HVI) & population exposure tiers", styles["TableCell"])],
        [Paragraph("POST", styles["TableCellBold"]), Paragraph("/api/v1/scenarios", styles["TableCellCode"]), Paragraph("scenarios_router.py", styles["TableCell"]), Paragraph("Creates and persists parameterized urban cooling intervention scenario", styles["TableCell"])],
        [Paragraph("POST", styles["TableCellBold"]), Paragraph("/api/v1/ml/train", styles["TableCellCode"]), Paragraph("surrogate_router.py", styles["TableCell"]), Paragraph("Generates Latin Hypercube samples and trains LightGBM surrogate", styles["TableCell"])],
        [Paragraph("POST", styles["TableCellBold"]), Paragraph("/api/v1/ml/predict", styles["TableCellCode"]), Paragraph("surrogate_router.py", styles["TableCell"]), Paragraph(r"Sub-2ms inference of cooling delta ($\Delta T$) from feature dict", styles["TableCell"])],
        [Paragraph("POST", styles["TableCellBold"]), Paragraph("/api/v1/ml/explain", styles["TableCellCode"]), Paragraph("surrogate_router.py", styles["TableCell"]), Paragraph("Computes local & global TreeSHAP feature contribution values", styles["TableCell"])],
        [Paragraph("POST", styles["TableCellBold"]), Paragraph("/api/v1/optimization/run", styles["TableCellCode"]), Paragraph("optimization_router.py", styles["TableCell"]), Paragraph("Runs NSGA-II Pareto optimization with physics re-validation safeguard", styles["TableCell"])],
        [Paragraph("POST", styles["TableCellBold"]), Paragraph("/api/v1/validation/run", styles["TableCellCode"]), Paragraph("validation_router.py", styles["TableCell"]), Paragraph("Calculates statistical fit (R², MAE, RMSE) against Landsat 8 TIRS LST", styles["TableCell"])],
        [Paragraph("POST", styles["TableCellBold"]), Paragraph("/api/v1/reports/generate", styles["TableCellCode"]), Paragraph("reports_router.py", styles["TableCell"]), Paragraph("Generates executive decision report in Markdown and PDF format", styles["TableCell"])],
        [Paragraph("GET", styles["TableCellBold"]), Paragraph("/api/v1/reports/{id}/pdf", styles["TableCellCode"]), Paragraph("reports_router.py", styles["TableCell"]), Paragraph("Downloads compiled executive decision PDF report document", styles["TableCell"])],
        [Paragraph("GET", styles["TableCellBold"]), Paragraph("/api/v1/jobs/{job_id}", styles["TableCellCode"]), Paragraph("jobs_router.py", styles["TableCell"]), Paragraph("Tracks asynchronous background job progress and completion status", styles["TableCell"])],
    ]
    t_api = Table(api_data, colWidths=[55, 175, 110, 192])
    t_api.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), c_dark),
        ("GRID", (0, 0), (-1, -1), 0.5, c_border),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, c_light_bg]),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t_api)

    story.append(Paragraph("<b>10.1 Database Entity Relationship Architecture</b>", styles["H2"]))
    story.append(Paragraph(
        "The relational schema enforces strict foreign key integrity: <code>User</code> $\\to$ <code>Project</code> $\\to$ <code>StudyArea</code> $\\to$ <code>Scenario</code> $\\to$ <code>SimulationJob</code> $\\to$ <code>SimulationResult</code>. "
        "All tables use UUID primary keys, timestamp audit fields, and JSON storage for multidimensional parameter payloads.",
        styles["Body"]
    ))

    story.append(PageBreak())

    # =========================================================================
    # CHAPTER 11: SECURITY, RESOURCE BOUNDS & AUDIT REMEDIATION
    # =========================================================================
    story.append(Paragraph("11. Security, Resource Bounds & System Audit Remediation", styles["H1"]))
    story.append(HRFlowable(width="100%", thickness=1, color=c_secondary, spaceBefore=2, spaceAfter=8))
    
    story.append(Paragraph(
        "A rigorous, multi-layer security and quality audit was conducted across the platform. All identified vulnerabilities, "
        "performance bottlenecks, and UI inconsistencies were remediated across 6 coordinated fix batches:",
        styles["Body"]
    ))
    
    audit_data = [
        [Paragraph("<b>Batch</b>", styles["TableHeader"]), Paragraph("<b>Audit Focus Area</b>", styles["TableHeader"]), Paragraph("<b>Remediation Implemented & Verified</b>", styles["TableHeader"])],
        [Paragraph("Batch 1", styles["TableCellBold"]), Paragraph("Core Security & Input Hardening", styles["TableCellBold"]), Paragraph("Added sliding-window rate limiting on CPU endpoints; strict Pydantic field bounds (wind > 0.1 m/s, pop_size <= 200, n_gen <= 100); zero-division wind clamp.", styles["TableCell"])],
        [Paragraph("Batch 2", styles["TableCellBold"]), Paragraph("React State & Geometry Fixes", styles["TableCellBold"]), Paragraph("Fixed 3D building footprint cache reset when switching study areas; city-aware canvas geometry for non-radial cities; dynamic GeoJSON export metadata binding.", styles["TableCell"])],
        [Paragraph("Batch 3", styles["TableCellBold"]), Paragraph("Dependency Upgrades & CVEs", styles["TableCellBold"]), Paragraph("Upgraded Next.js to >=14.2.35 resolving SSRF & DoS advisories (GHSA-c4j6-fc7j-m34r, GHSA-m99w-x7hq-7vfj); pruned unused deadweight packages (gsap, lenis).", styles["TableCell"])],
        [Paragraph("Batch 4", styles["TableCellBold"]), Paragraph("Performance & Code Splitting", styles["TableCellBold"]), Paragraph("Added GZipMiddleware in FastAPI; implemented dynamic imports (`next/dynamic`) for heavy maps and charts (initial dashboard bundle reduced from 669 kB to 144 kB).", styles["TableCell"])],
        [Paragraph("Batch 5", styles["TableCellBold"]), Paragraph("Visual Hierarchy & Design Polish", styles["TableCellBold"]), Paragraph("Replaced uniform 4-card grids with asymmetrical hero KPI layouts; removed unmapped decorative dots; unified editorial headline typography across all screens.", styles["TableCell"])],
        [Paragraph("Batch 6", styles["TableCellBold"]), Paragraph("Interaction & Spring Physics", styles["TableCellBold"]), Paragraph("Integrated spring-eased numerical counters (`AnimatedCounter`) on intervention sliders and Pareto solutions with strict `prefers-reduced-motion` compliance.", styles["TableCell"])],
    ]
    t_aud = Table(audit_data, colWidths=[65, 145, 322])
    t_aud.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), c_primary),
        ("GRID", (0, 0), (-1, -1), 0.5, c_border),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, c_light_bg]),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t_aud)

    story.append(Paragraph("<b>11.1 Security & Integrity Guarantees</b>", styles["H2"]))
    story.append(Paragraph("• <b>Zero Physics Alteration:</b> All fundamental equations in the Surface Energy Balance solver, Newton-Raphson iteration, LightGBM surrogate, and NSGA-II optimizer remained 100% mathematically intact during remediation.", styles["Bullet"]))
    story.append(Paragraph("• <b>Non-Root Container Privilege:</b> Both backend and frontend Docker containers execute under unprivileged dedicated non-root users (<code>appuser</code> UID 1000 and <code>nextjs</code> UID 1001).", styles["Bullet"]))
    story.append(Paragraph("• <b>Resource Quota Enforcement:</b> Real-time HTTP simulations are bounded to $100 \\times 100$ grid cells, with larger district-scale simulations queued asynchronously via Celery.", styles["Bullet"]))

    story.append(Spacer(1, 10))

    # =========================================================================
    # CHAPTER 12: OPERATIONAL RUNBOOK & INSTALLATION
    # =========================================================================
    story.append(Paragraph("12. Installation, Verification & Operational Runbook", styles["H1"]))
    story.append(HRFlowable(width="100%", thickness=1, color=c_secondary, spaceBefore=2, spaceAfter=8))
    
    story.append(Paragraph("<b>12.1 Docker Compose Deployment (Recommended Full Stack)</b>", styles["H2"]))
    story.append(make_code_box("""# 1. Clone repository & navigate to root
git clone https://github.com/your-org/UrbanCoolSim.git
cd UrbanCoolSim

# 2. Build and spin up the 5-container stack in detached mode
docker-compose up --build -d

# 3. Check health of all running services
docker-compose ps"""))
    
    story.append(Paragraph("<b>Service URLs:</b> Next.js Spatial UI: <code>http://localhost:3000</code> | FastAPI Swagger Docs: <code>http://localhost:8000/docs</code>", styles["Body"]))

    story.append(Paragraph("<b>12.2 Local Development Launch & Testing</b>", styles["H2"]))
    story.append(make_code_box("""# Backend Setup & Unit Testing
cd backend
python -m venv venv
# Windows: .\\venv\\Scripts\\Activate.ps1 | Linux: source venv/bin/activate
pip install -r requirements.txt

# Run complete backend test suite (8 passed, 100%)
$env:PYTHONPATH="."
pytest tests/test_backend.py -v

# Launch FastAPI live reload server
uvicorn app.main:app --reload --port 8000

# Frontend Setup (New Terminal)
cd ../frontend
npm install
npm run dev"""))

    story.append(Paragraph("<b>12.3 Physical Constants & System Notation Reference</b>", styles["H2"]))
    
    const_data = [
        [Paragraph("<b>Symbol</b>", styles["TableHeader"]), Paragraph("<b>Physical Quantity</b>", styles["TableHeader"]), Paragraph("<b>Value & Standard Units</b>", styles["TableHeader"])],
        [Paragraph("$\\sigma$", styles["TableCellCode"]), Paragraph("Stefan-Boltzmann Constant", styles["TableCellBold"]), Paragraph("5.670374419 × 10⁻⁸ W / (m² · K⁴)", styles["TableCell"])],
        [Paragraph("$\\rho c_p$", styles["TableCellCode"]), Paragraph("Volumetric Heat Capacity of Dry Air", styles["TableCellBold"]), Paragraph("1,200.0 J / (m³ · K)", styles["TableCell"])],
        [Paragraph("$\\kappa$", styles["TableCellCode"]), Paragraph("von Kármán Constant", styles["TableCellBold"]), Paragraph("0.40 (dimensionless)", styles["TableCell"])],
        [Paragraph("$\\gamma$", styles["TableCellCode"]), Paragraph("Psychrometric Constant", styles["TableCellBold"]), Paragraph("0.066 kPa / K", styles["TableCell"])],
        [Paragraph("$r_s$", styles["TableCellCode"]), Paragraph("Canopy Stomatal Resistance", styles["TableCellBold"]), Paragraph("100.0 s / m", styles["TableCell"])],
        [Paragraph("$\\epsilon_{\\text{surf}}$", styles["TableCellCode"]), Paragraph("Urban Fabric Surface Emissivity", styles["TableCellBold"]), Paragraph("0.95 (calibrated from ECOSTRESS)", styles["TableCell"])],
    ]
    t_const = Table(const_data, colWidths=[65, 205, 262])
    t_const.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), c_dark),
        ("GRID", (0, 0), (-1, -1), 0.5, c_border),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, c_light_bg]),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t_const)
    
    story.append(Spacer(1, 10))
    story.append(Paragraph("<b>Academic Citation:</b>", styles["H3"]))
    story.append(Paragraph("<i>UrbanCoolSim Engineering Team (2026). UrbanCoolSim: AI-Driven Urban Heat Intelligence, Physics Simulation & Multi-Objective Decision Support Platform. MIT License.</i>", styles["Body"]))

    # Build the document
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"[UrbanCoolSim] Successfully built PDF: {output_pdf_path}")
    return output_pdf_path

if __name__ == "__main__":
    pdf_out = sys.argv[1] if len(sys.argv) > 1 else "UrbanCoolSim_Technical_Documentation.pdf"
    build_pdf_documentation(pdf_out)