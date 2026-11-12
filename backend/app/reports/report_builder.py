import os
import datetime
from typing import Dict, Any, Optional


def _format_metric(value: Any, digits: int = 2, suffix: str = "") -> str:
    """Format a provided metric without inventing defaults for missing evidence."""
    if value is None:
        return "Not provided"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "Not provided"
    if not __import__("math").isfinite(number):
        return "Not provided"
    return f"{number:,.{digits}f}{suffix}"


def _grid_resolution_summary(grid_metadata: Optional[Dict[str, Any]]) -> str:
    """Describe the grid actually used; never imply that a nominal target is actual spacing."""
    if not grid_metadata:
        return "Grid metadata was not attached to this report; effective resolution is not verified here."
    rows = grid_metadata.get("rows")
    cols = grid_metadata.get("cols")
    res_x = grid_metadata.get("effective_resolution_x_m")
    res_y = grid_metadata.get("effective_resolution_y_m")
    effective = grid_metadata.get("resolution_m")
    nominal = grid_metadata.get("nominal_resolution_m")
    parts = []
    if rows and cols:
        parts.append(f"{rows} × {cols} cells")
    if res_x is not None and res_y is not None:
        parts.append(f"effective spacing approximately {float(res_x):.2f} m east-west × {float(res_y):.2f} m north-south")
    elif effective is not None and float(effective) > 0:
        parts.append(f"effective average spacing approximately {float(effective):.2f} m")
    if nominal is not None:
        parts.append(f"nominal target {float(nominal):.2f} m (not guaranteed by the chosen extent/matrix dimensions)")
    if not parts:
        parts.append("effective spacing unavailable")
    crs = grid_metadata.get("grid_coordinate_crs") or grid_metadata.get("crs")
    if crs:
        parts.append(f"grid coordinates {crs}")
    configured = grid_metadata.get("configured_projected_crs")
    if configured:
        parts.append(f"configured projected CRS {configured}; confirm reprojection before treating distances as UTM measurements")
    return "; ".join(parts) + "."

class ReportBuilder:
    """
    Report Builder: Generates technical decision-support reports in Markdown and PDF formats.
    Dynamically binds study area, scenario, and optimization metrics.
    """
    
    @classmethod
    def generate_markdown_report(
        cls,
        study_area_name: str,
        baseline_stats: Optional[Dict[str, float]] = None,
        scenario_stats: Optional[Dict[str, float]] = None,
        optimization_res: Optional[Dict[str, Any]] = None,
        validation_res: Optional[Dict[str, Any]] = None,
        grid_metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        now_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

        base_t = baseline_stats.get("baseline_t_mean") if baseline_stats else None
        scen_t = scenario_stats.get("scenario_t_mean") if scenario_stats else None
        delta_t = baseline_stats.get("delta_t_mean") if baseline_stats else None
        if delta_t is None and base_t is not None and scen_t is not None:
            delta_t = float(base_t) - float(scen_t)

        rec = optimization_res.get("recommended_solution", {}) if optimization_res else {}
        rec = rec if isinstance(rec, dict) else {}
        green_pct = rec.get("green_roof_pct")
        cool_pct = rec.get("cool_roof_pct")
        tree_pct = rec.get("tree_canopy_pct")
        water_pct = rec.get("water_pct")
        cost_usd = rec.get("total_cost_usd")
        water_m3 = rec.get("water_demand_m3")
        val_mae = validation_res.get("mae") if validation_res else None
        val_r2 = validation_res.get("r2") if validation_res else None

        validation_text = (
            f"Internal self-consistency metrics supplied with this report: R² = {_format_metric(val_r2, 4)}, "
            f"MAE = {_format_metric(val_mae, 3, '°C')}. These are not independent satellite-validation metrics."
            if val_r2 is not None or val_mae is not None
            else "No validation result was supplied to this report request; no accuracy score is asserted. Independent Landsat/ECOSTRESS validation is not connected to the active grid path."
        )
        if rec:
            strategy_section = f"""Using the supplied optimization result, the recommended portfolio is:

| Intervention Vector | Coverage Target | Cost Allocation | Resource Footprint |
| :--- | :--- | :--- | :--- |
| **Green Roofs** | {_format_metric(green_pct, 1, '%')} of building roof area | {_format_metric(float(cost_usd) * 0.4, 2, ' USD') if cost_usd is not None else 'Not provided'} | High evapotranspiration |
| **Cool Roofs (Albedo Boost)** | {_format_metric(cool_pct, 1, '%')} of building roof area | {_format_metric(float(cost_usd) * 0.15, 2, ' USD') if cost_usd is not None else 'Not provided'} | Zero water demand |
| **Urban Tree Canopy** | {_format_metric(tree_pct, 1, '%')} of ground area | {_format_metric(float(cost_usd) * 0.30, 2, ' USD') if cost_usd is not None else 'Not provided'} | Shading and moisture |
| **Water Features** | {_format_metric(water_pct, 1, '%')} of surface area | {_format_metric(float(cost_usd) * 0.15, 2, ' USD') if cost_usd is not None else 'Not provided'} | Direct evaporative sink |

The cost allocations above are a report presentation split of the supplied total cost, not independently measured intervention quantities."""
        else:
            strategy_section = "No optimization result was attached to this report request; intervention quantities, Pareto status, costs and water demand are not asserted."

        provenance = (grid_metadata or {}).get("provenance_note", "Grid provenance metadata was not supplied to this report.")
        synthetic_flag = (grid_metadata or {}).get("is_synthetic")
        provenance_status = "Modelled/derived layers are present." if synthetic_flag is True else ("Grid metadata identifies the response as non-synthetic; verify each layer's individual source before interpreting values." if synthetic_flag is False else "Synthetic/observed status was not supplied.")
        grid_resolution = _grid_resolution_summary(grid_metadata)

        md = f"""# UrbanCoolSim Technical Decision-Support Report
**Study Area**: {study_area_name}  
**Date Generated**: {now_str}  
**Platform Version**: v1.0.0 (Physics-Informed Digital Twin)  

---

## Executive Summary
This report summarizes the data actually supplied by the selected simulation and optimization runs. Missing results are labelled as not provided instead of being replaced with sample values.

The product thesis is: **We are not selling a heat map. We are supporting better urban infrastructure decisions.**

### Key Findings
- **Baseline Mean Surface Temperature**: **{_format_metric(base_t, 2, '°C')}**
- **Scenario Mean Surface Temperature**: **{_format_metric(scen_t, 2, '°C')}**
- **Mean Cooling Benefit (baseline minus scenario)**: **{_format_metric(delta_t, 2, '°C')}** (positive values indicate cooling in the thermal API)
- **Estimated Capital Expenditure (CapEx)**: **{_format_metric(cost_usd, 2, ' USD')}**
- **Annual Water Resource Demand**: **{_format_metric(water_m3, 1, ' m³/year')}**
- **Validation**: {validation_text}

---

## 1. Baseline Microclimate & Surface Energy Balance
The physics solver uses the stated surface-energy-balance formulation:

$$Q^* + Q_f = Q_h + Q_e + \\Delta Q_s$$

where $Q^*$ is net radiation, $Q_f$ is anthropogenic heat, $Q_h$ is sensible heat, $Q_e$ is latent heat, and $\\Delta Q_s$ is heat storage. The existence of the equation does not, by itself, establish observational accuracy or conservation residual quality for a particular run.

### Grid Resolution and Provenance
- **Grid geometry**: {grid_resolution}
- **Grid provenance**: {provenance}
- **Data status**: {provenance_status}

---

## 2. Multi-Objective Optimization & Recommended Strategy
{strategy_section}

---

## 3. Model Integrity & Validation
- **Physics solver**: the application includes a Surface Energy Balance solver. Per-run convergence and residual evidence should be supplied by the simulation response before claiming validation.
- **AI surrogate**: a LightGBM model artifact is configured in the backend. No inference-latency or independent accuracy benchmark is asserted unless those metrics are passed into this report.
- **Validation**: {validation_text}

---

## 4. Scientific Assumptions & Limitations
1. *Grid resolution*: {grid_resolution}
2. *Spatial inputs*: the active geospatial path rasterizes bundled GeoJSON and computes modelled thermal fields; observed satellite LST is not loaded in that path.
3. *Interpretation*: population, anthropogenic heat, canopy, and temperature layers must be interpreted according to each layer's provenance metadata. Modelled proxies are not equivalent to independent observations.
"""
        return md

    @classmethod
    def generate_pdf_report(
        cls,
        output_path: str,
        study_area_name: str,
        baseline_stats: Optional[Dict[str, float]] = None,
        scenario_stats: Optional[Dict[str, float]] = None,
        optimization_res: Optional[Dict[str, Any]] = None,
        validation_res: Optional[Dict[str, Any]] = None,
        grid_metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Builds an executive PDF report using ReportLab with dynamic study area and scenario data.
        """
        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.lib import colors
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
        except ImportError:
            raise RuntimeError("ReportLab is required for PDF generation. Install with: pip install reportlab")

        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        doc = SimpleDocTemplate(
            output_path,
            pagesize=letter,
            rightMargin=36,
            leftMargin=36,
            topMargin=36,
            bottomMargin=36
        )

        styles = getSampleStyleSheet()
        
        c_navy = colors.HexColor("#0f172a")
        c_cyan = colors.HexColor("#0891b2")
        c_dark = colors.HexColor("#1e293b")
        c_muted = colors.HexColor("#64748b")
        c_card = colors.HexColor("#f1f5f9")
        c_border = colors.HexColor("#cbd5e1")

        title_style = ParagraphStyle(
            "DocTitle",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            textColor=c_navy,
            spaceAfter=4
        )
        subtitle_style = ParagraphStyle(
            "DocSubtitle",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=c_cyan,
            spaceAfter=12
        )
        h2_style = ParagraphStyle(
            "SectionH2",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=16,
            textColor=c_navy,
            spaceBefore=10,
            spaceAfter=6
        )
        body_style = ParagraphStyle(
            "BodyDark",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=13,
            textColor=c_dark
        )

        now_str = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        
        base_t = baseline_stats.get("baseline_t_mean") if baseline_stats else None
        scen_t = scenario_stats.get("scenario_t_mean") if scenario_stats else None
        delta_t = baseline_stats.get("delta_t_mean") if baseline_stats else None
        if delta_t is None and base_t is not None and scen_t is not None:
            delta_t = float(base_t) - float(scen_t)

        rec = optimization_res.get("recommended_solution", {}) if optimization_res else {}
        rec = rec if isinstance(rec, dict) else {}
        green_pct = rec.get("green_roof_pct")
        cool_pct = rec.get("cool_roof_pct")
        tree_pct = rec.get("tree_canopy_pct")
        water_pct = rec.get("water_pct")
        cost_usd = rec.get("total_cost_usd")
        water_m3 = rec.get("water_demand_m3")
        val_mae = validation_res.get("mae") if validation_res else None
        val_r2 = validation_res.get("r2") if validation_res else None
        grid_resolution = _grid_resolution_summary(grid_metadata)

        story = []

        # 1. Header & Title Block
        story.append(Paragraph("UrbanCoolSim Executive Decision-Support Report", title_style))
        story.append(Paragraph(f"Study Area: <b>{study_area_name}</b> | Generated: {now_str} | Platform v1.0.0", subtitle_style))
        story.append(HRFlowable(width="100%", thickness=1.5, color=c_cyan, spaceBefore=2, spaceAfter=10))

        # 2. Executive Summary
        story.append(Paragraph("Executive Summary", h2_style))
        exec_text = f"This technical decision-support report synthesizes spatial microclimate thermodynamics, " \
                    f"Surface Energy Balance (SEB) physics, AI surrogate inference, and NSGA-II multi-objective " \
                    f"optimization for <b>{study_area_name}</b>.<br/>" \
                    f"<i>Product Thesis: We are not selling a heat map. We are selling better urban infrastructure decisions.</i>"
        story.append(Paragraph(exec_text, body_style))
        story.append(Spacer(1, 10))

        # 3. Key Findings KPI Table
        base_text = _format_metric(base_t, 2, " °C")
        scenario_text = _format_metric(scen_t, 2, " °C")
        delta_text = _format_metric(delta_t, 2, " °C")
        cost_text = _format_metric(cost_usd, 2, " USD")
        water_text = _format_metric(water_m3, 1, " m³/yr")
        validation_text = (
            f"R² = {_format_metric(val_r2, 4)}; MAE = {_format_metric(val_mae, 3, ' °C')} (internal self-consistency only)"
            if val_r2 is not None or val_mae is not None
            else "Not supplied; independent satellite validation is not connected to the active grid path"
        )
        kpi_data = [
            ["Metric", "Baseline", "Scenario", "Net Benefit / Requirement"],
            ["Mean Surface Temperature", base_text, scenario_text, delta_text],
            ["Estimated Implementation CapEx", "Not provided", cost_text, cost_text],
            ["Annual Water Resource Demand", "Not provided", water_text, water_text],
            ["Validation Metrics", "—", _format_metric(val_r2, 4), validation_text],
        ]
        kpi_table = Table(kpi_data, colWidths=[150, 100, 110, 180])
        kpi_table.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), c_navy),
            ("TEXTCOLOR", (0,0), (-1,0), colors.white),
            ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE", (0,0), (-1,-1), 8.5),
            ("GRID", (0,0), (-1,-1), 0.5, c_border),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, c_card]),
            ("TOPPADDING", (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ("LEFTPADDING", (0,0), (-1,-1), 6),
            ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ]))
        story.append(kpi_table)
        story.append(Spacer(1, 10))

        # 4. Surface Energy Balance Physics Section
        story.append(Paragraph("1. Surface Energy Balance Physics Formulation", h2_style))
        seb_desc = f"Grid metadata: {grid_resolution}<br/>" \
                   "<b>Q* + Q_f = Q_h + Q_e + ΔQ_s</b><br/>" \
                   "Where Q* is net radiation, Q_f is anthropogenic heat, Q_h is sensible heat, " \
                   "Q_e is latent evapotranspiration, and ΔQ_s is heat storage. Nominal resolution is not a claim about the effective spacing of this grid."
        story.append(Paragraph(seb_desc, body_style))
        story.append(Spacer(1, 10))

        # 5. Recommended Interventions Table
        story.append(Paragraph("2. Pareto-Optimal Recommended Portfolio (NSGA-II)", h2_style))
        has_optimization = bool(rec)
        portfolio_data = [
            ["Intervention Vector", "Allocation Target", "Est. CapEx", "Resource Footprint"],
            ["Green Roofs", f"{_format_metric(green_pct, 1, '%')} roof coverage", _format_metric(float(cost_usd) * 0.40, 0, " USD") if has_optimization and cost_usd is not None else "Not provided", "High ET Moisture"],
            ["Cool Roofs (High Albedo)", f"{_format_metric(cool_pct, 1, '%')} roof coverage", _format_metric(float(cost_usd) * 0.15, 0, " USD") if has_optimization and cost_usd is not None else "Not provided", "Zero Water Demand"],
            ["Urban Tree Canopy", f"{_format_metric(tree_pct, 1, '%')} ground coverage", _format_metric(float(cost_usd) * 0.30, 0, " USD") if has_optimization and cost_usd is not None else "Not provided", "Shading + Microclimate"],
            ["Water Features", f"{_format_metric(water_pct, 1, '%')} surface coverage", _format_metric(float(cost_usd) * 0.15, 0, " USD") if has_optimization and cost_usd is not None else "Not provided", "Direct Evaporative Sink"],
        ]
        port_table = Table(portfolio_data, colWidths=[150, 130, 110, 150])
        port_table.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), c_navy),
            ("TEXTCOLOR", (0,0), (-1,0), colors.white),
            ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE", (0,0), (-1,-1), 8.5),
            ("GRID", (0,0), (-1,-1), 0.5, c_border),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, c_card]),
            ("TOPPADDING", (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
            ("LEFTPADDING", (0,0), (-1,-1), 6),
            ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ]))
        story.append(port_table)
        story.append(Spacer(1, 10))

        # 6. Model Integrity & Validation
        story.append(Paragraph("3. Model Integrity & Validation", h2_style))
        val_text = (
            f"Provided internal self-consistency metrics: <b>R² = {_format_metric(val_r2, 4)}</b>, "
            f"<b>MAE = {_format_metric(val_mae, 3, ' °C')}</b>. These do not establish independent satellite validation."
            if val_r2 is not None or val_mae is not None
            else "No validation metrics were attached to this report. Independent Landsat/ECOSTRESS validation is not connected to the active grid path."
        )
        story.append(Paragraph(val_text, body_style))
        story.append(Spacer(1, 10))

        # 7. Scientific Integrity Sign-off
        story.append(Paragraph("4. Scientific Assumptions & Provenance Tagging", h2_style))
        grid_note_html = grid_resolution.replace("; ", "; ")
        disclaimer = f"1. Grid spacing: {grid_note_html}<br/>" \
                     "2. Synthetic/modelled layer outputs must not be presented as satellite observations.<br/>" \
                     "3. Surface geometry and thermal-layer provenance should be checked independently; upstream vector acquisition metadata is not embedded in the active grid response."
        story.append(Paragraph(disclaimer, body_style))

        doc.build(story)
        return output_path
