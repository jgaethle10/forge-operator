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

export function extractPortForwardingState(root, admittedPorts = ADMITTED_PORTS) {
  const { rows, bounded } = flattenAutomationTree(root);
  const surfaceObserved = rows.some((row) =>
    /port forwarding/i.test(row.text) ||
    /activate port/i.test(row.text)
  );

  const findings = new Map();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const toggleLike =
      roleLooksToggle(row.node?.role) ||
      /activate port/i.test(row.text);
    if (!toggleLike) continue;

    const { context, port } = nearestUnambiguousPortContext(
      rows,
      index,
      admittedPorts,
    );
    if (port === null) continue;
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
