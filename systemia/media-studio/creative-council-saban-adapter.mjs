const ROLES = new Set([
  'story_architect',
  'cinematography_director',
  'visual_evidence_scout',
  'data_graphics_director',
  'world_builder',
  'edit_rhythm_director',
  'sound_director',
  'brand_art_director',
  'documentary_truth_guard',
  'beauty_judge'
]);

function shotFrom(item) {
  return item?.raw?.shot || item?.shot || item?.raw || {};
}

function subjectLabels(shot) {
  return (shot.coverage || [])
    .map((item) => item.subjectLabel)
    .filter(Boolean);
}

function isWorldIntel(shot) {
  const text = [shot.storyPrompt, shot.intent, ...subjectLabels(shot)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /ship|naval|tank|aircraft|wildfire|hurricane|flood|earthquake|volcano|shipping|satellite|infrastructure|weather|map|global|world/.test(text);
}

function isDataHeavy(shot) {
  const text = [shot.storyPrompt, shot.intent].filter(Boolean).join(' ').toLowerCase();
  return /data|map|timeline|telemetry|chart|route|track|session|utilization|revenue|traffic|tariff|incentive|evidence|report|global|world/.test(text);
}

function proposal(role, shot) {
  const beat = shot.beat || 'coverage';
  const subjects = subjectLabels(shot);
  const worldIntel = isWorldIntel(shot);
  const dataHeavy = isDataHeavy(shot);

  if (role === 'story_architect') {
    return {
      category: 'story',
      directives: [
        `Make the ${beat} legible without relying on a title card.`,
        subjects.length
          ? `Put the named subject visibly on screen: ${subjects.join(', ')}.`
          : 'Anchor the beat in a concrete person, place, product, object or event.',
        'Every shot must change the viewer\'s understanding, not merely restate narration.'
      ],
      reject_if: ['generic_text_only', 'repeated_visual_without_story_progression']
    };
  }

  if (role === 'cinematography_director') {
    const framing =
      beat === 'hook' ? 'hero_wide_then_fast_subject_reveal'
      : beat === 'proof' ? 'detail_or_insert_with_source_context'
      : beat === 'climax' ? 'dynamic_depth_move_with_clear_subject'
      : beat === 'cta' ? 'clean_lockoff_or_product_hero'
      : 'motivated_medium_or_wide_with_depth';
    return {
      category: 'camera',
      framing,
      directives: [
        'Use foreground, subject and background layers where the material allows it.',
        worldIntel
          ? 'Prefer geographic or physical spatial movement over flat card transitions.'
          : 'Use camera motion only when it reveals information or scale.',
        'Avoid endless center-aligned panels floating on a dark background.'
      ],
      reject_if: ['flat_card_sequence', 'unmotivated_zoom', 'subject_too_small_to_read']
    };
  }

  if (role === 'visual_evidence_scout') {
    const missing = (shot.coverage || []).filter((item) => item.status === 'missing');
    return {
      category: 'coverage',
      blocking: missing.length > 0 && shot.sourceType === 'scene',
      needs_asset_acquisition: missing.map((item) => item.subjectId),
      directives: [
        subjects.length
          ? `Required visible subjects: ${subjects.join(', ')}.`
          : 'Verify that the chosen source actually depicts the narrated claim.',
        'Prefer owned, licensed, public-domain or source-grounded real media before synthetic replacement.',
        'Do not let captions substitute for absent physical subject coverage.'
      ],
      reject_if: ['named_subject_not_visible', 'source_claim_mismatch']
    };
  }

  if (role === 'data_graphics_director') {
    return {
      category: 'graphics',
      applicable: dataHeavy,
      directives: dataHeavy
        ? [
            'Use data graphics as spatial evidence: maps, tracks, timelines, counters, overlays or charts attached to the thing they explain.',
            'Keep labels sparse and subordinate to the moving subject.',
            'Animate uncertainty and modeled/observed state explicitly rather than hiding it in fine print.'
          ]
        : ['Do not add decorative data graphics when the story does not need them.'],
      reject_if: ['dashboard_wall_without_story_function', 'unreadable_microtext', 'data_without_source_state']
    };
  }

  if (role === 'world_builder') {
    return {
      category: 'world',
      directives: [
        'Preserve recurring locations, scale, lighting logic and architectural identity across episodes.',
        'Treat the Evercraft studio/world as navigable space rather than a sequence of unrelated backdrops.',
        worldIntel
          ? 'Let displays, rooms or environments become portals into the real-world subject instead of trapping the story inside the set.'
          : 'Keep product scenes physically grounded with believable scale and interaction.'
      ],
      reject_if: ['random_set_reset', 'brand_world_continuity_break']
    };
  }

  if (role === 'edit_rhythm_director') {
    const maxHold = Math.max(1.2, Math.min(4, Number(shot.durationSec || 3)));
    return {
      category: 'edit',
      max_static_hold_sec: Number(maxHold.toFixed(1)),
      directives: [
        'Cut on information change, motion or sound rather than arbitrary timer intervals.',
        beat === 'hook'
          ? 'Front-load the strongest visual fact in the first beat.'
          : 'Enter late and leave early; remove dead frames around the useful action.',
        'Use transitions that preserve spatial or semantic continuity.'
      ],
      reject_if: ['dead_air', 'transition_for_transition_sake', 'same_composition_repeated']
    };
  }

  if (role === 'sound_director') {
    return {
      category: 'sound',
      directives: [
        'Reserve intelligibility space for narration before adding score density.',
        worldIntel
          ? 'Use restrained environmental texture and event-specific effects only when sourced or clearly illustrative.'
          : 'Use tactile product/interface sounds to make actions feel physical.',
        'Build transitions with sound bridges so scene changes feel authored.',
        'Master platform variants consistently instead of normalizing every clip independently.'
      ],
      reject_if: ['music_masks_narration', 'generic_trailer_boom_every_cut', 'unsourced_real_event_audio_presented_as_documentary']
    };
  }

  if (role === 'brand_art_director') {
    return {
      category: 'art_direction',
      directives: [
        'Apply the active Evercraft or product brand kit to typography, lower thirds, charts and transitions.',
        'Typography supports the image; it does not become the image.',
        'Keep one recognizable visual grammar across the episode while allowing each product its own identity.',
        'Avoid generic neon-future UI unless the underlying product or data genuinely calls for it.'
      ],
      reject_if: ['brand_mark_drift', 'fake_ui_masquerading_as_product', 'typewriter_wall']
    };
  }

  if (role === 'documentary_truth_guard') {
    const requiresLabel = (shot.coverage || []).some(
      (item) => item.preferredTreatment === 'documentary_or_verified_visualization'
    );
    return {
      category: 'truth',
      visualization_label_required_if_synthetic: requiresLabel,
      directives: [
        'Observed/source footage, modeled data and synthetic visualization must remain distinguishable.',
        'Never fabricate documentary evidence of a real event.',
        'Carry provenance and evidence state into the final graphics package.'
      ],
      reject_if: ['synthetic_presented_as_evidence', 'modeled_presented_as_observed', 'missing_provenance_state']
    };
  }

  return {
    category: 'beauty',
    directives: [
      'The frame must have a focal point, controlled hierarchy, depth and intentional negative space.',
      'Reject anything that looks like a slide deck, template demo or first-pass AI montage.',
      'Motion must improve comprehension or emotion, not merely prove that something can move.',
      'At least one frame from the shot should be strong enough to use as a still without apology.'
    ],
    reject_if: ['cheap_template_feel', 'visual_clutter', 'no_focal_point', 'generic_ai_montage']
  };
}

export async function runAssignment({ assignment }) {
  const shot = shotFrom(assignment.item);
  const role = assignment.role;
  const findings = [];

  if (!ROLES.has(role)) findings.push('unknown_creative_council_role');
  if (!shot?.id) findings.push('shot_id_missing');
  if (!shot?.storyPrompt) findings.push('story_prompt_missing');
  if (!Number.isFinite(Number(shot?.durationSec)) || Number(shot.durationSec) <= 0) {
    findings.push('shot_duration_missing_or_invalid');
  }
  if (!shot?.aspectRatio) findings.push('aspect_ratio_missing');

  const creativeProposal = ROLES.has(role) ? proposal(role, shot) : null;
  if (creativeProposal?.blocking) findings.push('creative_proposal_blocked');

  return {
    schema: 'evercraft.fallen.creative-council-note.v1',
    status: findings.length ? 'blocked' : 'completed',
    agent_id: assignment.agent_id,
    role,
    shot_id: shot.id || null,
    source_type: shot.sourceType || null,
    source_id: shot.sourceId || null,
    subject_ids: shot.subjectIds || [],
    proposal: creativeProposal,
    findings,
    boundaries: {
      no_provider_call_implied: true,
      no_generated_asset_implied: true,
      no_publication_authority: true,
      no_documentary_claim_from_synthetic_media: true
    }
  };
}

export async function reconcile({ results, plan }) {
  const rows = Array.isArray(results) ? results : [];
  const requiredRoles = new Set(plan?.roles || []);
  const grouped = new Map();

  for (const row of rows) {
    const key = row?.shot_id || 'unknown';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const blueprints = [];
  for (const [shotId, entries] of grouped.entries()) {
    const roles = new Set(entries.map((entry) => entry?.role).filter(Boolean));
    const missingRoles = [...requiredRoles].filter((role) => !roles.has(role));
    const findings = entries.flatMap((entry) => entry?.findings || []);
    const proposals = Object.fromEntries(
      entries
        .filter((entry) => entry?.proposal?.category)
        .map((entry) => [entry.proposal.category, entry.proposal])
    );

    const rejectIf = [
      ...new Set(
        entries.flatMap((entry) => entry?.proposal?.reject_if || [])
      )
    ].sort();

    blueprints.push({
      shot_id: shotId,
      status:
        missingRoles.length || findings.length
          ? 'blocked'
          : 'ready_for_asset_or_provider_routing',
      missing_roles: missingRoles,
      findings,
      creative_genome: proposals,
      rejection_contract: rejectIf
    });
  }

  const blocked = blueprints.filter((item) => item.status === 'blocked');

  return {
    schema: 'evercraft.fallen.creative-council-reconciliation.v1',
    status: blocked.length ? 'blocked' : 'reconciled',
    shot_count: blueprints.length,
    blocked_shot_count: blocked.length,
    blueprints,
    execution_boundary: {
      provider_calls_performed: 0,
      assets_generated: 0,
      next_gate: 'asset_acquisition_or_verified_generation_department'
    }
  };
}
