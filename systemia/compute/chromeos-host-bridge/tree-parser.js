export const ADMITTED_PORTS = Object.freeze([18080, 8443]);

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeChecked(node) {
  const values = [
    node?.checked,
    node?.state?.checked,
    node?.state?.checkedState,
  ];
  for (const value of values) {
    if (value === true || value === 'true' || value === 'checked') return true;
    if (value === false || value === 'false' || value === 'unchecked') return false;
  }
  return null;
}

function nodeText(node) {
  return [
    node?.name,
    node?.description,
    node?.value,
    node?.role,
  ].map(text).filter(Boolean).join(' ');
}

function childrenOf(node) {
  if (Array.isArray(node?.children)) return node.children;
  const children = [];
  let child = node?.firstChild || null;
  const seen = new Set();
  while (child && !seen.has(child)) {
    seen.add(child);
    children.push(child);
    child = child.nextSibling || null;
  }
  return children;
}

export function flattenAutomationTree(root, maxNodes = 8000) {
  const rows = [];
  const stack = root ? [{ node: root, parentIndex: -1, depth: 0 }] : [];
  while (stack.length && rows.length < maxNodes) {
    const current = stack.pop();
    const index = rows.length;
    rows.push({
      node: current.node,
      parentIndex: current.parentIndex,
      depth: current.depth,
      text: nodeText(current.node),
    });
    const children = childrenOf(current.node);
    for (let i = children.length - 1; i >= 0; i -= 1) {
      stack.push({ node: children[i], parentIndex: index, depth: current.depth + 1 });
    }
  }
  return { rows, bounded: stack.length === 0 };
}

function subtreeText(rows, ancestorIndex, maxRelativeDepth = 4) {
  if (ancestorIndex < 0 || ancestorIndex >= rows.length) return '';
  const ancestorDepth = rows[ancestorIndex]?.depth ?? 0;
  const chunks = [rows[ancestorIndex]?.text || ''];
  for (let i = ancestorIndex + 1; i < rows.length; i += 1) {
    const depth = rows[i]?.depth ?? 0;
    if (depth <= ancestorDepth) break;
    if (depth <= ancestorDepth + maxRelativeDepth) chunks.push(rows[i]?.text || '');
  }
  return chunks.join(' ');
}

function nearestUnambiguousPortContext(rows, index, admittedPorts) {
  const toggleText = rows[index]?.text || '';
  let cursor = rows[index]?.parentIndex ?? -1;
  for (let hops = 0; cursor >= 0 && hops < 6; hops += 1) {
    const candidate = [toggleText, subtreeText(rows, cursor)].join(' ');
    const matchingPorts = admittedPorts.filter((port) =>
      new RegExp('\\b' + port + '\\b').test(candidate)
    );
    if (matchingPorts.length === 1) {
      return { context: candidate, port: matchingPorts[0] };
    }
    cursor = rows[cursor]?.parentIndex ?? -1;
  }
  return { context: toggleText, port: null };
}

function roleLooksToggle(role) {
  const normalized = text(role).toLowerCase();
  return ['switch', 'togglebutton', 'toggle_button', 'checkbox', 'check_box'].includes(normalized);
}

function looksLikePortForwardingSettingsUrl(value) {
  const url = text(value).toLowerCase();
  return (
    url.startsWith('chrome://os-settings/') &&
    url.includes('crostini') &&
    url.includes('portforward')
  );
}

function subtreeRows(rows, ancestorIndex) {
  if (ancestorIndex < 0 || ancestorIndex >= rows.length) return [];
  const ancestorDepth = rows[ancestorIndex]?.depth ?? 0;
  const result = [rows[ancestorIndex]];
  for (let i = ancestorIndex + 1; i < rows.length; i += 1) {
    const depth = rows[i]?.depth ?? 0;
    if (depth <= ancestorDepth) break;
    result.push(rows[i]);
  }
  return result;
}

function structuralSurfaceCandidate(rows, index, admittedPorts) {
  const subtree = subtreeRows(rows, index);
  if (!subtree.length) return null;

  const textBlob = subtree.map((row) => row.text).join(' ');
  const ports = admittedPorts.filter((port) =>
    new RegExp('\\b' + port + '\\b').test(textBlob)
  );
  if (ports.length !== admittedPorts.length) return null;

  const toggleCount = subtree.filter((row) =>
    roleLooksToggle(row.node?.role) ||
    /activate port/i.test(row.text)
  ).length;
  if (toggleCount < admittedPorts.length) return null;

  return {
    index,
    node: rows[index].node,
    node_count: subtree.length,
    toggle_count: toggleCount,
  };
}

export function locatePortForwardingSurface(
  root,
  admittedPorts = ADMITTED_PORTS,
) {
  const { rows, bounded } = flattenAutomationTree(root);

  const urlCandidates = rows
    .map((row, index) => ({
      row,
      index,
      url:
        row.node?.url ||
        row.node?.documentUrl ||
        row.node?.document_url ||
        '',
    }))
    .filter(({ url }) => looksLikePortForwardingSettingsUrl(url))
    .map(({ index }) => structuralSurfaceCandidate(rows, index, admittedPorts))
    .filter(Boolean)
    .sort((a, b) => a.node_count - b.node_count);

  if (urlCandidates.length) {
    const best = urlCandidates[0];
    const equallySpecific = urlCandidates.filter(
      (candidate) => candidate.node_count === best.node_count,
    );
    if (equallySpecific.length === 1) {
      return {
        ok: true,
        root: best.node,
        reason: 'target_url',
        bounded,
        candidate_count: urlCandidates.length,
        selected_node_count: best.node_count,
      };
    }
    return {
      ok: false,
      root: null,
      reason: 'ambiguous_target_url_candidates',
      bounded,
      candidate_count: equallySpecific.length,
      selected_node_count: null,
    };
  }

  const structural = rows
    .map((_row, index) => structuralSurfaceCandidate(rows, index, admittedPorts))
    .filter(Boolean)
    .sort((a, b) => a.node_count - b.node_count);

  if (!structural.length) {
    return {
      ok: false,
      root: null,
      reason: 'surface_not_found',
      bounded,
      candidate_count: 0,
      selected_node_count: null,
    };
  }

  const best = structural[0];
  const equallySpecific = structural.filter(
    (candidate) => candidate.node_count === best.node_count,
  );
  if (equallySpecific.length !== 1) {
    return {
      ok: false,
      root: null,
      reason: 'ambiguous_structural_candidates',
      bounded,
      candidate_count: equallySpecific.length,
      selected_node_count: null,
    };
  }

  return {
    ok: true,
    root: best.node,
    reason: 'smallest_structural_surface',
    bounded,
    candidate_count: structural.length,
    selected_node_count: best.node_count,
  };
}

export function extractPortForwardingState(
  root,
  admittedPorts = ADMITTED_PORTS,
  { expectedSurface = false } = {},
) {
  const { rows, bounded } = flattenAutomationTree(root);
  const languageHintObserved = rows.some((row) =>
    /port forwarding/i.test(row.text) ||
    /activate port/i.test(row.text)
  );
  const surfaceObserved = expectedSurface || languageHintObserved;

  const findings = new Map();
  let toggleCandidates = 0;
  let unmatchedToggleCandidates = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const toggleLike =
      roleLooksToggle(row.node?.role) ||
      /activate port/i.test(row.text);
    if (!toggleLike) continue;
    toggleCandidates += 1;

    const { context, port } = nearestUnambiguousPortContext(
      rows,
      index,
      admittedPorts,
    );
    if (port === null) {
      unmatchedToggleCandidates += 1;
      continue;
    }
    const checked = normalizeChecked(row.node);
    const disabled = Boolean(
      row.node?.state?.disabled === true ||
      row.node?.restriction === 'disabled'
    );
    findings.set(port, {
      port,
      protocol: /\bUDP\b/i.test(context) ? 'UDP' : 'TCP',
      present: true,
      enabled: checked,
      disabled,
      evidence: 'automation_accessibility_tree',
    });
  }

  return {
    settings_surface_observed: surfaceObserved,
    nodes_examined: rows.length,
    bounded,
    diagnostics: {
      toggle_candidates: toggleCandidates,
      matched_ports: findings.size,
      unmatched_toggle_candidates: unmatchedToggleCandidates,
      raw_tree_persisted: false,
      surface_asserted_by_caller: expectedSurface === true,
      language_hint_observed: languageHintObserved,
    },
    ports: admittedPorts.map((port) => findings.get(port) || {
      port,
      protocol: 'TCP',
      present: false,
      enabled: null,
      disabled: null,
      evidence: surfaceObserved
        ? 'port_row_not_observed'
        : 'settings_surface_not_observed',
    }),
  };
}
