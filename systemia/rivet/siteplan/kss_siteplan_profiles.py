"""KSS site-plan rendering configuration registry.

Architecture:
canonical site model -> compliance mode -> client profile -> equipment pack -> deliverable recipe

This module intentionally contains presentation/compliance configuration only.
Evidence truth, geometry, provenance, and source/proposed semantics remain owned by the
site-plan engine and cannot be overridden here.
"""
from copy import deepcopy

ENGINE_VERSION = "KSS-SITEPLAN-ENGINE-v3.0-semantic-layout"

LAYOUT_PROFILES = {
    "semantic_sheet_v2": {
        "id": "semantic_sheet_v2",
        "version": "2.1.0",
        "label": "KSS Semantic Sheet Layout",
        "title_block": {
            "rule_to_label_gap_pt": 12.0,
            "label_to_value_gap_pt": 9.0,
            "row_bottom_padding_pt": 9.0,
            "cell_left_padding_pt": 8.0,
            "cell_right_padding_pt": 8.0,
            "label_font_pt": 6.4,
            "value_font_pt": 7.2,
            "value_leading_pt": 8.6,
            "min_font_pt": 5.0,
            "drawing_label_font_pt": 6.4,
            "drawing_value_font_pt": 9.2,
            "drawing_value_leading_pt": 10.4,
        },
        "qa": {
            "collision_policy": "block_release",
            "overflow_policy": "reflow",
            "min_rule_to_label_gap_pt": 10.0,
            "min_label_to_value_gap_pt": 6.0,
            "min_render_font_pt": 5.0,
            "human_screenshot_overrides_machine_pass": True,
        },
        "notes": "Semantic layout contract shared by KSS renderers. Presentation coordinates are derived from component spacing rules instead of being hand-tuned per artifact. v2.1 raises title-block label/value typography for mobile and raster review legibility without changing geometry.",
    },
}

COMPLIANCE_MODES = {
    "generic_preliminary": {
        "id": "generic_preliminary",
        "version": "0.1",
        "label": "Generic Preliminary EV Site Plan",
        "authority": "Kennedy Space Station generic preliminary site-planning standard",
        "reference_sha256": "",
        "reference_drive_id": "",
        "required_semantics": ["existing", "proposed", "field_verify"],
        "required_artifacts": ["site_plan", "area_context"],
        "requires_reference_qa": False,
        "project_label": "GENERIC PRELIMINARY EV SITE PLAN",
        "site_plan_header": "PRELIMINARY EV SITE PLAN / PROPOSED CHARGING LAYOUT",
        "area_map_header": "AREA CONTEXT / ROAD NETWORK",
        "reference_label": "GENERIC",
        "site_drawing_name": "EV SITE PLAN",
        "area_drawing_name": "AREA CONTEXT",
        "required_notes": [
            "PRELIMINARY - NOT FOR CONSTRUCTION",
            "FINAL ADA / ELECTRICAL / UTILITY DESIGN REQUIRES PROJECT-SPECIFIC ENGINEERING",
        ],
        "program_rules": {
            "amenity_reference_radius_ft": None,
            "site_and_area_map_may_span_multiple_pages_for_clarity": True,
        },
    },
    "vdot_nevi_va": {
        "id": "vdot_nevi_va",
        "version": "1.1-reference-plus",
        "label": "Virginia VDOT NEVI Phase 2",
        "authority": "VDOT RFA-126110 Q&A Addendum 1 and attached site/area-map example",
        "reference_sha256": "9b48405064b2cf3cd5d58336d9fef9f16f0db58920fb969a399cab4bd71716cb",
        "reference_drive_id": "1SvwBiV8dyLqSDf7yv67rXmB3u34eqs6W",
        "required_semantics": ["existing", "new_proposed", "field_verify"],
        "required_artifacts": ["site_plan", "area_map"],
        "requires_reference_qa": True,
        "project_label": "VDOT NEVI PHASE 2",
        "site_plan_header": "PRELIMINARY EV PLOT PLAN / PROPOSED CHARGING LAYOUT",
        "area_map_header": "VDOT AREA MAP / ROAD CONTEXT",
        "reference_label": "VDOT RFA-126110",
        "site_drawing_name": "EV PLOT PLAN",
        "area_drawing_name": "AREA MAP / ROAD CONTEXT",
        "required_notes": [
            "PRELIMINARY - NOT FOR CONSTRUCTION",
            "PARKING / ADA DIMENSIONS SUBJECT TO LOCAL, STATE AND PROJECT DESIGN REQUIREMENTS",
            "UTILITY TIE-IN AND UNDERGROUND ROUTING REQUIRE PROJECT-SPECIFIC COORDINATION",
        ],
        "program_rules": {
            "amenity_reference_radius_ft": 528,
            "site_and_area_map_may_span_multiple_pages_for_clarity": True,
        },
    },
}

CLIENT_PROFILES = {
    "neutral": {
        "id": "neutral",
        "version": "0.1",
        "label": "Neutral Engineering Presentation",
        "organization": "",
        "studio_credit": "Kennedy Space Station | Evercraft Site Planning + Spatial Engineering",
        "title_block_brand": "",
        "drawing_language": "engineering_grayscale",
        "note_overrides": {},
        "allowed_equipment_packs": ["generic_ev"],
    },
    "rivet_kss": {
        "id": "rivet_kss",
        "version": "1.0",
        "label": "RIVET / Kennedy Space Station",
        "organization": "RIVET",
        "studio_credit": "Kennedy Space Station | Evercraft Site Planning + Spatial Engineering",
        "title_block_brand": "RIVET",
        "drawing_language": "engineering_grayscale",
        "note_overrides": {},
        "allowed_equipment_packs": ["generic_ev"],
    },
}

EQUIPMENT_PACKS = {
    "generic_ev": {
        "id": "generic_ev",
        "version": "0.2",
        "label": "Generic EV Fast-Charging Coordination Pack",
        "vendor": None,
        "evse": {
            "family": "dual-port fast charging",
            "power_kw": None,
            "ports_per_dispenser": 2,
        },
        "modules": [
            "charging_stall",
            "ada_charging_stall",
            "access_aisle",
            "accessible_route",
            "evse_dispenser",
            "signage",
            "lighting",
            "converter_or_power_cabinet",
            "switchgear",
            "transformer_concept",
            "vehicle_protection",
        ],
        "final_design_fields": [
            "exact_equipment_model",
            "utility_service_voltage",
            "transformer_capacity",
            "protection_settings",
            "working_clearances",
            "foundation_and_anchorage",
        ],
    },
}

DELIVERABLE_RECIPES = {
    "two_sheet_site_area": {
        "id": "two_sheet_site_area",
        "version": "0.1",
        "sheets": [
            {"role": "site_plan", "sheet": "S-0"},
            {"role": "area_context", "sheet": "A-0"},
        ],
        "package": "individual_pdfs_plus_founder_review_pair",
    },
}

DEFAULT_CONFIGURATION = {
    "compliance_mode": "vdot_nevi_va",
    "client_profile": "rivet_kss",
    "equipment_pack": "generic_ev",
    "deliverable_recipe": "two_sheet_site_area",
    "layout_profile": "semantic_sheet_v2",
}

def resolve_configuration(compliance_mode=None, client_profile=None, equipment_pack=None, deliverable_recipe=None, layout_profile=None):
    ids = {
        "compliance_mode": compliance_mode or DEFAULT_CONFIGURATION["compliance_mode"],
        "client_profile": client_profile or DEFAULT_CONFIGURATION["client_profile"],
        "equipment_pack": equipment_pack or DEFAULT_CONFIGURATION["equipment_pack"],
        "deliverable_recipe": deliverable_recipe or DEFAULT_CONFIGURATION["deliverable_recipe"],
        "layout_profile": layout_profile or DEFAULT_CONFIGURATION["layout_profile"],
    }
    mode = deepcopy(COMPLIANCE_MODES[ids["compliance_mode"]])
    client = deepcopy(CLIENT_PROFILES[ids["client_profile"]])
    equipment = deepcopy(EQUIPMENT_PACKS[ids["equipment_pack"]])
    recipe = deepcopy(DELIVERABLE_RECIPES[ids["deliverable_recipe"]])
    layout = deepcopy(LAYOUT_PROFILES[ids["layout_profile"]])
    allowed = client.get("allowed_equipment_packs") or []
    if allowed and equipment["id"] not in allowed:
        raise ValueError(f"Equipment pack {equipment['id']} is not permitted by client profile {client['id']}")
    return {
        "engine_version": ENGINE_VERSION,
        "compliance_mode": mode,
        "client_profile": client,
        "equipment_pack": equipment,
        "deliverable_recipe": recipe,
        "layout_profile": layout,
    }
